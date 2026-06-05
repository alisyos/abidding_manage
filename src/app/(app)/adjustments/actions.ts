'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  adjustmentInputSchema,
  type AdjustmentInput,
} from '@/lib/validation/adjustment';
import { calcProRatedDelta } from '@/lib/quotes/dayCount';
import { fetchActivePriceMap, priceKey } from '@/lib/quotes/pricing';
import { computeQuote } from '@/lib/quotes/calculator';
import { firstDayOfMonth } from '@/lib/quotes/period';
import type { Media, Tier, QuoteStatus } from '@/lib/supabase/types';

export interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * 조정 등록: quote_adjustments insert + quotes.variable_adjust 갱신 + 금액 재계산
 * + 견적이 won/paid 면 sales_records 동기화.
 *
 * 이 액션은 메일 발송을 하지 않는다 — 호출 후 클라이언트가 /adjustments/[id]/send 로 이동.
 */
export async function createAdjustment(
  inputRaw: AdjustmentInput,
): Promise<ActionResult<{ id: string; quote_id: string }>> {
  const parsed = adjustmentInputSchema.safeParse(inputRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? '검증 실패' };
  }
  const input = parsed.data;

  const supabase = createClient();

  // 견적 + 항목 + 단가맵 조회
  type QuoteRow = {
    id: string;
    company_id: string;
    sub_company_id: string | null;
    status: QuoteStatus;
    service_start: string;
    service_end: string;
    addon_fee: number;
    fixed_adjust: number;
    variable_adjust: number;
    companies: { account_type: 'advertiser' | 'agency' };
  };
  const { data: qRaw, error: qErr } = await supabase
    .from('quotes')
    .select(
      'id, company_id, sub_company_id, status, service_start, service_end, addon_fee, fixed_adjust, variable_adjust, companies(account_type)',
    )
    .eq('id', input.quote_id)
    .single();
  if (qErr || !qRaw) return { ok: false, error: '견적을 찾을 수 없습니다' };
  const q = qRaw as unknown as QuoteRow;

  type ItemRow = { media: Media; tier: Tier; quantity: number; unit_price: number };
  const { data: itemsRaw } = await supabase
    .from('quote_items')
    .select('media, tier, quantity, unit_price')
    .eq('quote_id', input.quote_id);
  const items = (itemsRaw ?? []) as unknown as ItemRow[];


  const priceMap = await fetchActivePriceMap(supabase);

  // 일할 계산
  const unitPrices = {
    unique: Number(priceMap.get(priceKey(input.media, 'unique'))?.unit_price ?? 0),
    premium: Number(priceMap.get(priceKey(input.media, 'premium'))?.unit_price ?? 0),
    basic: Number(priceMap.get(priceKey(input.media, 'basic'))?.unit_price ?? 0),
    lite: Number(priceMap.get(priceKey(input.media, 'lite'))?.unit_price ?? 0),
  };
  const calc = calcProRatedDelta({
    deltas: {
      unique: input.delta_unique,
      premium: input.delta_premium,
      basic: input.delta_basic,
      lite: input.delta_lite,
    },
    unitPrices,
    serviceStart: q.service_start,
    serviceEnd: q.service_end,
    adjustmentDate: input.adjustment_date,
  });

  // 조정 행 insert (discount_rate 컬럼은 0004 마이그레이션으로 제거됨)
  const { data: insRow, error: insErr } = await supabase
    .from('quote_adjustments')
    .insert({
      quote_id: input.quote_id,
      adjustment_date: input.adjustment_date,
      account_type: q.companies.account_type,
      media: input.media,
      delta_unique: input.delta_unique,
      delta_premium: input.delta_premium,
      delta_basic: input.delta_basic,
      delta_lite: input.delta_lite,
      pre_adjust_amount: calc.preAdjustAmount,
      reason: input.reason || null,
    })
    .select('id')
    .single();
  if (insErr || !insRow) {
    return { ok: false, error: `조정 등록 실패: ${insErr?.message}` };
  }

  // 견적 variable_adjust 갱신 + 금액 재계산
  // 조정 시점에는 이미 발급된 견적의 line_total을 그대로 사용 (할인 적용 여부 보존).
  // 신규 가격 정책 임계값 판정은 견적 생성/수정 시점에만 적용되고,
  // 조정은 variable_adjust 가감만 반영하므로 list_price를 unit_price와 동일하게 둠.
  const newVariableAdjust = Number(q.variable_adjust ?? 0) + calc.preAdjustAmount;
  const recalc = computeQuote(
    items.map((i) => ({
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      list_price: Number(i.unit_price),
    })),
    Number(q.addon_fee ?? 0),
    Number(q.fixed_adjust ?? 0),
    newVariableAdjust,
  );

  const { error: updErr } = await supabase
    .from('quotes')
    .update({
      variable_adjust: newVariableAdjust,
      base_amount: round2(recalc.baseAmount),
      vat_amount: recalc.vatAmount,
      total_amount: round2(recalc.totalAmount),
    })
    .eq('id', input.quote_id);
  if (updErr) return { ok: false, error: `견적 금액 갱신 실패: ${updErr.message}` };

  // 견적이 won/paid 면 sales_records 동기화
  if (q.status === 'won' || q.status === 'paid') {
    await supabase
      .from('sales_records')
      .update({
        revenue_month: firstDayOfMonth(q.service_start),
        base_amount: round2(recalc.baseAmount),
        variable_adjust: newVariableAdjust,
        total_amount: round2(recalc.totalAmount),
      })
      .eq('quote_id', input.quote_id);
  }

  revalidatePath('/adjustments');
  revalidatePath(`/quotes/${input.quote_id}`);
  revalidatePath('/quotes');
  revalidatePath('/sales');

  return { ok: true, data: { id: insRow.id, quote_id: input.quote_id } };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
