import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildSalesPivot, type PivotQuoteItem, type PivotSalesRecord } from '@/lib/sales/pivot';
import { buildSalesWorkbook } from '@/lib/sales/export-xlsx';
import type { Media, Tier, QuoteStatus } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 월매출 xlsx 다운로드.
 *   GET /api/sales/export?month=YYYY-MM
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
  const month = url.searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month=YYYY-MM 형식 필요' }, { status: 400 });
  }

  type SaleRow = {
    id: string;
    quote_id: string;
    company_id: string;
    sub_company_id: string | null;
    base_amount: number;
    variable_adjust: number;
    total_amount: number;
    vat_amount: number;
    payment_date: string | null;
    tax_invoice_no: string | null;
    quotes: {
      quote_no: string | null;
      status: QuoteStatus;
      extra_discount_rate: number;
      extra_discount_amount: number;
    } | null;
    companies: { name: string } | null;
    sub_companies: { name: string } | null;
  };

  const { data: salesRaw, error } = await supabase
    .from('sales_records')
    .select(
      `id, quote_id, company_id, sub_company_id, base_amount, variable_adjust, total_amount, vat_amount,
       payment_date, tax_invoice_no,
       quotes(quote_no, status, extra_discount_rate, extra_discount_amount), companies(name), sub_companies(name)`,
    )
    .eq('revenue_month', `${month}-01`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sales = (salesRaw ?? []) as unknown as SaleRow[];

  // 관련 quote_items + 조정 delta 일괄 조회
  const quoteIds = sales.map((s) => s.quote_id);
  type ItemRow = { quote_id: string; media: Media; tier: Tier; quantity: number };
  type AdjRow = {
    quote_id: string;
    media: Media;
    delta_unique: number;
    delta_premium: number;
    delta_basic: number;
    delta_lite: number;
  };
  const items: ItemRow[] = [];
  const adjRows: AdjRow[] = [];
  if (quoteIds.length > 0) {
    const [itemsRes, adjRes] = await Promise.all([
      supabase
        .from('quote_items')
        .select('quote_id, media, tier, quantity')
        .in('quote_id', quoteIds),
      supabase
        .from('quote_adjustments')
        .select('quote_id, media, delta_unique, delta_premium, delta_basic, delta_lite')
        .in('quote_id', quoteIds),
    ]);
    items.push(...((itemsRes.data ?? []) as unknown as ItemRow[]));
    adjRows.push(...((adjRes.data ?? []) as unknown as AdjRow[]));
  }

  const records: PivotSalesRecord[] = sales.map((s) => {
    const base = Number(s.base_amount ?? 0);
    const extraDiscount =
      Math.round(base * Number(s.quotes?.extra_discount_rate ?? 0)) +
      Number(s.quotes?.extra_discount_amount ?? 0);
    return {
      id: s.id,
      quote_id: s.quote_id,
      quote_no: s.quotes?.quote_no ?? null,
      quote_status: (s.quotes?.status ?? 'won') as QuoteStatus,
      company_id: s.company_id,
      company_name: s.companies?.name ?? '-',
      sub_company_id: s.sub_company_id,
      sub_company_name: s.sub_companies?.name ?? null,
      base_amount: base,
      extra_discount: extraDiscount,
      variable_adjust: Number(s.variable_adjust ?? 0),
      total_amount: Number(s.total_amount ?? 0),
      vat_amount: Number(s.vat_amount ?? 0),
      payment_date: s.payment_date,
      tax_invoice_no: s.tax_invoice_no,
    };
  });
  const pivotItems: PivotQuoteItem[] = items.map((i) => ({
    quote_id: i.quote_id,
    media: i.media,
    tier: i.tier,
    quantity: i.quantity,
  }));
  // 조정 delta 를 (media,tier) 합성 항목으로 펼쳐 사용량 셀에 합산
  const TIER_KEYS: Tier[] = ['unique', 'premium', 'basic', 'lite'];
  for (const a of adjRows) {
    const deltas: Record<Tier, number> = {
      unique: Number(a.delta_unique ?? 0),
      premium: Number(a.delta_premium ?? 0),
      basic: Number(a.delta_basic ?? 0),
      lite: Number(a.delta_lite ?? 0),
    };
    for (const tier of TIER_KEYS) {
      if (deltas[tier] !== 0) {
        pivotItems.push({ quote_id: a.quote_id, media: a.media, tier, quantity: deltas[tier] });
      }
    }
  }

  const pivot = buildSalesPivot(records, pivotItems);
  const buf = buildSalesWorkbook(pivot, month);

  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''%EC%9B%94%EB%A7%A4%EC%B6%9C_${encodeURIComponent(month)}.xlsx`,
      'Cache-Control': 'no-store',
    },
  });
}
