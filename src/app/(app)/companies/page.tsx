import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { CompaniesFilterBar } from './_components/companies-filter-bar';
import { CompaniesTableWrapper } from './_components/companies-table-wrapper';
import { GroupManagerDialog, type GroupOption } from './_components/group-manager-dialog';
import type { CompaniesRow } from './_components/companies-table';

export const metadata = { title: '거래처 관리 · 에이비딩 관리' };

interface PageProps {
  searchParams: {
    q?: string;
    account_type?: 'agency' | 'advertiser';
    status?: 'active' | 'inactive' | 'all';
    group_id?: string;
    page?: string;
    size?: string;
  };
}

export default async function CompaniesPage({ searchParams }: PageProps) {
  const supabase = createClient();

  const q = (searchParams.q ?? '').trim();
  const accountType = searchParams.account_type ?? null;
  const status = searchParams.status ?? 'active';
  const groupId = (searchParams.group_id ?? '').trim();
  const page = Math.max(1, Number(searchParams.page ?? '1'));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.size ?? '25')));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // 거래처 그룹 목록 (+ 멤버 수)
  const { data: groupData } = await supabase
    .from('company_groups')
    .select('id, name, company_group_members(count)')
    .order('name', { ascending: true });
  const groups: GroupOption[] = ((groupData ?? []) as unknown as Array<{
    id: string;
    name: string;
    company_group_members: { count: number }[];
  }>).map((g) => ({
    id: g.id,
    name: g.name,
    member_count: g.company_group_members?.[0]?.count ?? 0,
  }));

  let query = supabase
    .from('companies')
    .select('id, no, name, account_type, is_active, sub_companies(id, company_contacts(id))', {
      count: 'exact',
    })
    .order('name', { ascending: true })
    .range(from, to);

  if (q) query = query.ilike('name', `%${q}%`);
  if (accountType) query = query.eq('account_type', accountType);
  if (status === 'active') query = query.eq('is_active', true);
  else if (status === 'inactive') query = query.eq('is_active', false);

  // 그룹 필터: 해당 그룹의 멤버 거래처만
  if (groupId) {
    const { data: memberRows } = await supabase
      .from('company_group_members')
      .select('company_id')
      .eq('group_id', groupId);
    const memberIds = (memberRows ?? []).map((m) => m.company_id);
    // 멤버가 없으면 빈 결과가 나오도록 존재하지 않는 id 사용
    query = query.in('id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000']);
  }

  // 엑셀 다운로드 URL (현재 필터 반영)
  const exportParams = new URLSearchParams();
  if (q) exportParams.set('q', q);
  if (accountType) exportParams.set('account_type', accountType);
  if (status) exportParams.set('status', status);
  if (groupId) exportParams.set('group_id', groupId);
  const exportHref = `/api/companies/export${exportParams.toString() ? `?${exportParams}` : ''}`;

  const { data, error, count } = await query;

  if (error) {
    return (
      <div>
        <PageHeader title="거래처 관리" />
        <div className="p-8 text-red-600">거래처 로드 실패: {error.message}</div>
      </div>
    );
  }

  const rows: CompaniesRow[] = (data ?? []).map((c) => {
    const subs = (c.sub_companies ?? []) as Array<{
      id: string;
      company_contacts: Array<{ id: string }> | null;
    }>;
    return {
      id: c.id,
      no: c.no ?? null,
      name: c.name,
      account_type: c.account_type as 'advertiser' | 'agency',
      is_active: c.is_active,
      sub_count: subs.length,
      contact_count: subs.reduce((sum, s) => sum + (s.company_contacts?.length ?? 0), 0),
    };
  });

  return (
    <div>
      <PageHeader
        title="거래처 관리"
        description="거래처(광고주/제휴사) 및 세부거래처, 견적 수신자 정보를 관리합니다."
        actions={
          <>
            <GroupManagerDialog groups={groups} />
            <Button variant="outline" asChild>
              <a href={exportHref} download>
                엑셀 다운로드
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/companies/import">엑셀 가져오기</Link>
            </Button>
            <Button asChild>
              <Link href="/companies/new">신규 등록</Link>
            </Button>
          </>
        }
      />
      <CompaniesFilterBar groups={groups} />
      <div className="p-8">
        <CompaniesTableWrapper
          rows={rows}
          totalCount={count ?? 0}
          pageIndex={page - 1}
          pageSize={pageSize}
          groups={groups}
        />
      </div>
    </div>
  );
}
