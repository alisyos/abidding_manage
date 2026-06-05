import { createBrowserClient } from '@supabase/ssr';

// Supabase v2 generic system이 우리 Database 타입과 호환되지 않아 untyped 모드 사용.
// Row 캐스팅은 호출부에서 `as Company` 형태로 처리하고, Insert/Update는 Zod로 검증.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
