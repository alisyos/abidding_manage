'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { companyInputSchema, type CompanyInput } from '@/lib/validation/company';
import { generateFormattedAddress } from '@/lib/format/contact';

export interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

// ───────────────────────────────────────────────────────────────
// Bulk actions
// ───────────────────────────────────────────────────────────────
async function setCompaniesActive(ids: string[], active: boolean): Promise<ActionResult> {
  if (!ids.length) return { ok: true };
  const supabase = createClient();
  const { error } = await supabase
    .from('companies')
    .update({ is_active: active })
    .in('id', ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/companies');
  return { ok: true };
}

export async function bulkActivate(ids: string[]) {
  return setCompaniesActive(ids, true);
}

export async function bulkDeactivate(ids: string[]) {
  return setCompaniesActive(ids, false);
}

// 소프트 삭제 = 비활성화 (동일 효과지만 UI 의도 분리)
export async function bulkSoftDelete(ids: string[]) {
  return setCompaniesActive(ids, false);
}

export async function softDeleteCompany(id: string) {
  return setCompaniesActive([id], false);
}

// ───────────────────────────────────────────────────────────────
// Create / Update (회사 + 세부거래처 + 연락처 nested)
// ───────────────────────────────────────────────────────────────

/**
 * formatted_address 자동 채움 (빈 값일 때만).
 */
function enrichContacts(input: CompanyInput): CompanyInput {
  return {
    ...input,
    sub_companies: input.sub_companies.map((sub) => ({
      ...sub,
      contacts: sub.contacts.map((c, idx) => ({
        ...c,
        sort_order: c.sort_order ?? idx,
        formatted_address:
          c.formatted_address && c.formatted_address.trim().length > 0
            ? c.formatted_address
            : generateFormattedAddress({
                companyName: input.name,
                displayName: c.display_name ?? '',
                email: c.email,
              }),
      })),
    })),
  };
}

export async function createCompany(
  inputRaw: CompanyInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = companyInputSchema.safeParse(inputRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? '검증 실패' };
  }
  const input = enrichContacts(parsed.data);

  const supabase = createClient();

  // 1) companies insert
  const { data: companyRow, error: companyErr } = await supabase
    .from('companies')
    .insert({
      no: input.no ?? null,
      name: input.name,
      account_type: input.account_type,
      default_discount_rate: input.default_discount_rate,
      user_database: nullify(input.user_database),
      user_agency_id: nullify(input.user_agency_id),
      url: nullify(input.url),
      memo: nullify(input.memo),
      is_active: input.is_active,
    })
    .select('id')
    .single();

  if (companyErr || !companyRow) {
    return { ok: false, error: companyErr?.message ?? '거래처 생성 실패' };
  }

  // 2) sub_companies + contacts
  const subErr = await upsertSubsAndContacts(supabase, companyRow.id, input);
  if (subErr) return { ok: false, error: subErr };

  revalidatePath('/companies');
  return { ok: true, data: { id: companyRow.id } };
}

export async function updateCompany(
  id: string,
  inputRaw: CompanyInput,
): Promise<ActionResult> {
  const parsed = companyInputSchema.safeParse(inputRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? '검증 실패' };
  }
  const input = enrichContacts(parsed.data);
  const supabase = createClient();

  const { error: updErr } = await supabase
    .from('companies')
    .update({
      no: input.no ?? null,
      name: input.name,
      account_type: input.account_type,
      default_discount_rate: input.default_discount_rate,
      user_database: nullify(input.user_database),
      user_agency_id: nullify(input.user_agency_id),
      url: nullify(input.url),
      memo: nullify(input.memo),
      is_active: input.is_active,
    })
    .eq('id', id);

  if (updErr) return { ok: false, error: updErr.message };

  // 기존 sub_companies 조회 → 입력에 없는 것 삭제 → upsert 적용
  const { data: existingSubs } = await supabase
    .from('sub_companies')
    .select('id, name')
    .eq('company_id', id);

  const inputSubIds = new Set(input.sub_companies.map((s) => s.id).filter(Boolean) as string[]);
  const toDelete = (existingSubs ?? [])
    .filter((s) => !inputSubIds.has(s.id))
    .map((s) => s.id);

  if (toDelete.length) {
    const { error: delErr } = await supabase.from('sub_companies').delete().in('id', toDelete);
    if (delErr) return { ok: false, error: `세부거래처 삭제 실패: ${delErr.message}` };
  }

  const subErr = await upsertSubsAndContacts(supabase, id, input);
  if (subErr) return { ok: false, error: subErr };

  revalidatePath('/companies');
  revalidatePath(`/companies/${id}`);
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────
// 헬퍼
// ───────────────────────────────────────────────────────────────

type SupabaseLike = ReturnType<typeof createClient>;

async function upsertSubsAndContacts(
  supabase: SupabaseLike,
  companyId: string,
  input: CompanyInput,
): Promise<string | null> {
  for (const sub of input.sub_companies) {
    let subId = sub.id;

    if (subId) {
      const { error: subUpdErr } = await supabase
        .from('sub_companies')
        .update({
          name: sub.name,
          database_code: nullify(sub.database_code),
          agency_id: nullify(sub.agency_id),
          memo: nullify(sub.memo),
        })
        .eq('id', subId);
      if (subUpdErr) return `세부거래처 수정 실패: ${subUpdErr.message}`;
    } else {
      const { data: insRow, error: subInsErr } = await supabase
        .from('sub_companies')
        .insert({
          company_id: companyId,
          name: sub.name,
          database_code: nullify(sub.database_code),
          agency_id: nullify(sub.agency_id),
          memo: nullify(sub.memo),
        })
        .select('id')
        .single();
      if (subInsErr || !insRow) return `세부거래처 추가 실패: ${subInsErr?.message}`;
      subId = insRow.id;
    }

    // 연락처: sub 단위 delete-then-insert
    const { error: cDelErr } = await supabase
      .from('company_contacts')
      .delete()
      .eq('sub_company_id', subId);
    if (cDelErr) return `연락처 삭제 실패: ${cDelErr.message}`;

    if (sub.contacts.length > 0) {
      const { error: cInsErr } = await supabase.from('company_contacts').insert(
        sub.contacts.map((c, idx) => ({
          sub_company_id: subId!,
          role: c.role,
          display_name: nullify(c.display_name),
          email: c.email,
          phone: nullify(c.phone),
          formatted_address: nullify(c.formatted_address),
          sort_order: c.sort_order ?? idx,
        })),
      );
      if (cInsErr) return `연락처 추가 실패: ${cInsErr.message}`;
    }
  }
  return null;
}

function nullify(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t.length === 0 ? null : t;
}
