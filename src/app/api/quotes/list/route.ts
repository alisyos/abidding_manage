import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { QuoteStatus } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 견적 목록 조회 (클라이언트용). bulk-create 마법사에서 사용.
 *   GET /api/quotes/list?month=YYYY-MM&status=draft&size=200
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
  const month = url.searchParams.get('month');
  const status = url.searchParams.get('status') as QuoteStatus | null;
  const groupId = url.searchParams.get('group_id');
  const size = Math.min(500, Math.max(10, Number(url.searchParams.get('size') ?? '200')));

  let query = supabase
    .from('quotes')
    .select(
      'id, quote_no, status, service_start, service_end, total_amount, companies(name), sub_companies(name)',
    )
    .order('service_start', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(size);

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yStr, mStr] = month.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const last = new Date(y, m, 0).getDate();
    query = query
      .gte('service_start', `${month}-01`)
      .lte('service_start', `${month}-${String(last).padStart(2, '0')}`);
  }
  if (status) query = query.eq('status', status);

  // 그룹 필터: 해당 그룹에 속한 거래처의 견적만
  if (groupId) {
    const { data: memberRows, error: memberErr } = await supabase
      .from('company_group_members')
      .select('company_id')
      .eq('group_id', groupId);
    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }
    const memberIds = (memberRows ?? []).map((m) => m.company_id);
    query = query.in(
      'company_id',
      memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000'],
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  const quotes = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    quote_no: r.quote_no,
    status: r.status,
    service_start: r.service_start,
    service_end: r.service_end,
    total_amount: Number(r.total_amount ?? 0),
    company_name: r.companies?.name ?? '-',
    sub_company_name: r.sub_companies?.name ?? null,
  }));

  return NextResponse.json({ quotes });
}
