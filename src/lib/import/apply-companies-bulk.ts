import type { SupabaseClient } from '@supabase/supabase-js';
import { generateFormattedAddress } from '@/lib/format/contact';
import type { ParsedFlatRow } from './parse-companies-flat';
import type { BulkApplyResult } from '@/lib/validation/company-bulk';

// ───────────────────────────────────────────────────────────────
// 그룹화: 평면 행 → 거래처 > 세부거래처 > 연락처 트리
// ───────────────────────────────────────────────────────────────

interface ContactNode {
  contact_id: string | null;
  role: 'primary' | 'cc' | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  formatted_address: string | null;
}

interface SubNode {
  sub_company_id: string | null;
  name: string;
  database_code: string | null;
  agency_id: string | null;
  memo: string | null;
  contacts: ContactNode[];
}

interface CompanyNode {
  company_id: string | null;
  name: string;
  no: number | null;
  account_type: 'advertiser' | 'agency' | null;
  user_database: string | null;
  user_agency_id: string | null;
  url: string | null;
  memo: string | null;
  is_active: boolean | null;
  subs: SubNode[];
}

export function groupCompanies(rows: ParsedFlatRow[]): CompanyNode[] {
  const companyMap = new Map<string, CompanyNode>();
  // 그룹 내 sub 키 → SubNode (회사별로 분리)
  const subMaps = new Map<string, Map<string, SubNode>>();

  for (const row of rows) {
    if (!row.company_name) continue;
    const cKey = row.company_id ? `id:${row.company_id}` : `new:${row.company_name}`;

    let company = companyMap.get(cKey);
    if (!company) {
      company = {
        company_id: row.company_id,
        name: row.company_name,
        no: row.no,
        account_type: row.account_type,
        user_database: row.user_database,
        user_agency_id: row.user_agency_id,
        url: row.url,
        memo: row.company_memo,
        is_active: row.is_active,
        subs: [],
      };
      companyMap.set(cKey, company);
      subMaps.set(cKey, new Map());
    }

    // 세부거래처 (이름 또는 ID 있을 때만)
    const hasSub = !!(row.sub_company_name || row.sub_company_id);
    let sub: SubNode | undefined;
    if (hasSub) {
      const subMap = subMaps.get(cKey)!;
      const sKey = row.sub_company_id
        ? `id:${row.sub_company_id}`
        : `new:${row.sub_company_name}`;
      sub = subMap.get(sKey);
      if (!sub) {
        sub = {
          sub_company_id: row.sub_company_id,
          name: row.sub_company_name ?? '',
          database_code: row.database_code,
          agency_id: row.agency_id,
          memo: row.sub_memo,
          contacts: [],
        };
        subMap.set(sKey, sub);
        company.subs.push(sub);
      }
    }

    // 연락처 (이메일 또는 연락처ID 있는 행만)
    if ((row.email || row.contact_id) && sub) {
      sub.contacts.push({
        contact_id: row.contact_id,
        role: row.role,
        display_name: row.display_name,
        email: row.email,
        phone: row.phone,
        formatted_address: row.formatted_address,
      });
    }
  }

  return Array.from(companyMap.values());
}

/** dry-run용 신규/수정 건수 집계. */
export function computeCounts(rows: ParsedFlatRow[]) {
  const tree = groupCompanies(rows);
  const counts = {
    companies: { insert: 0, update: 0 },
    subCompanies: { insert: 0, update: 0 },
    contacts: { insert: 0, update: 0 },
  };
  for (const c of tree) {
    if (c.company_id) counts.companies.update++;
    else counts.companies.insert++;
    for (const s of c.subs) {
      if (s.sub_company_id) counts.subCompanies.update++;
      else counts.subCompanies.insert++;
      for (const ct of s.contacts) {
        if (ct.contact_id) counts.contacts.update++;
        else counts.contacts.insert++;
      }
    }
  }
  return counts;
}

// ───────────────────────────────────────────────────────────────
// 적용
// ───────────────────────────────────────────────────────────────

function nullable(v: string | null): string | null {
  return v && v.trim().length > 0 ? v.trim() : null;
}

export async function applyCompaniesBulk(
  supabase: SupabaseClient,
  rows: ParsedFlatRow[],
): Promise<BulkApplyResult> {
  const tree = groupCompanies(rows);
  const result: BulkApplyResult = {
    companies: { inserted: 0, updated: 0 },
    sub_companies: { inserted: 0, updated: 0 },
    contacts: { inserted: 0, updated: 0 },
    warnings: [],
  };

  for (const company of tree) {
    let companyId = company.company_id;

    if (companyId) {
      // 거래처 수정 — 빈 칸은 비움(name 필수). account_type/is_active는 빈 값이면 유지.
      const payload: Record<string, unknown> = {
        name: company.name,
        no: company.no,
        user_database: nullable(company.user_database),
        user_agency_id: nullable(company.user_agency_id),
        url: nullable(company.url),
        memo: nullable(company.memo),
        updated_at: new Date().toISOString(),
      };
      if (company.account_type) payload.account_type = company.account_type;
      if (company.is_active != null) payload.is_active = company.is_active;

      const { error } = await supabase.from('companies').update(payload).eq('id', companyId);
      if (error) {
        result.warnings.push(`거래처 수정 실패(${company.name}): ${error.message}`);
        continue;
      }
      result.companies.updated++;
    } else {
      // 신규 거래처 insert. 이름 중복(23505)이면 기존 이름으로 매칭(수정).
      const { data, error } = await supabase
        .from('companies')
        .insert({
          name: company.name,
          no: company.no,
          account_type: company.account_type ?? 'agency',
          user_database: nullable(company.user_database),
          user_agency_id: nullable(company.user_agency_id),
          url: nullable(company.url),
          memo: nullable(company.memo),
          is_active: company.is_active ?? true,
        })
        .select('id')
        .single();

      if (error || !data) {
        if (error?.code === '23505') {
          const { data: existing } = await supabase
            .from('companies')
            .select('id')
            .eq('name', company.name)
            .single();
          if (existing) {
            companyId = existing.id;
            result.warnings.push(`거래처 '${company.name}'는 이미 존재하여 기존 거래처로 매칭했습니다.`);
            result.companies.updated++;
          } else {
            result.warnings.push(`거래처 생성 실패(${company.name}): ${error?.message}`);
            continue;
          }
        } else {
          result.warnings.push(`거래처 생성 실패(${company.name}): ${error?.message}`);
          continue;
        }
      } else {
        companyId = data.id;
        result.companies.inserted++;
      }
    }

    if (!companyId) continue;

    // 세부거래처
    for (const sub of company.subs) {
      if (!sub.name) {
        result.warnings.push(`세부거래처명이 비어 있어 건너뜀(거래처 ${company.name}).`);
        continue;
      }
      let subId = sub.sub_company_id;

      if (subId) {
        const { error } = await supabase
          .from('sub_companies')
          .update({
            name: sub.name,
            database_code: nullable(sub.database_code),
            agency_id: nullable(sub.agency_id),
            memo: nullable(sub.memo),
          })
          .eq('id', subId);
        if (error) {
          result.warnings.push(`세부거래처 수정 실패(${sub.name}): ${error.message}`);
          continue;
        }
        result.sub_companies.updated++;
      } else {
        const { data, error } = await supabase
          .from('sub_companies')
          .insert({
            company_id: companyId,
            name: sub.name,
            database_code: nullable(sub.database_code),
            agency_id: nullable(sub.agency_id),
            memo: nullable(sub.memo),
          })
          .select('id')
          .single();
        if (error || !data) {
          // (company_id, name) 중복 → 기존 매칭
          if (error?.code === '23505') {
            const { data: ex } = await supabase
              .from('sub_companies')
              .select('id')
              .eq('company_id', companyId)
              .eq('name', sub.name)
              .single();
            if (ex) {
              subId = ex.id;
              result.sub_companies.updated++;
            } else {
              result.warnings.push(`세부거래처 생성 실패(${sub.name}): ${error?.message}`);
              continue;
            }
          } else {
            result.warnings.push(`세부거래처 생성 실패(${sub.name}): ${error?.message}`);
            continue;
          }
        } else {
          subId = data.id;
          result.sub_companies.inserted++;
        }
      }

      if (!subId) continue;

      // 연락처
      for (const ct of sub.contacts) {
        const formatted =
          ct.formatted_address ??
          generateFormattedAddress({
            companyName: company.name,
            displayName: ct.display_name,
            email: ct.email,
          });

        if (ct.contact_id) {
          const payload: Record<string, unknown> = {
            display_name: nullable(ct.display_name),
            phone: nullable(ct.phone),
            formatted_address: nullable(formatted),
          };
          if (ct.role) payload.role = ct.role;
          if (ct.email) payload.email = ct.email;

          const { error } = await supabase
            .from('company_contacts')
            .update(payload)
            .eq('id', ct.contact_id);
          if (error) {
            result.warnings.push(`연락처 수정 실패(${ct.email ?? ct.contact_id}): ${error.message}`);
            continue;
          }
          result.contacts.updated++;
        } else {
          if (!ct.email) continue; // 신규는 이메일 필수
          const { error } = await supabase.from('company_contacts').insert({
            sub_company_id: subId,
            role: ct.role ?? 'primary',
            display_name: nullable(ct.display_name),
            email: ct.email,
            phone: nullable(ct.phone),
            formatted_address: nullable(formatted),
            sort_order: ct.role === 'cc' ? 1 : 0,
          });
          if (error) {
            result.warnings.push(`연락처 생성 실패(${ct.email}): ${error.message}`);
            continue;
          }
          result.contacts.inserted++;
        }
      }
    }
  }

  return result;
}
