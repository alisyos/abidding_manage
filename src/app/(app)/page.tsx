import { TrendingUp, Send, AlertCircle, FileText } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { formatKRW } from '@/lib/format/currency';
import { todayKstISO } from '@/lib/format/date';
import { DashboardKpiCard } from './_components/dashboard-kpi-card';

export const metadata = { title: '대시보드 · 에이비딩 관리' };

export default async function DashboardPage() {
  const supabase = createClient();

  // 이번달 KST 범위
  const month = todayKstISO().slice(0, 7); // YYYY-MM
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(y, m, 0).getDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

  // 4종 KPI 병렬 조회
  const [
    monthlyRevenueRes,
    draftCountRes,
    unpaidRes,
    monthlyQuoteCountRes,
  ] = await Promise.all([
    // 이번달 매출 합계
    supabase
      .from('sales_records')
      .select('total_amount')
      .eq('revenue_month', monthStart),
    // 발송 대기 건수 (status='draft')
    supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft'),
    // 미입금 합계 (전체 기간, payment_date is null)
    supabase
      .from('sales_records')
      .select('total_amount')
      .is('payment_date', null),
    // 이번달 견적 건수
    supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .gte('service_start', monthStart)
      .lte('service_start', monthEnd),
  ]);

  type SumRow = { total_amount: number };
  const monthlyRevenue = ((monthlyRevenueRes.data ?? []) as SumRow[]).reduce(
    (s, r) => s + Number(r.total_amount ?? 0),
    0,
  );
  const draftCount = draftCountRes.count ?? 0;
  const unpaidTotal = ((unpaidRes.data ?? []) as SumRow[]).reduce(
    (s, r) => s + Number(r.total_amount ?? 0),
    0,
  );
  const monthlyQuoteCount = monthlyQuoteCountRes.count ?? 0;

  const monthLabel = month.replace('-', '.');

  const hasError =
    monthlyRevenueRes.error ||
    draftCountRes.error ||
    unpaidRes.error ||
    monthlyQuoteCountRes.error;

  return (
    <div>
      <PageHeader
        title="대시보드"
        description={`${monthLabel} 매출과 견적 현황을 한눈에 확인합니다.`}
      />
      <div className="p-8 space-y-6">
        {hasError && (
          <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-xs px-3 py-2">
            대시보드 일부 KPI 로드 실패: {String(monthlyRevenueRes.error?.message ?? draftCountRes.error?.message ?? unpaidRes.error?.message ?? monthlyQuoteCountRes.error?.message)}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <DashboardKpiCard
            label={`${monthLabel} 매출`}
            value={formatKRW(monthlyRevenue)}
            href={`/sales?month=${month}`}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <DashboardKpiCard
            label="발송 대기 견적"
            value={`${draftCount.toLocaleString()}건`}
            href="/quotes?status=draft"
            accent="text-blue-700"
            icon={<Send className="h-4 w-4" />}
          />
          <DashboardKpiCard
            label="미입금 합계 (전체)"
            value={formatKRW(unpaidTotal)}
            href="/sales"
            accent="text-amber-700"
            icon={<AlertCircle className="h-4 w-4" />}
          />
          <DashboardKpiCard
            label={`${monthLabel} 견적 건수`}
            value={`${monthlyQuoteCount.toLocaleString()}건`}
            href="/quotes"
            icon={<FileText className="h-4 w-4" />}
          />
        </div>

        <div className="rounded-md bg-gray-50 border border-gray-200 text-gray-600 text-xs px-4 py-3">
          ℹ 각 카드를 클릭하면 해당 메뉴의 상세 화면으로 이동합니다.
          미입금 카드는 매출월과 무관하게 입금되지 않은 모든 견적을 합산합니다.
        </div>
      </div>
    </div>
  );
}
