import type { Media, Tier, QuoteStatus } from '@/lib/supabase/types';

export const MEDIA_ORDER: Media[] = ['K', 'S', 'M'];
export const TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];

/** 매체 × 등급 12개 키 (예: 'K_unique', 'K_premium', ..., 'M_lite') */
export type CellKey = `${Media}_${Tier}`;

export const CELL_KEYS: CellKey[] = MEDIA_ORDER.flatMap((media) =>
  TIER_ORDER.map((tier) => `${media}_${tier}` as CellKey),
);

// ───────────────────────────────────────────────────────────────
// 입력 인터페이스
// ───────────────────────────────────────────────────────────────
export interface PivotSalesRecord {
  id: string;
  quote_id: string;
  quote_no: string | null;
  quote_status: QuoteStatus;
  company_id: string;
  company_name: string;
  sub_company_id: string | null;
  sub_company_name: string | null;
  base_amount: number;
  variable_adjust: number;
  total_amount: number;
  payment_date: string | null;
  tax_invoice_no: string | null;
}

export interface PivotQuoteItem {
  quote_id: string;
  media: Media;
  tier: Tier;
  quantity: number;
}

// ───────────────────────────────────────────────────────────────
// 출력 인터페이스
// ───────────────────────────────────────────────────────────────
export interface PivotRow {
  rowKey: string;
  quote_id: string;
  quote_no: string | null;
  quote_status: QuoteStatus;
  company_name: string;
  sub_company_name: string | null;
  cells: Record<CellKey, number>;     // 12개 셀, 0 디폴트
  base_amount: number;
  variable_adjust: number;
  total_amount: number;
  payment_date: string | null;
}

export interface PivotTotals {
  cells: Record<CellKey, number>;
  base_amount: number;
  variable_adjust: number;
  total_amount: number;
}

export interface PivotResult {
  rows: PivotRow[];
  totals: PivotTotals;
}

// ───────────────────────────────────────────────────────────────
// 빌더
// ───────────────────────────────────────────────────────────────
export function buildSalesPivot(
  records: PivotSalesRecord[],
  items: PivotQuoteItem[],
): PivotResult {
  const itemsByQuote = new Map<string, PivotQuoteItem[]>();
  for (const it of items) {
    const arr = itemsByQuote.get(it.quote_id) ?? [];
    arr.push(it);
    itemsByQuote.set(it.quote_id, arr);
  }

  const rows: PivotRow[] = records.map((r) => {
    const cells = makeEmptyCells();
    for (const it of itemsByQuote.get(r.quote_id) ?? []) {
      const key = `${it.media}_${it.tier}` as CellKey;
      cells[key] = (cells[key] ?? 0) + it.quantity;
    }
    return {
      rowKey: `${r.company_id}__${r.sub_company_id ?? '-'}__${r.quote_id}`,
      quote_id: r.quote_id,
      quote_no: r.quote_no,
      quote_status: r.quote_status,
      company_name: r.company_name,
      sub_company_name: r.sub_company_name,
      cells,
      base_amount: Number(r.base_amount ?? 0),
      variable_adjust: Number(r.variable_adjust ?? 0),
      total_amount: Number(r.total_amount ?? 0),
      payment_date: r.payment_date,
    };
  });

  // 정렬: 거래처명 → 세부거래처명 → quote_no
  rows.sort((a, b) => {
    const c = a.company_name.localeCompare(b.company_name);
    if (c !== 0) return c;
    const s = (a.sub_company_name ?? '').localeCompare(b.sub_company_name ?? '');
    if (s !== 0) return s;
    return (a.quote_no ?? '').localeCompare(b.quote_no ?? '');
  });

  // 합계
  const totals: PivotTotals = {
    cells: makeEmptyCells(),
    base_amount: 0,
    variable_adjust: 0,
    total_amount: 0,
  };
  for (const r of rows) {
    for (const k of CELL_KEYS) totals.cells[k] += r.cells[k];
    totals.base_amount += r.base_amount;
    totals.variable_adjust += r.variable_adjust;
    totals.total_amount += r.total_amount;
  }

  return { rows, totals };
}

function makeEmptyCells(): Record<CellKey, number> {
  const o = {} as Record<CellKey, number>;
  for (const k of CELL_KEYS) o[k] = 0;
  return o;
}
