/**
 * 원화 포맷터 (소수점 없음).
 *  formatKRW(1450000)  -> '1,450,000원'
 *  formatKRW(0)        -> '0원'
 *  formatKRW(null)     -> '-'
 */
export function formatKRW(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

/** 백분율 포맷터. 0.15 -> '15.0%' */
export function formatPercent(rate: number | null | undefined, digits = 1): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '-';
  return `${(rate * 100).toFixed(digits)}%`;
}
