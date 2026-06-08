import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 매출(sales_records) 경제값 단일 소스.
 *
 * 견적/매출 분리 모델: 조정(quote_adjustments)은 견적서 문서를 수정하지 않고,
 * 일할 계산액(pre_adjust_amount)의 합만 매출에 반영된다. 따라서 매출 스냅샷은
 *   - base_amount    = 견적 기본가 (불변)
 *   - variable_adjust = 견적 발행 variable_adjust + Σ 조정 일할액
 *   - vat / total     = 위 기준으로 재계산
 * 으로 산출한다. (견적가 계산 공식과 동일: VAT 전 fixed/variable/extra 적용)
 */
export interface SalesEconomics {
  base_amount: number;
  variable_adjust: number;
  vat_amount: number;
  total_amount: number;
}

export async function computeSalesEconomics(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<SalesEconomics | null> {
  type QRow = {
    base_amount: number;
    fixed_adjust: number;
    variable_adjust: number;
    extra_discount_rate: number;
    extra_discount_amount: number;
  };

  const { data: qRaw, error: qErr } = await supabase
    .from('quotes')
    .select('base_amount, fixed_adjust, variable_adjust, extra_discount_rate, extra_discount_amount')
    .eq('id', quoteId)
    .single();
  if (qErr || !qRaw) return null;
  const q = qRaw as unknown as QRow;

  const { data: adjRaw } = await supabase
    .from('quote_adjustments')
    .select('pre_adjust_amount')
    .eq('quote_id', quoteId);
  const proratedSum = (adjRaw ?? []).reduce(
    (s, a) => s + Number((a as { pre_adjust_amount: number | null }).pre_adjust_amount ?? 0),
    0,
  );

  const base = Number(q.base_amount ?? 0);
  const fixed = Number(q.fixed_adjust ?? 0);
  const salesVariable = Number(q.variable_adjust ?? 0) + proratedSum;
  const extraDiscount =
    Math.round(base * Number(q.extra_discount_rate ?? 0)) + Number(q.extra_discount_amount ?? 0);

  const adjusted = base + fixed + salesVariable - extraDiscount;
  const vat = Math.round(adjusted * 0.1);
  const total = adjusted + vat;

  return {
    base_amount: round2(base),
    variable_adjust: round2(salesVariable),
    vat_amount: vat,
    total_amount: round2(total),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
