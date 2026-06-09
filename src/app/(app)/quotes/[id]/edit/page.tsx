import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { fetchActivePriceMap } from '@/lib/quotes/pricing';
import { QuoteForm, type CompanyOption, type PriceRow } from '../../_components/quote-form';
import type { Media, Tier, Product, TaxInvoiceType } from '@/lib/supabase/types';
import type { QuoteInput } from '@/lib/validation/quote';

export const metadata = { title: '견적 편집 · 에이비딩 관리' };

const MEDIA_ORDER: Media[] = ['K', 'S', 'M'];
const TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];

interface PageProps {
  params: { id: string };
}

export default async function EditQuotePage({ params }: PageProps) {
  const supabase = createClient();

  type QuoteRow = {
    id: string;
    quote_no: string | null;
    company_id: string;
    sub_company_id: string | null;
    service_start: string;
    service_end: string;
    addon_fee: number;
    variable_adjust: number;
    fixed_adjust: number;
    extra_discount_rate: number;
    extra_discount_amount: number;
    extra_discount_note: string | null;
    force_discount: boolean;
    bank_account: string | null;
    payment_method: string | null;
    tax_invoice_type: TaxInvoiceType | null;
    notes: string | null;
  };
  type ItemRow = { media: Media; tier: Tier; quantity: number; unit_price: number };
  type CompanyRow = {
    id: string;
    name: string;
    sub_companies: { id: string; name: string }[] | null;
  };

  const [qRes, iRes, cRes, priceMap] = await Promise.all([
    supabase
      .from('quotes')
      .select(
        'id, quote_no, company_id, sub_company_id, service_start, service_end, addon_fee, variable_adjust, fixed_adjust, extra_discount_rate, extra_discount_amount, extra_discount_note, force_discount, bank_account, payment_method, tax_invoice_type, notes',
      )
      .eq('id', params.id)
      .single(),
    supabase
      .from('quote_items')
      .select('media, tier, quantity, unit_price')
      .eq('quote_id', params.id),
    supabase
      .from('companies')
      .select('id, name, sub_companies(id, name)')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    fetchActivePriceMap(supabase),
  ]);

  if (qRes.error || !qRes.data) notFound();
  const q = qRes.data as unknown as QuoteRow;
  const itemRows = (iRes.data ?? []) as unknown as ItemRow[];
  const companies: CompanyOption[] = ((cRes.data ?? []) as unknown as CompanyRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    sub_companies: (c.sub_companies ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
  }));

  const prices: PriceRow[] = [];
  for (const media of MEDIA_ORDER) {
    for (const tier of TIER_ORDER) {
      const p = priceMap.get(`${media}__${tier}`) as Product | undefined;
      prices.push({
        media,
        tier,
        unit_price: Number(p?.unit_price ?? 0),
        list_price: Number(p?.list_price ?? 0),
      });
    }
  }

  // 기존 견적의 unit_price는 발급 시점 단가 스냅샷.
  // 편집 시에는 현재 priceMap의 unit_price(할인가)/list_price(공시가)를 다시 채워서
  // 할인가 합계 기준 임계값 판정.
  const defaults: QuoteInput = {
    company_id: q.company_id,
    sub_company_id: q.sub_company_id,
    service_start: q.service_start,
    service_end: q.service_end,
    addon_fee: Number(q.addon_fee ?? 0),
    variable_adjust: Number(q.variable_adjust ?? 0),
    fixed_adjust: Number(q.fixed_adjust ?? 0),
    extra_discount_rate: Number(q.extra_discount_rate ?? 0),
    extra_discount_amount: Number(q.extra_discount_amount ?? 0),
    extra_discount_note: q.extra_discount_note ?? '',
    force_discount: Boolean(q.force_discount),
    bank_account: q.bank_account ?? '',
    payment_method: q.payment_method ?? '',
    tax_invoice_type: q.tax_invoice_type,
    notes: q.notes ?? '',
    items: itemRows.map((i) => {
      const p = priceMap.get(`${i.media}__${i.tier}`) as Product | undefined;
      return {
        media: i.media,
        tier: i.tier,
        quantity: Number(i.quantity),
        unit_price: Number(p?.unit_price ?? i.unit_price),
        list_price: Number(p?.list_price ?? 0),
      };
    }),
  };

  return (
    <div>
      <PageHeader
        title={`견적 편집 ${q.quote_no ?? ''}`}
        description="견적번호는 발급 후 변경할 수 없습니다."
      />
      <div className="p-8 max-w-6xl">
        <QuoteForm
          mode="edit"
          quoteId={params.id}
          quoteNo={q.quote_no}
          defaultValues={defaults}
          companies={companies}
          prices={prices}
        />
      </div>
    </div>
  );
}
