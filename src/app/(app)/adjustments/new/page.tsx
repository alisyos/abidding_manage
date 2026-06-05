import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { fetchActivePriceMap } from '@/lib/quotes/pricing';
import { AdjustmentForm, type QuoteOption, type PriceRow } from './_components/adjustment-form';
import type { Media, Tier, Product } from '@/lib/supabase/types';

export const metadata = { title: '조정 등록 · 에이비딩 관리' };

const MEDIA_ORDER: Media[] = ['K', 'S', 'M'];
const TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];

interface PageProps {
  searchParams: { quoteId?: string };
}

export default async function NewAdjustmentPage({ searchParams }: PageProps) {
  const supabase = createClient();

  type QuoteRow = {
    id: string;
    quote_no: string | null;
    service_start: string;
    service_end: string;
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

  const [qRes, priceMap] = await Promise.all([
    supabase
      .from('quotes')
      .select('id, quote_no, service_start, service_end, companies(name), sub_companies(name)')
      .order('service_start', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    fetchActivePriceMap(supabase),
  ]);

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

  const quotes: QuoteOption[] = quoteRows.map((q) => ({
    id: q.id,
    quote_no: q.quote_no,
    company_name: q.companies?.name ?? '-',
    sub_company_name: q.sub_companies?.name ?? null,
    service_start: q.service_start,
    service_end: q.service_end,
    items: (itemsByQuote.get(q.id) ?? []).map((i) => ({
      media: i.media,
      tier: i.tier,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
    })),
  }));

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
      <div className="p-8 max-w-5xl">
        <AdjustmentForm quotes={quotes} prices={prices} defaultQuoteId={searchParams.quoteId} />
      </div>
    </div>
  );
}
