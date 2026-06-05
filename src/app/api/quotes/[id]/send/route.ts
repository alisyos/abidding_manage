import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getMailFrom, getTransporter } from '@/lib/email/smtp';
import { applyTransition } from '@/lib/quotes/statusMachine';
import { sendQuoteEmailSchema } from '@/lib/validation/quote';
import { generateQuotePdfBuffer } from '@/lib/pdf/generate-quote-pdf';
import type {
  Media,
  Quote,
  QuoteStatus,
  SenderProfile,
  TaxInvoiceType,
  Tier,
} from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '인증되지 않은 사용자' }, { status: 401 });
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 JSON' }, { status: 400 });
  }

  const parsed = sendQuoteEmailSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '검증 실패' },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // ───────────────────────────────────────────────────────────
  // 견적 + 항목 + 발신자 + 수신자 풀 조회 (PDF 생성에 필요)
  // ───────────────────────────────────────────────────────────
  type QuoteRow = Quote & {
    companies: { id: string; name: string };
    sub_companies: { id: string; name: string } | null;
  };
  type ItemRow = {
    media: Media;
    tier: Tier;
    quantity: number;
    unit_price: number;
    line_total: number;
  };

  const [qRes, iRes, sRes] = await Promise.all([
    supabase
      .from('quotes')
      .select(
        `id, quote_no, company_id, sub_company_id, status, service_start, service_end,
         discount_rate, addon_fee, variable_adjust, fixed_adjust,
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

  if (qRes.error || !qRes.data) {
    return NextResponse.json({ error: '견적을 찾을 수 없습니다' }, { status: 404 });
  }
  const qRow = qRes.data as unknown as QuoteRow;
  const items = (iRes.data ?? []) as unknown as ItemRow[];

  // primary contact
  let primaryContact: { display_name: string | null; email: string; phone: string | null } | null = null;
  if (qRow.sub_company_id) {
    const { data: c } = await supabase
      .from('company_contacts')
      .select('display_name, email, phone, sort_order')
      .eq('sub_company_id', qRow.sub_company_id)
      .eq('role', 'primary')
      .order('sort_order', { ascending: true })
      .limit(1);
    if (c && c.length > 0) {
      primaryContact = c[0] as unknown as {
        display_name: string | null;
        email: string;
        phone: string | null;
      };
    }
  }

  // sender 스냅샷 우선
  const snapshot = (qRow.sender_snapshot ?? {}) as Partial<SenderProfile>;
  const senderCurrent = (sRes.data ?? {}) as Partial<SenderProfile>;
  const sender =
    snapshot && Object.keys(snapshot).length > 0 ? snapshot : senderCurrent;

  // Quote 정규화
  const quote: Quote = {
    id: qRow.id,
    quote_no: qRow.quote_no,
    company_id: qRow.company_id,
    sub_company_id: qRow.sub_company_id,
    status: qRow.status as QuoteStatus,
    service_start: qRow.service_start,
    service_end: qRow.service_end,
    discount_rate: Number(qRow.discount_rate),
    addon_fee: Number(qRow.addon_fee),
    variable_adjust: Number(qRow.variable_adjust),
    fixed_adjust: Number(qRow.fixed_adjust),
    base_amount: Number(qRow.base_amount),
    vat_amount: Number(qRow.vat_amount),
    total_amount: Number(qRow.total_amount),
    sender_snapshot: snapshot as Record<string, unknown>,
    bank_account: qRow.bank_account,
    payment_method: qRow.payment_method,
    tax_invoice_type: qRow.tax_invoice_type as TaxInvoiceType | null,
    notes: qRow.notes,
    created_by: qRow.created_by,
    created_at: qRow.created_at,
    updated_at: qRow.updated_at,
    sent_at: qRow.sent_at,
    won_at: qRow.won_at,
    paid_at: qRow.paid_at,
  };

  // PDF 생성
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateQuotePdfBuffer({
      quote,
      sender,
      company: qRow.companies,
      subCompany: qRow.sub_companies,
      primaryContact,
      items: items.map((i) => ({
        media: i.media,
        tier: i.tier,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        line_total: Number(i.line_total),
      })),
    });
  } catch (e) {
    console.error('[PDF generate error]', e);
    return NextResponse.json(
      { error: `PDF 생성 실패: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  // 테스트 발송이면 수신자/참조를 로그인 사용자 본인으로 덮어씀
  let toAddresses = input.to;
  let ccAddresses = input.cc;
  if (input.isTestSend) {
    if (!user.email) {
      return NextResponse.json({ error: '로그인 사용자에 이메일이 없습니다' }, { status: 400 });
    }
    toAddresses = [user.email];
    ccAddresses = [];
  }

  const pdfFilename = `견적서_${qRow.quote_no ?? params.id}.pdf`;

  let smtpMessageId: string | null = null;
  let sendError: string | null = null;
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: getMailFrom(),
      to: toAddresses,
      cc: ccAddresses,
      subject: input.subject + (input.isTestSend ? ' [테스트]' : ''),
      html: input.body_html,
      text: input.body_text ?? undefined,
      attachments: [
        {
          filename: pdfFilename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
    smtpMessageId = info.messageId ?? null;
  } catch (e) {
    const err = e as Error & {
      code?: string;
      command?: string;
      response?: string;
      responseCode?: number;
    };
    sendError = [
      err.message,
      err.code ? `[code: ${err.code}]` : null,
      err.response ? ` SMTP 응답: ${err.response}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    console.error('[SMTP send error]', {
      code: err.code,
      command: err.command,
      response: err.response,
      responseCode: err.responseCode,
      message: err.message,
    });
  }

  // 발송 이력 기록
  await supabase.from('quote_emails').insert({
    quote_id: params.id,
    kind: 'quote',
    to_addresses: toAddresses,
    cc_addresses: ccAddresses,
    subject: input.subject + (input.isTestSend ? ' [테스트]' : ''),
    body_html: input.body_html,
    body_text: input.body_text ?? null,
    status: sendError ? 'failed' : 'sent',
    smtp_message_id: smtpMessageId,
    error: sendError,
    sent_at: sendError ? null : new Date().toISOString(),
    created_by: user.id,
  });

  if (sendError) {
    return NextResponse.json({ error: `발송 실패: ${sendError}` }, { status: 500 });
  }

  // 비-테스트 발송 시 status가 draft 면 'sent' 로 자동 전이
  if (!input.isTestSend && qRow.status === 'draft') {
    await applyTransition('sent', { supabase, quoteId: params.id });
  }

  revalidatePath(`/quotes/${params.id}`);
  revalidatePath('/quotes');

  return NextResponse.json({
    ok: true,
    isTestSend: input.isTestSend,
    pdf_size_kb: Math.round(pdfBuffer.length / 1024),
  });
}
