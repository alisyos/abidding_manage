import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { AdjustmentsFilterBar } from './_components/adjustments-filter-bar';
import { AdjustmentsTableWrapper } from './_components/adjustments-table-wrapper';
import type { AdjustmentRow } from './_components/adjustments-table';
import type { Media } from '@/lib/supabase/types';

export const metadata = { title: '조정 관리 · 에이비딩 관리' };

interface PageProps {
  searchParams: {
    q?: string;
    month?: string;
    page?: string;
    size?: string;
  };
}

export default async function AdjustmentsPage({ searchParams }: PageProps) {
  const supabase = createClient();

  const q = (searchParams.q ?? '').trim();
  // 월 필터: param 없음 → 현재 월(디폴트), 빈 문자열 → 전체 기간, YYYY-MM → 해당 월
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const effectiveMonth = searchParams.month === undefined ? currentMonth : searchParams.month;

  const page = Math.max(1, Number(searchParams.page ?? '1'));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.size ?? '25')));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  type Row = {
    id: string;
    adjustment_date: string;
    quote_id: string;
    media: Media;
    delta_unique: number;
    delta_premium: number;
    delta_basic: number;
    delta_lite: number;
    pre_adjust_amount: number;
    reason: string | null;
    quotes: {
      quote_no: string | null;
      company_id: string;
      service_start: string;
      companies: { name: string } | null;
    } | null;
  };

  let query = supabase
    .from('quote_adjustments')
    .select(
      `id, adjustment_date, quote_id, media,
       delta_unique, delta_premium, delta_basic, delta_lite,
       pre_adjust_amount, reason,
       quotes!inner(quote_no, company_id, service_start, companies!inner(name))`,
      { count: 'exact' },
    )
    .order('adjustment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  // 기간: 대상 견적의 서비스 시작일(quotes.service_start) 기준
  if (effectiveMonth && /^\d{4}-\d{2}$/.test(effectiveMonth)) {
    const [yStr, mStr] = effectiveMonth.split('-');
    const last = new Date(Number(yStr), Number(mStr), 0).getDate();
    query = query
      .gte('quotes.service_start', `${effectiveMonth}-01`)
      .lte('quotes.service_start', `${effectiveMonth}-${String(last).padStart(2, '0')}`);
  }

  // 검색: Q- 로 시작하면 견적번호, 그 외에는 대상 견적의 거래처명
  if (q) {
    if (/^Q-/i.test(q)) {
      query = query.ilike('quotes.quote_no', `%${q}%`);
    } else {
      query = query.ilike('quotes.companies.name', `%${q}%`);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    return (
      <div>
        <PageHeader title="조정 관리" />
        <div className="p-8 text-red-600">조정 내역 로드 실패: {error.message}</div>
      </div>
    );
  }

  const rows: AdjustmentRow[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    adjustment_date: r.adjustment_date,
    quote_id: r.quote_id,
    quote_no: r.quotes?.quote_no ?? null,
    company_name: r.quotes?.companies?.name ?? '-',
    media: r.media,
    delta_unique: r.delta_unique,
    delta_premium: r.delta_premium,
    delta_basic: r.delta_basic,
    delta_lite: r.delta_lite,
    pre_adjust_amount: Number(r.pre_adjust_amount ?? 0),
    reason: r.reason,
  }));

  return (
    <div>
      <PageHeader
        title="조정 관리"
        description="중도 사용량 변동 내역을 관리합니다. 조정 등록 시 견적의 변동조정가가 자동 갱신되고 안내 메일을 발송할 수 있습니다."
        actions={
          <Button asChild>
            <Link href="/adjustments/new">조정 등록</Link>
          </Button>
        }
      />
      <AdjustmentsFilterBar effectiveMonth={effectiveMonth} />
      <div className="p-8">
        <AdjustmentsTableWrapper
          rows={rows}
          totalCount={count ?? 0}
          pageIndex={page - 1}
          pageSize={pageSize}
        />
      </div>
    </div>
  );
}
