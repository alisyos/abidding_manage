import Link from 'next/link';
import { Download, Upload } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { computeExtraDiscount } from '@/lib/quotes/calculator';
import { todayKstISO } from '@/lib/format/date';
import {
  buildSalesPivot,
  type PivotSalesRecord,
  type PivotQuoteItem,
} from '@/lib/sales/pivot';
import { MonthPicker } from './_components/month-picker';
import { SalesSearchBar } from './_components/sales-search-bar';
import { KpiCards } from './_components/kpi-cards';
import { SalesPivotTable } from './_components/sales-pivot-table';
import type { Media, Tier, QuoteStatus } from '@/lib/supabase/types';

export const metadata = { title: '매출 관리 · 에이비딩 관리' };

interface PageProps {
  searchParams: { month?: string; q?: string };
}

export default async function SalesPage({ searchParams }: PageProps) {
  const supabase = createClient();

  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)
      ? searchParams.month
      : todayKstISO().slice(0, 7);

  const q = (searchParams.q ?? '').trim();

  type SaleRow = {
    id: string;
    quote_id: string;
    company_id: string;
    sub_company_id: string | null;
    base_amount: number;
    variable_adjust: number;
    total_amount: number;
    vat_amount: number;
    payment_date: string | null;
    tax_invoice_no: string | null;
    quotes: {
      quote_no: string | null;
      status: QuoteStatus;
      extra_discount_rate: number;
      extra_discount_amount: number;
    } | null;
    companies: { name: string } | null;
    sub_companies: { name: string } | null;
  };

  const { data: salesRaw, error } = await supabase
    .from('sales_records')
    .select(
      `id, quote_id, company_id, sub_company_id, base_amount, variable_adjust, total_amount, vat_amount,
       payment_date, tax_invoice_no,
       quotes(quote_no, status, extra_discount_rate, extra_discount_amount), companies(name), sub_companies(name)`,
    )
    .eq('revenue_month', `${month}-01`);

  if (error) {
    return (
      <div>
        <PageHeader title="매출 관리" />
        <div className="p-8 text-red-600">매출 로드 실패: {error.message}</div>
      </div>
    );
  }

  const sales = (salesRaw ?? []) as unknown as SaleRow[];

  // 거래처/세부거래처명 검색 필터 (대소문자 무시 부분 일치)
  const filtered = q
    ? sales.filter((s) => {
        const hay = `${s.companies?.name ?? ''} ${s.sub_companies?.name ?? ''}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
    : sales;

  // 관련 quote_items 일괄 조회
  const quoteIds = filtered.map((s) => s.quote_id);
  type ItemRow = { quote_id: string; media: Media; tier: Tier; quantity: number };
  const items: ItemRow[] = [];
  // 조정 delta — 매출 사용량 셀에 합산("조정 후 수량")
  type AdjRow = {
    quote_id: string;
    media: Media;
    delta_unique: number;
    delta_premium: number;
    delta_basic: number;
    delta_lite: number;
  };
  const adjRows: AdjRow[] = [];
  if (quoteIds.length > 0) {
    const [itemsRes, adjRes] = await Promise.all([
      supabase
        .from('quote_items')
        .select('quote_id, media, tier, quantity')
        .in('quote_id', quoteIds),
      supabase
        .from('quote_adjustments')
        .select('quote_id, media, delta_unique, delta_premium, delta_basic, delta_lite')
        .in('quote_id', quoteIds),
    ]);
    items.push(...((itemsRes.data ?? []) as unknown as ItemRow[]));
    adjRows.push(...((adjRes.data ?? []) as unknown as AdjRow[]));
  }

  const records: PivotSalesRecord[] = filtered.map((s) => {
    const base = Number(s.base_amount ?? 0);
    const extraDiscount = computeExtraDiscount(
      base,
      Number(s.quotes?.extra_discount_rate ?? 0),
      Number(s.quotes?.extra_discount_amount ?? 0),
    );
    return {
      id: s.id,
      quote_id: s.quote_id,
      quote_no: s.quotes?.quote_no ?? null,
      quote_status: (s.quotes?.status ?? 'won') as QuoteStatus,
      company_id: s.company_id,
      company_name: s.companies?.name ?? '-',
      sub_company_id: s.sub_company_id,
      sub_company_name: s.sub_companies?.name ?? null,
      base_amount: base,
      extra_discount: extraDiscount,
      variable_adjust: Number(s.variable_adjust ?? 0),
      total_amount: Number(s.total_amount ?? 0),
      vat_amount: Number(s.vat_amount ?? 0),
      payment_date: s.payment_date,
      tax_invoice_no: s.tax_invoice_no,
    };
  });
  const pivotItems: PivotQuoteItem[] = items.map((i) => ({
    quote_id: i.quote_id,
    media: i.media,
    tier: i.tier,
    quantity: i.quantity,
  }));
  // 조정 delta 를 (media,tier) 합성 항목으로 펼쳐 사용량 셀에 합산
  const TIER_KEYS: Tier[] = ['unique', 'premium', 'basic', 'lite'];
  for (const a of adjRows) {
    const deltas: Record<Tier, number> = {
      unique: Number(a.delta_unique ?? 0),
      premium: Number(a.delta_premium ?? 0),
      basic: Number(a.delta_basic ?? 0),
      lite: Number(a.delta_lite ?? 0),
    };
    for (const tier of TIER_KEYS) {
      if (deltas[tier] !== 0) {
        pivotItems.push({ quote_id: a.quote_id, media: a.media, tier, quantity: deltas[tier] });
      }
    }
  }

  const pivot = buildSalesPivot(records, pivotItems);

  // KPI — 공급가액(부가세 별도) 기준
  const supplyOf = (r: PivotSalesRecord) => r.total_amount - r.vat_amount;
  const unpaid = records
    .filter((r) => !r.payment_date)
    .reduce((s, r) => s + supplyOf(r), 0);
  const paid = records
    .filter((r) => !!r.payment_date)
    .reduce((s, r) => s + supplyOf(r), 0);

  const monthLabel = month.replace('-', '.');

  return (
    <div>
      <PageHeader
        title="매출 관리"
        description="견적이 수주(won)로 전환되면 자동으로 매출에 반영됩니다. 입금확인(paid) 시 입금일자가 함께 기록됩니다. 금액은 부가세 별도(공급가액) 기준입니다."
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/api/sales/export?month=${month}`} download>
                <Download className="h-4 w-4 mr-1" /> 엑셀 내보내기
              </a>
            </Button>
            <Button asChild>
              <Link href="/sales/import">
                <Upload className="h-4 w-4 mr-1" /> 입금 가져오기
              </Link>
            </Button>
          </>
        }
      />

      <div className="px-8 pt-4 flex items-center justify-between gap-4">
        <SalesSearchBar q={q} />
        <MonthPicker month={month} />
      </div>

      <div className="p-8 space-y-6">
        <KpiCards
          monthLabel={monthLabel}
          total={pivot.totals.total_amount - pivot.totals.vat_amount}
          unpaid={unpaid}
          paid={paid}
          count={records.length}
        />
        <SalesPivotTable pivot={pivot} />
      </div>
    </div>
  );
}
