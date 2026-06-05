/**
 * 견적서 service 기간 → 표시용 라벨 / revenue_month(매출 월).
 */

/**
 * '2026.06' / '2026.06~2026.07' 형식 라벨.
 * 같은 월이면 단일 월, 다르면 시작~종료.
 */
export function buildPeriodLabel(start: string, end: string): string {
  const s = parseISO(start);
  const e = parseISO(end);
  if (!s || !e) return '';
  const sLabel = `${s.year}.${pad(s.month)}`;
  const eLabel = `${e.year}.${pad(e.month)}`;
  return sLabel === eLabel ? sLabel : `${sLabel}~${eLabel}`;
}

/** 'YYYY-MM-DD' → 'YYYY-MM-01' (월 첫째 날) */
export function firstDayOfMonth(date: string): string {
  const p = parseISO(date);
  if (!p) return date;
  return `${p.year}-${pad(p.month)}-01`;
}

function parseISO(s: string): { year: number; month: number; day: number } | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
