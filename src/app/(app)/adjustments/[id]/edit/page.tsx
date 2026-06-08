import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { fetchActivePriceMap } from '@/lib/quotes/pricing';
import {
  AdjustmentForm,
  type QuoteOption,
  type PriceRow,
  type EditContext,
} from '../../new/_components/adjustment-form';
import type { Media, Tier, Product } from '@/lib/supabase/types';

export const metadata = { title: '조정 수정 · 에이비딩 관리' };

const MEDIA_ORDER: Media[] = ['K', 'S', 'M'];
const TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];
const slotKey = (m: Media, t: Tier) => `${m}__${t}`;

interface PageProps {
  params: { id: string };
}

export default async function EditAdjustmentPage({ params }: PageProps) {
  const supabase = createClient();

  // 대표 행 → quote_id, adjustment_date
  const { data: reprRaw, error: reprErr } = await supabase
    .from('quote_adjustments')
    .select('id, quote_id, adjustment_date')
    .eq('id', params.id)
    .single();
  if (reprErr || !reprRaw) notFound();
  const repr = reprRaw as unknown as {
    id: string;
    quote_id: string;
    adjustment_date: string;
  };

  type QuoteRow = {
    id: string;
    quote_no: string | null;
    service_start: string;
    service_end: string;
    companies: { name: string } | null;
    sub_companies: { name: string } | null;
  };
  type ItemRow = { media: Media; tier: Tier; quantity: number; unit_price: number };
  type AdjRow = {
    id: string;
    adjustment_date: string;
    media: Media;
    delta_unique: number;
    delta_premium: number;
    delta_basic: number;
    delta_lite: number;
    pre_adjust_amount: number;
    reason: string | null;
  };

  const [qRes, itemsRes, adjRes, priceMap] = await Promise.all([
    supabase
      .from('quotes')
      .select('id, quote_no, service_start, service_end, companies(name), sub_companies(name)')
      .eq('id', repr.quote_id)
      .single(),
    supabase
      .from('quote_items')
      .select('media, tier, quantity, unit_price')
      .eq('quote_id', repr.quote_id),
    supabase
      .from('quote_adjustments')
      .select(
        'id, adjustment_date, media, delta_unique, delta_premium, delta_basic, delta_lite, pre_adjust_amount, reason',
      )
      .eq('quote_id', repr.quote_id),
    fetchActivePriceMap(supabase),
  ]);

  if (qRes.error || !qRes.data) notFound();
  const quote = qRes.data as unknown as QuoteRow;
  const items = (itemsRes.data ?? []) as unknown as ItemRow[];
  const allAdj = (adjRes.data ?? []) as unknown as AdjRow[];

  // 이벤트(같은 조정일자) vs 그 외
  const eventRows = allAdj.filter((a) => a.adjustment_date === repr.adjustment_date);
  const otherRows = allAdj.filter((a) => a.adjustment_date !== repr.adjustment_date);
  const replaceIds = eventRows.map((a) => a.id);

  const deltasOf = (a: AdjRow): Record<Tier, number> => ({
    unique: a.delta_unique,
    premium: a.delta_premium,
    basic: a.delta_basic,
    lite: a.delta_lite,
  });

  const original: Record<string, number> = {};
  for (const m of MEDIA_ORDER) {
    for (const t of TIER_ORDER) {
      original[slotKey(m, t)] =
        items.find((i) => i.media === m && i.tier === t)?.quantity ?? 0;
    }
  }

  // baseline = 원본 + Σ(이벤트 외 조정 delta)
  const baseline: Record<string, number> = { ...original };
  for (const a of otherRows) {
    const d = deltasOf(a);
    for (const t of TIER_ORDER) baseline[slotKey(a.media, t)] += Number(d[t] ?? 0);
  }
  for (const k of Object.keys(baseline)) baseline[k] = Math.max(0, baseline[k]);

  // initialTargets = baseline + 이벤트 delta
  const initialTargets: Record<string, number> = { ...baseline };
  for (const a of eventRows) {
    const d = deltasOf(a);
    for (const t of TIER_ORDER) initialTargets[slotKey(a.media, t)] += Number(d[t] ?? 0);
  }

  // 매체별 저장 정산액
  const initialAmounts: Record<string, number> = {};
  for (const a of eventRows) {
    initialAmounts[a.media] = (initialAmounts[a.media] ?? 0) + Number(a.pre_adjust_amount ?? 0);
  }

  const quoteOption: QuoteOption = {
    id: quote.id,
    quote_no: quote.quote_no,
    company_name: quote.companies?.name ?? '-',
    sub_company_name: quote.sub_companies?.name ?? null,
    service_start: quote.service_start,
    service_end: quote.service_end,
    items: items.map((i) => ({
      media: i.media,
      tier: i.tier,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
    })),
  };

  const prices: PriceRow[] = [];
  for (const media of MEDIA_ORDER) {
    for (const tier of TIER_ORDER) {
      const p = priceMap.get(`${media}__${tier}`) as Product | undefined;
      prices.push({ media, tier, unit_price: Number(p?.unit_price ?? 0) });
    }
  }

  const quoteLabel = `${quote.quote_no ?? ''} ${quote.companies?.name ?? '-'}${
    quote.sub_companies?.name ? ` / ${quote.sub_companies.name}` : ''
  } · ${quote.service_start}~${quote.service_end}`;

  const editContext: EditContext = {
    quoteId: quote.id,
    quoteLabel,
    adjustmentDate: repr.adjustment_date,
    reason: eventRows.find((a) => a.reason)?.reason ?? '',
    baseline,
    initialTargets,
    initialAmounts,
    replaceIds,
  };

  return (
    <div>
      <PageHeader
        title="조정 수정"
        description="기존 조정 내역을 수정합니다. 저장 시 해당 조정이 교체되고 매출이 재계산됩니다."
      />
      <div className="p-8 max-w-5xl">
        <AdjustmentForm
          mode="edit"
          quotes={[quoteOption]}
          prices={prices}
          editContext={editContext}
        />
      </div>
    </div>
  );
}
