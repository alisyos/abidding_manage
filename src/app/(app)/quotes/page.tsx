import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { QuotesFilterBar } from './_components/quotes-filter-bar';
import { QuotesTableWrapper } from './_components/quotes-table-wrapper';
import type { QuotesRow } from './_components/quotes-table';
import type { QuoteStatus } from '@/lib/supabase/types';

export const metadata = { title: '견적서 · 에이비딩 관리' };

interface PageProps {
  searchParams: {
    status?: 'draft' | 'sent' | 'won' | 'paid';
    month?: string;
    q?: string;
    page?: string;
    size?: string;
  };
}

export default async function QuotesPage({ searchParams }: PageProps) {
  const supabase = createClient();

  const status = searchParams.status;
  const month = (searchParams.month ?? '').trim();
  const q = (searchParams.q ?? '').trim();
  const page = Math.max(1, Number(searchParams.page ?? '1'));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.size ?? '25')));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('quotes')
    .select(
      'id, quote_no, status, service_start, service_end, total_amount, companies!inner(name), sub_companies(name)',
      { count: 'exact' },
    )
    .order('service_start', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yStr, mStr] = month.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const last = new Date(y, m, 0).getDate();
    query = query
      .gte('service_start', `${month}-01`)
      .lte('service_start', `${month}-${String(last).padStart(2, '0')}`);
  }

  // 검색: Q- 로 시작하면 견적번호, 그 외에는 거래처명 — 모두 DB 전체 대상 서버 필터
  if (q) {
    if (/^Q-/i.test(q)) {
      query = query.ilike('quote_no', `%${q}%`);
    } else {
      query = query.ilike('companies.name', `%${q}%`);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    return (
      <div>
        <PageHeader title="견적서" />
        <div className="p-8 text-red-600">견적 로드 실패: {error.message}</div>
      </div>
    );
  }

  type Row = {
    id: string;
    quote_no: string | null;
    status: QuoteStatus;
    service_start: string;
    service_end: string;
    total_amount: number;
    companies: { name: string } | null;
    sub_companies: { name: string } | null;
  };

  const rows: QuotesRow[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    quote_no: r.quote_no,
    status: r.status,
    service_start: r.service_start,
    service_end: r.service_end,
    total_amount: Number(r.total_amount ?? 0),
    company_name: r.companies?.name ?? '-',
    sub_company_name: r.sub_companies?.name ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="견적서"
        description="임시저장 / 발송 / 수주 / 입금확인 상태를 추적합니다. 수주 시 매출에 자동 반영됩니다."
        actions={
          <Button asChild>
            <Link href="/quotes/new">신규 견적</Link>
          </Button>
        }
      />
      <QuotesFilterBar />
      <div className="p-8">
        <QuotesTableWrapper
          rows={rows}
          totalCount={count ?? 0}
          pageIndex={page - 1}
          pageSize={pageSize}
        />
      </div>
    </div>
  );
}
