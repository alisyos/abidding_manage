import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { buildQuoteEmail } from '@/lib/email/builders';
import { fetchActivePriceMap, priceKey } from '@/lib/quotes/pricing';
import { SendPageClient } from './_components/send-page-client';
import type {
  CompanyContact,
  EmailTemplate,
  Media,
  Quote,
  SenderProfile,
  TaxInvoiceType,
  Tier,
  QuoteStatus,
} from '@/lib/supabase/types';

export const metadata = { title: '견적 발송 · 에이비딩 관리' };

interface PageProps {
  params: { id: string };
}

export default async function SendQuotePage({ params }: PageProps) {
  const supabase = createClient();

  type QuoteRow = Quote & {
    companies: { id: string; name: string };
  };

  const [qRes, iRes, tplRes, sRes] = await Promise.all([
    supabase
      .from('quotes')
      .select(
        `id, quote_no, company_id, sub_company_id, status, service_start, service_end,
         addon_fee, variable_adjust, fixed_adjust,
         base_amount, vat_amount, total_amount, sender_snapshot,
         bank_account, payment_method, tax_invoice_type, notes,
         sent_at, won_at, paid_at, created_at, updated_at, created_by,
         companies(id, name)`,
      )
      .eq('id', params.id)
      .single(),
    supabase
      .from('quote_items')
      .select('media, tier, quantity, unit_price, line_total')
      .eq('quote_id', params.id),
    supabase.from('email_templates').select('*').eq('key', 'quote_default').single(),
    supabase.from('sender_profile').select('*').eq('id', 1).single(),
  ]);

  if (qRes.error || !qRes.data) notFound();
  if (tplRes.error || !tplRes.data) {
    return (
      <div>
        <PageHeader title="견적 발송" />
        <div className="p-8 text-red-600">
          메일 템플릿(quote_default)을 찾을 수 없습니다. /settings/email-templates 에서 생성해주세요.
        </div>
      </div>
    );
  }

  const qRaw = qRes.data as unknown as QuoteRow;
  const tpl = tplRes.data as unknown as EmailTemplate;

  // 연락처 조회 (sub_company_id 기반)
  let contacts: CompanyContact[] = [];
  if (qRaw.sub_company_id) {
    const { data } = await supabase
      .from('company_contacts')
      .select('id, sub_company_id, role, display_name, email, phone, formatted_address, sort_order, created_at')
      .eq('sub_company_id', qRaw.sub_company_id)
      .order('sort_order', { ascending: true });
    contacts = (data ?? []) as unknown as CompanyContact[];
  }

  // sender 스냅샷 우선
  const snapshot = (qRaw.sender_snapshot ?? {}) as Partial<SenderProfile>;
  const senderCurrent = (sRes.data ?? {}) as Partial<SenderProfile>;
  const sender =
    snapshot && Object.keys(snapshot).length > 0 ? snapshot : senderCurrent;

  // Quote 정규화 (sender_snapshot은 Record<string, unknown>으로 맞춤)
  const quote: Quote = {
    id: qRaw.id,
    quote_no: qRaw.quote_no,
    company_id: qRaw.company_id,
    sub_company_id: qRaw.sub_company_id,
    status: qRaw.status as QuoteStatus,
    service_start: qRaw.service_start,
    service_end: qRaw.service_end,
    addon_fee: Number(qRaw.addon_fee),
    variable_adjust: Number(qRaw.variable_adjust),
    fixed_adjust: Number(qRaw.fixed_adjust),
    base_amount: Number(qRaw.base_amount),
    vat_amount: Number(qRaw.vat_amount),
    total_amount: Number(qRaw.total_amount),
    sender_snapshot: snapshot as Record<string, unknown>,
    bank_account: qRaw.bank_account,
    payment_method: qRaw.payment_method,
    tax_invoice_type: qRaw.tax_invoice_type as TaxInvoiceType | null,
    notes: qRaw.notes,
    created_by: qRaw.created_by,
    created_at: qRaw.created_at,
    updated_at: qRaw.updated_at,
    sent_at: qRaw.sent_at,
    won_at: qRaw.won_at,
    paid_at: qRaw.paid_at,
  };

  type ItemRow = {
    media: Media;
    tier: Tier;
    quantity: number;
    unit_price: number;
    line_total: number;
  };
  // 현재 공시 단가 (메일 본문 표 절약액 표시용)
  const priceMap = await fetchActivePriceMap(supabase);
  const items = ((iRes.data ?? []) as unknown as ItemRow[]).map((it) => {
    const p = priceMap.get(priceKey(it.media, it.tier));
    return {
      media: it.media,
      tier: it.tier,
      quantity: Number(it.quantity),
      unit_price: Number(it.unit_price),
      line_total: Number(it.line_total),
      list_price: Number(p?.list_price ?? 0),
    };
  });

  const built = buildQuoteEmail({
    quote,
    sender,
    company: qRaw.companies,
    contacts,
    items,
    template: tpl,
  });

  // 로그인 사용자 이메일 (테스트 발송용)
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div>
      <PageHeader
        title={`견적 발송: ${qRaw.quote_no ?? ''}`}
        description={`수신자: ${qRaw.companies.name} · 메일 본문은 ‘${tpl.name}’ 템플릿으로 미리 렌더링되었으며 자유롭게 수정 가능합니다.`}
      />
      <div className="p-8 max-w-5xl">
        <SendPageClient
          quoteId={params.id}
          initialTo={built.to.join('\n')}
          initialCc={built.cc.join('\n')}
          initialSubject={built.subject}
          initialBodyHtml={built.body_html}
          initialBodyText={built.body_text}
          loggedInUserEmail={user?.email ?? null}
        />
      </div>
    </div>
  );
}
