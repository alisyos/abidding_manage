import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 견적 번호 생성: `Q-YYYYMM-###` (월별 시퀀스).
 * service_start 의 연월 기준으로 해당 월 기존 견적번호의 최대 시퀀스 + 1.
 *
 * COUNT 기반(+1)은 삭제로 번호에 빈틈이 생기면 기존 번호와 충돌하므로
 * 최대 시퀀스 기반으로 산출한다. 운영 1인 환경 가정 — 동시성 보호는
 * createQuote 의 충돌 재시도로 보완.
 */
export async function generateQuoteNo(
  supabase: SupabaseClient,
  serviceStart: string,
): Promise<string> {
  const m = serviceStart.match(/^(\d{4})-(\d{1,2})/);
  if (!m) throw new Error('잘못된 service_start 형식');
  const prefix = `Q-${m[1]}${m[2].padStart(2, '0')}-`;

  const { data, error } = await supabase
    .from('quotes')
    .select('quote_no')
    .ilike('quote_no', `${prefix}%`);

  if (error) throw new Error(`quote_no 생성 실패: ${error.message}`);

  let maxSeq = 0;
  for (const row of data ?? []) {
    const mm = String((row as { quote_no: string | null }).quote_no ?? '').match(/-(\d+)$/);
    if (mm) maxSeq = Math.max(maxSeq, Number(mm[1]));
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}
