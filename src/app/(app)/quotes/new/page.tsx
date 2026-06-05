import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { fetchActivePriceMap } from '@/lib/quotes/pricing';
import { QuoteForm, type CompanyOption, type PriceRow } from '../_components/quote-form';
import type { Media, Tier, Product } from '@/lib/supabase/types';
import type { QuoteInput } from '@/lib/validation/quote';

export const metadata = { title: '신규 견적 · 에이비딩 관리' };

const MEDIA_ORDER: Media[] = ['K', 'S', 'M'];
const TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];

export default async function NewQuotePage() {
  const supabase = createClient();

  const [companiesRes, priceMap] = await Promise.all([
    supabase
      .from('companies')
      .select('id, name, sub_companies(id, name)')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    fetchActivePriceMap(supabase),
  ]);

  if (companiesRes.error) {
    return (
      <div>
        <PageHeader title="신규 견적" />
        <div className="p-8 text-red-600">거래처 로드 실패: {companiesRes.error.message}</div>
      </div>
    );
  }

  type CompanyRow = {
    id: string;
    name: string;
    sub_companies: { id: string; name: string }[] | null;
  };

  const companies: CompanyOption[] = ((companiesRes.data ?? []) as unknown as CompanyRow[]).map(
    (c) => ({
      id: c.id,
      name: c.name,
      sub_companies: (c.sub_companies ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    }),
  );

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

  // 이번 달 시작/마지막 날 디폴트
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(yyyy, today.getMonth() + 1, 0).getDate();
  const defaultStart = `${yyyy}-${mm}-01`;
  const defaultEnd = `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`;

  const defaults: QuoteInput = {
    company_id: '',
    sub_company_id: null,
    service_start: defaultStart,
    service_end: defaultEnd,
    addon_fee: 0,
    variable_adjust: 0,
    fixed_adjust: 0,
    bank_account: '',
    payment_method: '',
    tax_invoice_type: null,
    notes: '',
    items: [],
  };

  return (
    <div>
      <PageHeader
        title="신규 견적"
        description="견적번호는 저장 시 'Q-YYYYMM-###' 형식으로 자동 발급됩니다. 할인은 공시가 합계 100,000원 이상이면 자동 적용됩니다."
      />
      <div className="p-8 max-w-6xl">
        <QuoteForm mode="create" defaultValues={defaults} companies={companies} prices={prices} />
      </div>
    </div>
  );
}
