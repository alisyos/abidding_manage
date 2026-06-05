import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 견적 번호 생성: `Q-YYYYMM-###` (월별 시퀀스).
 * service_start 의 연월 기준으로 quotes 테이블에서 카운트 후 +1.
 *
 * 운영 1인 환경 가정 — 동시성 보호(advisory lock 등) 생략.
 */
export async function generateQuoteNo(
  supabase: SupabaseClient,
  serviceStart: string,
): Promise<string> {
  const m = serviceStart.match(/^(\d{4})-(\d{1,2})/);
  if (!m) throw new Error('잘못된 service_start 형식');
  const prefix = `Q-${m[1]}${m[2].padStart(2, '0')}-`;

  const { count, error } = await supabase
    .from('quotes')
    .select('id', { count: 'exact', head: true })
    .ilike('quote_no', `${prefix}%`);

  if (error) throw new Error(`quote_no 생성 실패: ${error.message}`);

  const seq = (count ?? 0) + 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}
