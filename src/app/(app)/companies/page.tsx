import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { CompaniesFilterBar } from './_components/companies-filter-bar';
import { CompaniesTableWrapper } from './_components/companies-table-wrapper';
import type { CompaniesRow } from './_components/companies-table';

export const metadata = { title: '거래처 관리 · 에이비딩 관리' };

interface PageProps {
  searchParams: {
    q?: string;
    account_type?: 'agency' | 'advertiser';
    status?: 'active' | 'inactive' | 'all';
    page?: string;
    size?: string;
  };
}

export default async function CompaniesPage({ searchParams }: PageProps) {
  const supabase = createClient();

  const q = (searchParams.q ?? '').trim();
  const accountType = searchParams.account_type ?? null;
  const status = searchParams.status ?? 'active';
  const page = Math.max(1, Number(searchParams.page ?? '1'));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.size ?? '25')));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

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
            <Button variant="outline" asChild>
              <Link href="/companies/import">엑셀 가져오기</Link>
            </Button>
            <Button asChild>
              <Link href="/companies/new">신규 등록</Link>
            </Button>
          </>
        }
      />
      <CompaniesFilterBar />
      <div className="p-8">
        <CompaniesTableWrapper
          rows={rows}
          totalCount={count ?? 0}
          pageIndex={page - 1}
          pageSize={pageSize}
        />
      </div>
    </div>
  );
}
