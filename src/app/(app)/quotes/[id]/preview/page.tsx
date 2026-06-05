import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { QuotePreview } from '@/components/quote/quote-preview';
import { PrintBar } from './_components/print-button';
import type {
  Media,
  Tier,
  Quote,
  SenderProfile,
  TaxInvoiceType,
  QuoteStatus,
} from '@/lib/supabase/types';

export const metadata = { title: '견적서 미리보기 · 에이비딩 관리' };

interface PageProps {
  params: { id: string };
}

export default async function QuotePreviewPage({ params }: PageProps) {
  const supabase = createClient();

  type QuoteRow = Quote & {
    companies: { id: string; name: string };
    sub_companies: { id: string; name: string } | null;
  };
  type ItemRow = { media: Media; tier: Tier; quantity: number; unit_price: number; line_total: number };

  const [qRes, iRes, sRes] = await Promise.all([
    supabase
      .from('quotes')
      .select(
        `id, quote_no, company_id, sub_company_id, status, service_start, service_end,
         addon_fee, variable_adjust, fixed_adjust,
         base_amount, vat_amount, total_amount, sender_snapshot,
         bank_account, payment_method, tax_invoice_type, notes,
         sent_at, won_at, paid_at, created_at, updated_at, created_by,
         companies(id, name), sub_companies(id, name)`,
      )
      .eq('id', params.id)
      .single(),
    supabase
      .from('quote_items')
      .select('media, tier, quantity, unit_price, line_total')
      .eq('quote_id', params.id),
    supabase.from('sender_profile').select('*').eq('id', 1).single(),
  ]);

  if (qRes.error || !qRes.data) notFound();
  const qRaw = qRes.data as unknown as QuoteRow;
  const items = (iRes.data ?? []) as unknown as ItemRow[];

  // primary contact
  let primaryContact: { display_name: string | null; email: string; phone: string | null } | null = null;
  if (qRaw.sub_company_id) {
    const { data: c } = await supabase
      .from('company_contacts')
      .select('display_name, email, phone, sort_order')
      .eq('sub_company_id', qRaw.sub_company_id)
      .eq('role', 'primary')
      .order('sort_order', { ascending: true })
      .limit(1);
    if (c && c.length > 0) {
      primaryContact = c[0] as unknown as { display_name: string | null; email: string; phone: string | null };
    }
  }

  // sender 스냅샷 우선, 비어있으면 현재 sender_profile fallback
  const snapshot = (qRaw.sender_snapshot ?? {}) as Partial<SenderProfile>;
  const senderCurrent = (sRes.data ?? {}) as Partial<SenderProfile>;
  const sender: Partial<SenderProfile> =
    snapshot && Object.keys(snapshot).length > 0 ? snapshot : senderCurrent;

  // Quote 타입에 맞춰 정규화 (sender_snapshot 캐스팅)
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

  return (
    <div className="-ml-[230px] w-screen min-h-screen bg-gray-100">
      <PrintBar backHref={`/quotes/${params.id}`} />
      <div className="py-8">
        <QuotePreview
          quote={quote}
          sender={sender}
          company={qRaw.companies}
          subCompany={qRaw.sub_companies}
          primaryContact={primaryContact}
          items={items}
        />
      </div>
    </div>
  );
}
