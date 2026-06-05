/**
 * 견적가 계산 - 단일 진실 소스.
 * 클라이언트(실시간 합계)와 서버(저장 직전 재계산) 양쪽에서 호출.
 *
 * 공식:
 *   lineTotal     = quantity × unit_price
 *   baseAmount    = sum(lineTotals) + addonFee
 *   discounted    = baseAmount × (1 - discountRate)
 *   adjusted      = discounted + fixedAdjust + variableAdjust
 *   vatAmount     = round(adjusted × 0.1)
 *   totalAmount   = adjusted + vatAmount
 *
 * 엑셀 견적서 시트 검증값:
 *   K/unique 70 × 10,000 = 700,000
 *   K/premium 150 × 5,000 = 750,000
 *   baseAmount = 1,450,000, vatAmount = 145,000, totalAmount = 1,595,000
 */

export interface QuoteCalcItem {
  quantity: number;
  unit_price: number;
}

export interface QuoteCalcResult {
  baseAmount: number;
  discounted: number;
  adjusted: number;
  vatAmount: number;
  totalAmount: number;
  lineTotals: number[];
}

export function computeQuote(
  items: QuoteCalcItem[],
  addonFee: number,
  discountRate: number,
  fixedAdjust: number,
  variableAdjust: number,
): QuoteCalcResult {
  const lineTotals = items.map((i) => (i.quantity || 0) * (i.unit_price || 0));
  const itemsSum = lineTotals.reduce((a, b) => a + b, 0);
  const baseAmount = itemsSum + (addonFee || 0);
  const discounted = baseAmount * (1 - (discountRate || 0));
  const adjusted = discounted + (fixedAdjust || 0) + (variableAdjust || 0);
  const vatAmount = Math.round(adjusted * 0.1);
  const totalAmount = adjusted + vatAmount;

  return { baseAmount, discounted, adjusted, vatAmount, totalAmount, lineTotals };
}
