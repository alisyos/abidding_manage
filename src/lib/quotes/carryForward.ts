import type { SupabaseClient } from '@supabase/supabase-js';
import type { Media, Tier } from '@/lib/supabase/types';

/**
 * 익월 견적 이월(carry-forward) 헬퍼.
 *
 * 견적/매출 분리 모델에서 조정(quote_adjustments)은 견적서를 수정하지 않으므로,
 * "다음 달 기준 수량 = 이전달 quote_items.quantity + Σ 조정 delta" 를 익월 견적 생성
 * (일괄/개별) 시 새 정가 수량으로 적용한다.
 */

const TIERS: Tier[] = ['unique', 'premium', 'basic', 'lite'];

/** `${media}__${tier}` → 조정 반영 수량 (음수면 0). */
export type AdjustedQtyMap = Map<string, Map<string, number>>;

export function qtyKey(media: Media, tier: Tier): string {
  return `${media}__${tier}`;
}

/**
 * 주어진 견적들의 (조정 반영) 수량을 quote_id 별로 반환.
 * quote_items.quantity 에 quote_adjustments 의 등급별 delta 합을 더하고 0 으로 floor.
 */
export async function fetchAdjustedQuantities(
  supabase: SupabaseClient,
  quoteIds: string[],
): Promise<AdjustedQtyMap> {
  const result: AdjustedQtyMap = new Map();
  if (quoteIds.length === 0) return result;

  type ItemRow = { quote_id: string; media: Media; tier: Tier; quantity: number };
  const { data: itemsRaw } = await supabase
    .from('quote_items')
    .select('quote_id, media, tier, quantity')
    .in('quote_id', quoteIds);
  for (const it of (itemsRaw ?? []) as unknown as ItemRow[]) {
    const m = result.get(it.quote_id) ?? new Map<string, number>();
    m.set(qtyKey(it.media, it.tier), (m.get(qtyKey(it.media, it.tier)) ?? 0) + Number(it.quantity ?? 0));
    result.set(it.quote_id, m);
  }

  type AdjRow = {
    quote_id: string;
    media: Media;
    delta_unique: number;
    delta_premium: number;
    delta_basic: number;
    delta_lite: number;
  };
  const { data: adjRaw } = await supabase
    .from('quote_adjustments')
    .select('quote_id, media, delta_unique, delta_premium, delta_basic, delta_lite')
    .in('quote_id', quoteIds);
  for (const a of (adjRaw ?? []) as unknown as AdjRow[]) {
    const m = result.get(a.quote_id) ?? new Map<string, number>();
    const deltas: Record<Tier, number> = {
      unique: Number(a.delta_unique ?? 0),
      premium: Number(a.delta_premium ?? 0),
      basic: Number(a.delta_basic ?? 0),
      lite: Number(a.delta_lite ?? 0),
    };
    for (const tier of TIERS) {
      const k = qtyKey(a.media, tier);
      m.set(k, (m.get(k) ?? 0) + deltas[tier]);
    }
    result.set(a.quote_id, m);
  }

  // 음수 floor
  for (const m of Array.from(result.values())) {
    for (const [k, v] of Array.from(m.entries())) m.set(k, Math.max(0, v));
  }

  return result;
}

/**
 * 주어진 견적들의 조정 정산액 합계 (quote_id → Σ pre_adjust_amount).
 * 익월 견적의 변동조정가로 이월(1회성).
 */
export async function fetchAdjustmentAmountSums(
  supabase: SupabaseClient,
  quoteIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (quoteIds.length === 0) return out;
  const { data } = await supabase
    .from('quote_adjustments')
    .select('quote_id, pre_adjust_amount')
    .in('quote_id', quoteIds);
  for (const r of (data ?? []) as unknown as {
    quote_id: string;
    pre_adjust_amount: number | null;
  }[]) {
    out.set(r.quote_id, (out.get(r.quote_id) ?? 0) + Number(r.pre_adjust_amount ?? 0));
  }
  return out;
}

export interface PreviousQuoteRef {
  quote_id: string;
  quote_no: string | null;
  service_start: string;
}

/**
 * 같은 거래처(+세부거래처)의 targetMonthStart 이전(<) 최신 견적 1건.
 * 개별 신규 견적 prefill 용.
 */
export async function findPreviousQuote(
  supabase: SupabaseClient,
  companyId: string,
  subCompanyId: string | null,
  targetMonthStart: string,
): Promise<PreviousQuoteRef | null> {
  let query = supabase
    .from('quotes')
    .select('id, quote_no, service_start')
    .eq('company_id', companyId)
    .lt('service_start', targetMonthStart)
    .order('service_start', { ascending: false })
    .limit(1);
  query = subCompanyId ? query.eq('sub_company_id', subCompanyId) : query.is('sub_company_id', null);

  const { data } = await query;
  const row = (data ?? [])[0] as unknown as
    | { id: string; quote_no: string | null; service_start: string }
    | undefined;
  if (!row) return null;
  return { quote_id: row.id, quote_no: row.quote_no, service_start: row.service_start };
}
