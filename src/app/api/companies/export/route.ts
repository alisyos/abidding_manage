import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildCompaniesWorkbook } from '@/lib/companies/export-xlsx';
import type { FlatRow } from '@/lib/companies/bulk-template';
import { ACCOUNT_TYPE_LABEL } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 거래처 대량 관리 양식 다운로드 (거래처 + 세부거래처 + 연락처 평면 시트).
 *   GET /api/companies/export                 — 전체(또는 필터) 데이터
 *   GET /api/companies/export?template=empty  — 헤더만(빈 양식)
 *   필터: ?q= &account_type= &status=active|inactive|all &group_id=
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '인증되지 않은 사용자' }, { status: 401 });
  }

  const url = new URL(req.url);
  const empty = url.searchParams.get('template') === 'empty';

  let rows: FlatRow[] = [];

  if (!empty) {
    const q = (url.searchParams.get('q') ?? '').trim();
    const accountType = url.searchParams.get('account_type');
    const status = url.searchParams.get('status') ?? 'all';
    const groupId = (url.searchParams.get('group_id') ?? '').trim();

    let query = supabase
      .from('companies')
      .select(
        `id, no, name, account_type, user_database, user_agency_id, url, memo, is_active,
         sub_companies(id, name, database_code, agency_id, memo,
           company_contacts(id, role, display_name, email, phone, formatted_address, sort_order))`,
      )
      .order('name', { ascending: true });

    if (q) query = query.ilike('name', `%${q}%`);
    if (accountType) query = query.eq('account_type', accountType);
    if (status === 'active') query = query.eq('is_active', true);
    else if (status === 'inactive') query = query.eq('is_active', false);

    if (groupId) {
      const { data: memberRows } = await supabase
        .from('company_group_members')
        .select('company_id')
        .eq('group_id', groupId);
      const memberIds = (memberRows ?? []).map((m) => m.company_id);
      query = query.in('id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000']);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type Contact = {
      id: string;
      role: 'primary' | 'cc';
      display_name: string | null;
      email: string;
      phone: string | null;
      formatted_address: string | null;
      sort_order: number;
    };
    type Sub = {
      id: string;
      name: string;
      database_code: string | null;
      agency_id: string | null;
      memo: string | null;
      company_contacts: Contact[] | null;
    };
    type Company = {
      id: string;
      no: number | null;
      name: string;
      account_type: 'advertiser' | 'agency';
      user_database: string | null;
      user_agency_id: string | null;
      url: string | null;
      memo: string | null;
      is_active: boolean;
      sub_companies: Sub[] | null;
    };

    const companies = (data ?? []) as unknown as Company[];

    for (const c of companies) {
      const companyBase = {
        company_id: c.id,
        company_name: c.name,
        no: c.no,
        account_type: ACCOUNT_TYPE_LABEL[c.account_type] ?? '',
        user_database: c.user_database,
        user_agency_id: c.user_agency_id,
        url: c.url,
        company_memo: c.memo,
        is_active: c.is_active ? 'Y' : 'N',
      };

      const subs = (c.sub_companies ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

      if (subs.length === 0) {
        rows.push(blankRow({ ...companyBase }));
        continue;
      }

      for (const s of subs) {
        const subBase = {
          sub_company_id: s.id,
          sub_company_name: s.name,
          database_code: s.database_code,
          agency_id: s.agency_id,
          sub_memo: s.memo,
        };
        const contacts = (s.company_contacts ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order || a.role.localeCompare(b.role));

        if (contacts.length === 0) {
          rows.push(blankRow({ ...companyBase, ...subBase }));
          continue;
        }

        for (const ct of contacts) {
          rows.push(
            blankRow({
              ...companyBase,
              ...subBase,
              contact_id: ct.id,
              role: ct.role === 'cc' ? '참조' : '받는사람',
              display_name: ct.display_name,
              email: ct.email,
              phone: ct.phone,
              formatted_address: ct.formatted_address,
            }),
          );
        }
      }
    }
  }

  const buf = buildCompaniesWorkbook(rows);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filenameBase = empty ? '거래처_양식' : `거래처_${today}`;

  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filenameBase)}.xlsx`,
      'Cache-Control': 'no-store',
    },
  });
}

/** 부분 필드만 채운 평면 행을 완전한 FlatRow로 보정. */
function blankRow(partial: Partial<FlatRow>): FlatRow {
  return {
    company_id: null,
    sub_company_id: null,
    contact_id: null,
    company_name: null,
    no: null,
    account_type: null,
    user_database: null,
    user_agency_id: null,
    url: null,
    company_memo: null,
    is_active: null,
    sub_company_name: null,
    database_code: null,
    agency_id: null,
    sub_memo: null,
    role: null,
    display_name: null,
    email: null,
    phone: null,
    formatted_address: null,
    ...partial,
  };
}
