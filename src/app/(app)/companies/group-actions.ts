'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './actions';

// ───────────────────────────────────────────────────────────────
// 거래처 그룹 (수동 멤버십)
// ───────────────────────────────────────────────────────────────

export async function createGroup(
  nameRaw: string,
  descriptionRaw?: string,
): Promise<ActionResult<{ id: string }>> {
  const name = nameRaw.trim();
  if (!name) return { ok: false, error: '그룹명을 입력해주세요' };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('company_groups')
    .insert({ name, description: descriptionRaw?.trim() || null })
    .select('id')
    .single();

  if (error || !data) {
    const msg = error?.code === '23505' ? '이미 같은 이름의 그룹이 있습니다' : error?.message;
    return { ok: false, error: msg ?? '그룹 생성 실패' };
  }
  revalidatePath('/companies');
  return { ok: true, data: { id: data.id } };
}

export async function renameGroup(
  id: string,
  nameRaw: string,
  descriptionRaw?: string,
): Promise<ActionResult> {
  const name = nameRaw.trim();
  if (!name) return { ok: false, error: '그룹명을 입력해주세요' };

  const supabase = createClient();
  const { error } = await supabase
    .from('company_groups')
    .update({ name, description: descriptionRaw?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    const msg = error.code === '23505' ? '이미 같은 이름의 그룹이 있습니다' : error.message;
    return { ok: false, error: msg };
  }
  revalidatePath('/companies');
  return { ok: true };
}

export async function deleteGroup(id: string): Promise<ActionResult> {
  const supabase = createClient();
  // 멤버는 on delete cascade 로 자동 삭제
  const { error } = await supabase.from('company_groups').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/companies');
  return { ok: true };
}

export async function addCompaniesToGroup(
  groupId: string,
  companyIds: string[],
): Promise<ActionResult> {
  if (!groupId) return { ok: false, error: '그룹을 선택해주세요' };
  if (!companyIds.length) return { ok: true };

  const supabase = createClient();
  // 이미 속한 거래처는 PK 충돌 → 무시(ignoreDuplicates)
  const { error } = await supabase
    .from('company_group_members')
    .upsert(
      companyIds.map((company_id) => ({ group_id: groupId, company_id })),
      { onConflict: 'group_id,company_id', ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath('/companies');
  return { ok: true };
}

export async function removeCompaniesFromGroup(
  groupId: string,
  companyIds: string[],
): Promise<ActionResult> {
  if (!groupId) return { ok: false, error: '그룹을 선택해주세요' };
  if (!companyIds.length) return { ok: true };

  const supabase = createClient();
  const { error } = await supabase
    .from('company_group_members')
    .delete()
    .eq('group_id', groupId)
    .in('company_id', companyIds);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/companies');
  return { ok: true };
}
