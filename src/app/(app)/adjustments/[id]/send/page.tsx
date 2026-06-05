import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { buildAdjustmentEmail } from '@/lib/email/builders';
import { AdjustmentSendClient } from './_components/adjustment-send-client';
import type {
  CompanyContact,
  EmailTemplate,
  Quote,
  QuoteAdjustment,
  SenderProfile,
  TaxInvoiceType,
  QuoteStatus,
  Media,
} from '@/lib/supabase/types';

export const metadata = { title: '조정 메일 발송 · 에이비딩 관리' };

interface PageProps {
  params: { id: string };
}

export default async function SendAdjustmentPage({ params }: PageProps) {
  const supabase = createClient();

  // 조정 + 견적 + 거래처 + 템플릿 + 발신자 일괄 조회
  type AdjRow = QuoteAdjustment & {
    quotes: Quote & { companies: { name: string } | null };
  };
  const [aRes, tplRes, sRes] = await Promise.all([
    supabase
      .from('quote_adjustments')
      .select(
        `id, quote_id, adjustment_date, account_type, media,
         delta_unique, delta_premium, delta_basic, delta_lite,
         pre_adjust_amount, reason, created_at,
         quotes(id, quote_no, company_id, sub_company_id, status, service_start, service_end,
                addon_fee, variable_adjust, fixed_adjust,
                extra_discount_rate, extra_discount_amount, extra_discount_note,
                base_amount, vat_amount, total_amount, sender_snapshot,
                bank_account, payment_method, tax_invoice_type, notes,
                sent_at, won_at, paid_at, created_at, updated_at, created_by,
                companies(name))`,
      )
      .eq('id', params.id)
      .single(),
    supabase.from('email_templates').select('*').eq('key', 'adjustment_default').single(),
    supabase.from('sender_profile').select('*').eq('id', 1).single(),
  ]);

  if (aRes.error || !aRes.data) notFound();
  if (tplRes.error || !tplRes.data) {
    return (
      <div>
        <PageHeader title="조정 메일 발송" />
        <div className="p-8 text-red-600">메일 템플릿(adjustment_default) 누락</div>
      </div>
    );
  }

  const adj = aRes.data as unknown as AdjRow;
  const tpl = tplRes.data as unknown as EmailTemplate;
  const senderCurrent = (sRes.data ?? {}) as Partial<SenderProfile>;
  const snapshot = (adj.quotes.sender_snapshot ?? {}) as Partial<SenderProfile>;
  const sender = snapshot && Object.keys(snapshot).length > 0 ? snapshot : senderCurrent;

  // 연락처
  let contacts: CompanyContact[] = [];
  if (adj.quotes.sub_company_id) {
    const { data } = await supabase
      .from('company_contacts')
      .select(
        'id, sub_company_id, role, display_name, email, phone, formatted_address, sort_order, created_at',
      )
      .eq('sub_company_id', adj.quotes.sub_company_id)
      .order('sort_order', { ascending: true });
    contacts = (data ?? []) as unknown as CompanyContact[];
  }

  // QuoteAdjustment / Quote 정규화
  const adjustment: QuoteAdjustment = {
    id: adj.id,
    quote_id: adj.quote_id,
    adjustment_date: adj.adjustment_date,
    account_type: adj.account_type,
    media: adj.media as Media,
    delta_unique: adj.delta_unique,
    delta_premium: adj.delta_premium,
    delta_basic: adj.delta_basic,
    delta_lite: adj.delta_lite,
    pre_adjust_amount: Number(adj.pre_adjust_amount ?? 0),
    reason: adj.reason,
    created_at: adj.created_at,
  };

  const quote: Quote = {
    id: adj.quotes.id,
    quote_no: adj.quotes.quote_no,
    company_id: adj.quotes.company_id,
    sub_company_id: adj.quotes.sub_company_id,
    status: adj.quotes.status as QuoteStatus,
    service_start: adj.quotes.service_start,
    service_end: adj.quotes.service_end,
    addon_fee: Number(adj.quotes.addon_fee),
    variable_adjust: Number(adj.quotes.variable_adjust),
    fixed_adjust: Number(adj.quotes.fixed_adjust),
    extra_discount_rate: Number(adj.quotes.extra_discount_rate ?? 0),
    extra_discount_amount: Number(adj.quotes.extra_discount_amount ?? 0),
    extra_discount_note: adj.quotes.extra_discount_note ?? null,
    base_amount: Number(adj.quotes.base_amount),
    vat_amount: Number(adj.quotes.vat_amount),
    total_amount: Number(adj.quotes.total_amount),
    sender_snapshot: snapshot as Record<string, unknown>,
    bank_account: adj.quotes.bank_account,
    payment_method: adj.quotes.payment_method,
    tax_invoice_type: adj.quotes.tax_invoice_type as TaxInvoiceType | null,
    notes: adj.quotes.notes,
    created_by: adj.quotes.created_by,
    created_at: adj.quotes.created_at,
    updated_at: adj.quotes.updated_at,
    sent_at: adj.quotes.sent_at,
    won_at: adj.quotes.won_at,
    paid_at: adj.quotes.paid_at,
  };

  const built = buildAdjustmentEmail({
    adjustment,
    quote,
    sender,
    company: adj.quotes.companies ?? { name: '-' },
    contacts,
    template: tpl,
  });

  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div>
      <PageHeader
        title={`조정 메일 발송: ${adj.quotes.quote_no ?? ''}`}
        description={`${adj.quotes.companies?.name ?? '-'} · 조정일자 ${adj.adjustment_date} · adjustment_default 템플릿`}
      />
      <div className="p-8 max-w-5xl">
        <AdjustmentSendClient
          adjustmentId={params.id}
          quoteId={adj.quote_id}
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
