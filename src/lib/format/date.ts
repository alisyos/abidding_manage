/**
 * 한국 시간(Asia/Seoul) 기준 날짜/시간 포맷터.
 *
 * 배경: Supabase 의 `timestamptz` 컬럼은 UTC 로 저장되므로
 * ISO 문자열을 그대로 잘라 표시하면 9시간 빠른 UTC 시각이 노출된다.
 * 반면 `date` 컬럼(service_start, revenue_month 등)은 timezone 정보가 없어
 * 원본 문자열을 그대로 표시해도 무방하다.
 */

const KST_TZ = 'Asia/Seoul';

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** timestamptz → 'YYYY-MM-DD' (KST 기준). null/잘못된 입력은 '-'. */
export function formatKstDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '-';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** timestamptz → 'YYYY-MM-DD HH:mm' (KST 기준, 24시간). null/잘못된 입력은 '-'. */
export function formatKstDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '-';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/** 현재 시각의 'YYYY-MM-DD' KST 표기 (input[type=date] 기본값 등에 사용). */
export function todayKstISO(): string {
  return formatKstDate(new Date());
}
