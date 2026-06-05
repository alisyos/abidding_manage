/**
 * 견적가 계산 — 단일 진실 소스 (임계값 기반 할인 + 추가 할인).
 *
 * 가격 정책 (DMP 에이비딩 소개서):
 *   - 매체×등급별로 공시가(list_price) / 할인가(unit_price) 2종 존재
 *   - 공시가 기준 상품 합계 ≥ 100,000원이면 → 할인가 적용 (표준 할인)
 *
 * 추가 할인 (견적별):
 *   - extra_discount_rate (0~1): baseAmount × rate
 *   - extra_discount_amount (원)
 *   - 둘 다 적용 (합산)
 *
 * 공식:
 *   listSum         = Σ (quantity × list_price)
 *   discountApplied = listSum ≥ DISCOUNT_THRESHOLD
 *   appliedUnit_i   = discountApplied ? unit_price_i : list_price_i
 *   lineTotal_i     = quantity_i × appliedUnit_i
 *   itemsSum        = Σ lineTotal_i
 *   baseAmount      = itemsSum + addonFee
 *   extraDiscount   = round(baseAmount × extraDiscountRate) + extraDiscountAmount
 *   adjusted        = baseAmount + fixedAdjust + variableAdjust − extraDiscount
 *   vatAmount       = round(adjusted × 0.1)
 *   totalAmount     = adjusted + vatAmount
 */

export const DISCOUNT_THRESHOLD = 100000;

export interface QuoteCalcItem {
  quantity: number;
  unit_price: number;   // 할인가
  list_price: number;   // 공시가
}

export interface QuoteCalcResult {
  baseAmount: number;
  adjusted: number;
  vatAmount: number;
  totalAmount: number;
  /** 각 아이템의 (quantity × appliedUnit) */
  lineTotals: number[];
  /** 상품 합계 (할인 적용 후) */
  itemsSum: number;
  /** 공시가 기준 합계 (임계값 판정용) */
  listSum: number;
  /** 할인가 기준 합계 (참고용) */
  discountSum: number;
  /** 표준 할인 적용 여부 */
  discountApplied: boolean;
  /** 표준 할인 절약액 = listSum - itemsSum (할인 적용 시), 미적용 시 0 */
  savings: number;
  /** 추가 할인 적용액 (양수) */
  extraDiscount: number;
}

export function computeQuote(
  items: QuoteCalcItem[],
  addonFee: number,
  fixedAdjust: number,
  variableAdjust: number,
  extraDiscountRate: number = 0,
  extraDiscountAmount: number = 0,
): QuoteCalcResult {
  const listSum = items.reduce(
    (a, i) => a + (i.quantity || 0) * (i.list_price || 0),
    0,
  );
  const discountSum = items.reduce(
    (a, i) => a + (i.quantity || 0) * (i.unit_price || 0),
    0,
  );
  const discountApplied = listSum >= DISCOUNT_THRESHOLD;
  const lineTotals = items.map(
    (i) => (i.quantity || 0) * (discountApplied ? (i.unit_price || 0) : (i.list_price || 0)),
  );
  const itemsSum = lineTotals.reduce((a, b) => a + b, 0);
  const baseAmount = itemsSum + (addonFee || 0);

  const extraDiscount =
    Math.round(baseAmount * (extraDiscountRate || 0)) + (extraDiscountAmount || 0);

  const adjusted = baseAmount + (fixedAdjust || 0) + (variableAdjust || 0) - extraDiscount;
  const vatAmount = Math.round(adjusted * 0.1);
  const totalAmount = adjusted + vatAmount;
  const savings = discountApplied ? listSum - itemsSum : 0;

  return {
    baseAmount,
    adjusted,
    vatAmount,
    totalAmount,
    lineTotals,
    itemsSum,
    listSum,
    discountSum,
    discountApplied,
    savings,
    extraDiscount,
  };
}
