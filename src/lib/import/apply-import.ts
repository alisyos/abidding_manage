import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ContactRow,
  DraftRow,
  ImportApplyResult,
  MasterRow,
  SubCompanyRow,
  UsageRow,
} from '@/lib/validation/import';

interface ApplyInput {
  master: MasterRow[];
  subCompanies: SubCompanyRow[];
  contacts: ContactRow[];
  usage: UsageRow[];
  draft: DraftRow[];
}

/**
 * 파싱된 데이터를 DB에 upsert. service_role 클라이언트로 호출되어 RLS 회피.
 *
 * 순서:
 *  1. companies upsert by name (master + draft 병합)
 *  2. sub_companies upsert by (company_id, name)
 *  3. company_contacts: sub 단위 delete-then-insert
 *  4. monthly_usage: (sub_company_id, usage_start, source='import_v1') 사전 삭제 후 insert
 */
export async function applyImport(
  supabase: SupabaseClient,
  input: ApplyInput,
): Promise<ImportApplyResult> {
  const warnings: string[] = [];

  // ─────────────────────────────────────────────────────────
  // 1) companies upsert by name
  // ─────────────────────────────────────────────────────────
  const draftByName = new Map<string, DraftRow>();
  input.draft.forEach((d) => draftByName.set(d.name, d));

  // raw 좌측에 등장하는 거래처도 마스터에 포함 (우측 L-Q에 없을 수 있음)
  const masterByName = new Map<string, MasterRow>();
  input.master.forEach((m) => masterByName.set(m.name, m));
  input.subCompanies.forEach((s) => {
    if (!masterByName.has(s.company_name)) {
      masterByName.set(s.company_name, {
        name: s.company_name,
        no: null,
        user_database: null,
        user_agency_id: null,
        url: null,
      });
    }
  });

  const companyPayload: Record<string, unknown>[] = [];
  for (const m of Array.from(masterByName.values())) {
    const d = draftByName.get(m.name);
    companyPayload.push({
      no: m.no,
      name: m.name,
      user_database: m.user_database,
      user_agency_id: m.user_agency_id,
      url: m.url,
      account_type: d?.account_type ?? 'agency', // 기본값 제휴사
      default_discount_rate: d?.default_discount_rate ?? 0,
      is_active: true,
    });
  }

  const { data: upsertedCompanies, error: cErr } = await supabase
    .from('companies')
    .upsert(companyPayload, { onConflict: 'name' })
    .select('id, name');

  if (cErr) throw new Error(`거래처 upsert 실패: ${cErr.message}`);

  const companyByName = new Map<string, string>();
  (upsertedCompanies ?? []).forEach((c: { id: string; name: string }) =>
    companyByName.set(c.name, c.id),
  );

  // 누락된 거래처(드물게 RETURNING 못 받은 경우) 보충 조회
  const missingNames = Array.from(masterByName.keys()).filter((n) => !companyByName.has(n));
  if (missingNames.length > 0) {
    const { data: extra } = await supabase
      .from('companies')
      .select('id, name')
      .in('name', missingNames);
    (extra ?? []).forEach((c: { id: string; name: string }) => companyByName.set(c.name, c.id));
  }

  // ─────────────────────────────────────────────────────────
  // 2) sub_companies upsert by (company_id, name)
  // ─────────────────────────────────────────────────────────
  const subPayload: Record<string, unknown>[] = [];
  for (const s of input.subCompanies) {
    const cid = companyByName.get(s.company_name);
    if (!cid) {
      warnings.push(`세부거래처 무시 (상위 거래처 미발견): ${s.company_name} / ${s.name}`);
      continue;
    }
    subPayload.push({
      company_id: cid,
      name: s.name,
      database_code: s.database_code,
      agency_id: s.agency_id,
    });
  }

  let upsertedSubs: { id: string; company_id: string; name: string }[] = [];
  if (subPayload.length) {
    const { data, error: sErr } = await supabase
      .from('sub_companies')
      .upsert(subPayload, { onConflict: 'company_id,name' })
      .select('id, company_id, name');
    if (sErr) throw new Error(`세부거래처 upsert 실패: ${sErr.message}`);
    upsertedSubs = (data ?? []) as { id: string; company_id: string; name: string }[];
  }

  const subByKey = new Map<string, string>(); // `${companyId}__${subName}` → subId
  upsertedSubs.forEach((s) => subByKey.set(`${s.company_id}__${s.name}`, s.id));

  function findSubId(companyName: string, subName: string): string | null {
    const cid = companyByName.get(companyName);
    if (!cid) return null;
    return subByKey.get(`${cid}__${subName}`) ?? null;
  }

  // ─────────────────────────────────────────────────────────
  // 3) company_contacts: sub 단위 delete-then-insert
  // ─────────────────────────────────────────────────────────
  const contactsBySub = new Map<string, ContactRow[]>();
  for (const c of input.contacts) {
    const sid = findSubId(c.company_name, c.sub_company_name);
    if (!sid) {
      warnings.push(
        `연락처 무시 (세부거래처 미발견): ${c.company_name} / ${c.sub_company_name} / ${c.email}`,
      );
      continue;
    }
    if (!contactsBySub.has(sid)) contactsBySub.set(sid, []);
    contactsBySub.get(sid)!.push(c);
  }

  let insertedContacts = 0;
  for (const [sid, contacts] of Array.from(contactsBySub.entries())) {
    const { error: delErr } = await supabase
      .from('company_contacts')
      .delete()
      .eq('sub_company_id', sid);
    if (delErr) throw new Error(`연락처 삭제 실패: ${delErr.message}`);

    const payload = contacts.map((c) => ({
      sub_company_id: sid,
      role: c.role,
      display_name: c.display_name ?? null,
      email: c.email,
      phone: c.phone ?? null,
      formatted_address: c.formatted_address ?? null,
      sort_order: c.sort_order,
    }));
    const { error: insErr } = await supabase.from('company_contacts').insert(payload);
    if (insErr) throw new Error(`연락처 추가 실패: ${insErr.message}`);
    insertedContacts += payload.length;
  }

  // ─────────────────────────────────────────────────────────
  // 4) monthly_usage: (sub_company_id, usage_start, source='import_v1') 사전 삭제 후 insert
  // ─────────────────────────────────────────────────────────
  const usagePayload: Record<string, unknown>[] = [];
  const usageScope = new Map<string, Set<string>>(); // sid → set of usage_start
  for (const u of input.usage) {
    const sid = findSubId(u.company_name, u.sub_company_name);
    if (!sid) {
      warnings.push(
        `사용량 무시 (세부거래처 미발견): ${u.company_name} / ${u.sub_company_name}`,
      );
      continue;
    }
    const cid = companyByName.get(u.company_name)!;
    usagePayload.push({
      company_id: cid,
      sub_company_id: sid,
      media: u.media,
      tier: u.tier,
      quantity: u.quantity,
      usage_start: u.usage_start,
      usage_end: u.usage_end,
      source: 'import_v1',
    });
    if (u.usage_start) {
      if (!usageScope.has(sid)) usageScope.set(sid, new Set());
      usageScope.get(sid)!.add(u.usage_start);
    }
  }

  let insertedUsage = 0;
  if (usagePayload.length) {
    // 사전 삭제: 동일 (sid, usage_start, source) 조합
    for (const [sid, starts] of Array.from(usageScope.entries())) {
      for (const start of Array.from(starts)) {
        const { error: dErr } = await supabase
          .from('monthly_usage')
          .delete()
          .eq('sub_company_id', sid)
          .eq('usage_start', start)
          .eq('source', 'import_v1');
        if (dErr) throw new Error(`사용량 사전삭제 실패: ${dErr.message}`);
      }
    }
    const { error: uErr } = await supabase.from('monthly_usage').insert(usagePayload);
    if (uErr) throw new Error(`사용량 추가 실패: ${uErr.message}`);
    insertedUsage = usagePayload.length;
  }

  return {
    companies: { upserted: upsertedCompanies?.length ?? 0 },
    sub_companies: { upserted: upsertedSubs.length },
    contacts: { inserted: insertedContacts },
    usage: { inserted: insertedUsage },
    warnings,
  };
}
