import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * service_role 키를 사용하는 서버 전용 클라이언트.
 * 대량 임포트 / 시스템 자동화 작업 전용. 절대 클라이언트 코드에서 import 금지.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경 변수가 설정되지 않았습니다.');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
