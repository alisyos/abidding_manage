import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { BulkSendClient, type DraftRow } from './_components/bulk-send-client';

export const metadata = { title: '일괄 발송 · 에이비딩 관리' };

interface PageProps {
  searchParams: { month?: string };
}

export default async function BulkSendPage({ searchParams }: PageProps) {
  const supabase = createClient();
  const month = searchParams.month;

  type Row = {
    id: string;
    quote_no: string | null;
    service_start: string;
    service_end: string;
    total_amount: number;
    sub_company_id: string | null;
    companies: { name: string } | null;
    sub_companies: { name: string } | null;
  };

  let query = supabase
    .from('quotes')
    .select(
      'id, quote_no, service_start, service_end, total_amount, sub_company_id, companies(name), sub_companies(name)',
    )
    .eq('status', 'draft')
    .order('service_start', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yStr, mStr] = month.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const last = new Date(y, m, 0).getDate();
    query = query
      .gte('service_start', `${month}-01`)
      .lte('service_start', `${month}-${String(last).padStart(2, '0')}`);
  }

  const { data: rowsRaw, error } = await query;
  if (error) {
    return (
      <div>
        <PageHeader title="일괄 발송" />
        <div className="p-8 text-red-600">로드 실패: {error.message}</div>
      </div>
    );
  }
  const rows = (rowsRaw ?? []) as unknown as Row[];

  // primary contact 일괄 조회 (sub_company_id 기반)
  const subIds = Array.from(
    new Set(rows.map((r) => r.sub_company_id).filter((x): x is string => !!x)),
  );
  const primaryBySub = new Map<string, string>();
  if (subIds.length > 0) {
    const { data: cRows } = await supabase
      .from('company_contacts')
      .select('sub_company_id, display_name, email, formatted_address, sort_order')
      .eq('role', 'primary')
      .in('sub_company_id', subIds)
      .order('sort_order', { ascending: true });
    type C = { sub_company_id: string; display_name: string | null; email: string; formatted_address: string | null };
    for (const c of (cRows ?? []) as C[]) {
      if (!primaryBySub.has(c.sub_company_id)) {
        primaryBySub.set(c.sub_company_id, c.formatted_address ?? `${c.display_name ?? ''} <${c.email}>`);
      }
    }
  }

  const initialRows: DraftRow[] = rows.map((r) => ({
    id: r.id,
    quote_no: r.quote_no,
    company_name: r.companies?.name ?? '-',
    sub_company_name: r.sub_companies?.name ?? null,
    primary_contact: r.sub_company_id ? primaryBySub.get(r.sub_company_id) ?? null : null,
    service_start: r.service_start,
    service_end: r.service_end,
    total_amount: Number(r.total_amount ?? 0),
  }));

  return (
    <div>
      <PageHeader
        title="일괄 발송"
        description="발송 대기(임시저장) 견적을 다중 선택하여 한 번에 발송합니다. 각 견적의 수신자/참조는 거래처 연락처에서 자동으로 채워집니다."
      />
      <div className="p-8">
        <BulkSendClient initialRows={initialRows} />
      </div>
    </div>
  );
}
