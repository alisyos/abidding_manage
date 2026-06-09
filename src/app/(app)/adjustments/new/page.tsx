import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { fetchActivePriceMap } from '@/lib/quotes/pricing';
import { todayKstISO } from '@/lib/format/date';
import { AdjustmentForm, type QuoteOption, type PriceRow } from './_components/adjustment-form';
import { AdjustmentQuoteFilter } from './_components/adjustment-quote-filter';
import type { Media, Tier, Product } from '@/lib/supabase/types';

export const metadata = { title: '조정 등록 · 에이비딩 관리' };

const MEDIA_ORDER: Media[] = ['K', 'S', 'M'];
const TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];

interface PageProps {
  searchParams: { quoteId?: string; q?: string; month?: string };
}

export default async function NewAdjustmentPage({ searchParams }: PageProps) {
  const supabase = createClient();

  const q = (searchParams.q ?? '').trim();
  // month 미지정(undefined) → 이번 달 기본값 / 빈 문자열('') → 전체
  const month =
    searchParams.month === undefined ? todayKstISO().slice(0, 7) : searchParams.month.trim();

  type QuoteRow = {
    id: string;
    quote_no: string | null;
    service_start: string;
    service_end: string;
    extra_discount_rate: number;
    companies: { name: string } | null;
    sub_companies: { name: string } | null;
  };
  type ItemRow = {
    quote_id: string;
    media: Media;
    tier: Tier;
    quantity: number;
    unit_price: number;
  };

  let quotesQuery = supabase
    .from('quotes')
    .select(
      'id, quote_no, service_start, service_end, extra_discount_rate, companies!inner(name), sub_companies(name)',
    )
    .order('service_start', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yStr, mStr] = month.split('-');
    const last = new Date(Number(yStr), Number(mStr), 0).getDate();
    quotesQuery = quotesQuery
      .gte('service_start', `${month}-01`)
      .lte('service_start', `${month}-${String(last).padStart(2, '0')}`);
  }

  if (q) {
    if (/^Q-/i.test(q)) quotesQuery = quotesQuery.ilike('quote_no', `%${q}%`);
    else quotesQuery = quotesQuery.ilike('companies.name', `%${q}%`);
  }

  const [qRes, priceMap] = await Promise.all([quotesQuery, fetchActivePriceMap(supabase)]);

  if (qRes.error) {
    return (
      <div>
        <PageHeader title="조정 등록" />
        <div className="p-8 text-red-600">견적 로드 실패: {qRes.error.message}</div>
      </div>
    );
  }

  const quoteRows = (qRes.data ?? []) as unknown as QuoteRow[];
  const quoteIds = quoteRows.map((q) => q.id);

  const items: ItemRow[] = [];
  if (quoteIds.length > 0) {
    const { data: itemRows } = await supabase
      .from('quote_items')
      .select('quote_id, media, tier, quantity, unit_price')
      .in('quote_id', quoteIds);
    items.push(...((itemRows ?? []) as unknown as ItemRow[]));
  }

  const itemsByQuote = new Map<string, ItemRow[]>();
  for (const it of items) {
    const arr = itemsByQuote.get(it.quote_id) ?? [];
    arr.push(it);
    itemsByQuote.set(it.quote_id, arr);
  }

  // 기존 조정 delta 합산 (견적별 조정 반영 후 현재 사용량 계산용)
  type AdjRow = {
    quote_id: string;
    media: Media;
    delta_unique: number;
    delta_premium: number;
    delta_basic: number;
    delta_lite: number;
  };
  const adjByQuote = new Map<string, Record<string, number>>();
  if (quoteIds.length > 0) {
    const { data: adjRows } = await supabase
      .from('quote_adjustments')
      .select('quote_id, media, delta_unique, delta_premium, delta_basic, delta_lite')
      .in('quote_id', quoteIds);
    for (const a of (adjRows ?? []) as unknown as AdjRow[]) {
      const m = adjByQuote.get(a.quote_id) ?? {};
      const deltas: Record<Tier, number> = {
        unique: a.delta_unique,
        premium: a.delta_premium,
        basic: a.delta_basic,
        lite: a.delta_lite,
      };
      for (const t of TIER_ORDER) {
        const k = `${a.media}__${t}`;
        m[k] = (m[k] ?? 0) + Number(deltas[t] ?? 0);
      }
      adjByQuote.set(a.quote_id, m);
    }
  }

  const quotes: QuoteOption[] = quoteRows.map((q) => {
    const qItems = (itemsByQuote.get(q.id) ?? []).map((i) => ({
      media: i.media,
      tier: i.tier,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
    }));
    // 조정 반영 후 현재 사용량 = 원본 + Σ 기존 조정 delta (0 floor)
    const adjDeltas = adjByQuote.get(q.id) ?? {};
    const currentQty: Record<string, number> = {};
    for (const media of MEDIA_ORDER) {
      for (const tier of TIER_ORDER) {
        const k = `${media}__${tier}`;
        const base = qItems.find((i) => i.media === media && i.tier === tier)?.quantity ?? 0;
        currentQty[k] = Math.max(0, base + (adjDeltas[k] ?? 0));
      }
    }
    return {
      id: q.id,
      quote_no: q.quote_no,
      company_name: q.companies?.name ?? '-',
      sub_company_name: q.sub_companies?.name ?? null,
      service_start: q.service_start,
      service_end: q.service_end,
      extra_discount_rate: Number(q.extra_discount_rate ?? 0),
      items: qItems,
      currentQty,
    };
  });

  const prices: PriceRow[] = [];
  for (const media of MEDIA_ORDER) {
    for (const tier of TIER_ORDER) {
      const p = priceMap.get(`${media}__${tier}`) as Product | undefined;
      prices.push({ media, tier, unit_price: Number(p?.unit_price ?? 0) });
    }
  }

  return (
    <div>
      <PageHeader
        title="조정 등록"
        description="중도 사용량 변동을 등록합니다. 일할 계산된 금액이 해당 견적의 변동조정가에 가산되며, 다음 단계에서 안내 메일을 발송합니다."
      />
      <div className="p-8 max-w-5xl space-y-6">
        <AdjustmentQuoteFilter />
        <AdjustmentForm quotes={quotes} prices={prices} defaultQuoteId={searchParams.quoteId} />
      </div>
    </div>
  );
}
