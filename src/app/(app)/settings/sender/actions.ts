'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { senderSchema, type SenderInput } from '@/lib/validation/sender';

export async function updateSender(
  inputRaw: SenderInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = senderSchema.safeParse(inputRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? '입력 검증 실패' };
  }

  // 빈 문자열은 null로 정규화
  const payload = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, v === '' ? null : v ?? null]),
  );

  const supabase = createClient();
  const { error } = await supabase.from('sender_profile').update(payload).eq('id', 1);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/sender');
  return { ok: true };
}
