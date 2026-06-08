import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { firstDayOfMonth } from '@/lib/quotes/period';
import {
  findPreviousQuote,
  fetchAdjustedQuantities,
  fetchAdjustmentAmountSums,
} from '@/lib/quotes/carryForward';
import type { Media, Tier } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 개별 신규 견적 prefill — 이전 달 견적 수량 + Σ 조정 delta(조정 후 수량)를 반환.
 *   GET /api/quotes/prefill?company_id=&sub_company_id=&service_start=YYYY-MM-DD
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '인증되지 않은 사용자' }, { status: 401 });
  }

  const url = new URL(req.url);
  const companyId = url.searchParams.get('company_id');
  const subCompanyId = url.searchParams.get('sub_company_id') || null;
  const serviceStart = url.searchParams.get('service_start');

  if (!companyId || !serviceStart || !/^\d{4}-\d{2}-\d{2}$/.test(serviceStart)) {
    return NextResponse.json(
      { error: 'company_id, service_start(YYYY-MM-DD) 필요' },
      { status: 400 },
    );
  }

  const monthStart = firstDayOfMonth(serviceStart);
  const prev = await findPreviousQuote(supabase, companyId, subCompanyId, monthStart);
  if (!prev) {
    return NextResponse.json({ source: null, items: [], adjust: null });
  }

  const adjusted = await fetchAdjustedQuantities(supabase, [prev.quote_id]);
  const qtyMap = adjusted.get(prev.quote_id) ?? new Map<string, number>();

  const items = Array.from(qtyMap.entries())
    .filter(([, qty]) => qty > 0)
    .map(([key, qty]) => {
      const [media, tier] = key.split('__') as [Media, Tier];
      return { media, tier, quantity: qty };
    });

  // 이전 견적의 금액 조정/할인 필드 (반복 설정은 이월).
  // 단, variable_adjust 는 이전 견적의 조정 정산액 합계(Σ pre_adjust_amount)를 사용 —
  // 이전 견적의 variable_adjust 필드를 그대로 이월하면 정산액이 영구 전파되므로 1회성으로 처리.
  type AdjRow = {
    addon_fee: number;
    fixed_adjust: number;
    extra_discount_rate: number;
    extra_discount_amount: number;
    extra_discount_note: string | null;
  };
  const { data: aRaw } = await supabase
    .from('quotes')
    .select(
      'addon_fee, fixed_adjust, extra_discount_rate, extra_discount_amount, extra_discount_note',
    )
    .eq('id', prev.quote_id)
    .single();
  const a = aRaw as unknown as AdjRow | null;
  const amountSums = await fetchAdjustmentAmountSums(supabase, [prev.quote_id]);
  const adjust = {
    addon_fee: Number(a?.addon_fee ?? 0),
    fixed_adjust: Number(a?.fixed_adjust ?? 0),
    variable_adjust: amountSums.get(prev.quote_id) ?? 0,
    extra_discount_rate: Number(a?.extra_discount_rate ?? 0),
    extra_discount_amount: Number(a?.extra_discount_amount ?? 0),
    extra_discount_note: a?.extra_discount_note ?? '',
  };

  return NextResponse.json({
    source: { quote_no: prev.quote_no, service_start: prev.service_start },
    items,
    adjust,
  });
}
