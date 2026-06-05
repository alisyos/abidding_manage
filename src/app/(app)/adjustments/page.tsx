import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { AdjustmentsTable, type AdjustmentRow } from './_components/adjustments-table';
import type { Media } from '@/lib/supabase/types';

export const metadata = { title: '조정 관리 · 에이비딩 관리' };

export default async function AdjustmentsPage() {
  const supabase = createClient();

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
    quotes: { quote_no: string | null; company_id: string; companies: { name: string } | null } | null;
  };

  const { data, error } = await supabase
    .from('quote_adjustments')
    .select(
      `id, adjustment_date, quote_id, media,
       delta_unique, delta_premium, delta_basic, delta_lite,
       pre_adjust_amount, reason,
       quotes(quote_no, company_id, companies(name))`,
    )
    .order('adjustment_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

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
      <div className="p-8">
        <AdjustmentsTable rows={rows} />
      </div>
    </div>
  );
}
