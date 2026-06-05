import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMailFrom, getTransporter } from '@/lib/email/smtp';
import { buildQuoteEmail } from '@/lib/email/builders';
import { applyTransition } from '@/lib/quotes/statusMachine';
import { fetchActivePriceMap, priceKey } from '@/lib/quotes/pricing';
import { bulkSendInputSchema } from '@/lib/validation/bulk';
import { generateQuotePdfBuffer } from '@/lib/pdf/generate-quote-pdf';
import type {
  CompanyContact,
  EmailTemplate,
  Media,
  Quote,
  QuoteStatus,
  SenderProfile,
  TaxInvoiceType,
  Tier,
} from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 일괄 견적 메일 발송 — SSE 진행률 송출.
 *
 * Request: POST { ids: uuid[] }  (1~200건)
 * Response: text/event-stream
 *   event: init  → { total }
 *   data: { index, quote_no, ok, error? }   (각 건마다 1개)
 *   event: done  → { success, failed: [...] }
 */
export async function POST(req: Request) {
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

  const parsed = bulkSendInputSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '검증 실패' },
      { status: 400 },
    );
  }
  const { ids } = parsed.data;

  // 메일 템플릿 + 발신자 + 현재 단가 — 1회만 조회 (재사용)
  const [tplRes, senderRes, priceMap] = await Promise.all([
    supabase.from('email_templates').select('*').eq('key', 'quote_default').single(),
    supabase.from('sender_profile').select('*').eq('id', 1).single(),
    fetchActivePriceMap(supabase),
  ]);
  if (tplRes.error || !tplRes.data) {
    return NextResponse.json(
      { error: '메일 템플릿(quote_default) 누락' },
      { status: 500 },
    );
  }
  const template = tplRes.data as unknown as EmailTemplate;
  const senderCurrent = (senderRes.data ?? {}) as Partial<SenderProfile>;

  const transporter = getTransporter();
  const from = getMailFrom();

  // ───────────────────────────────────────────────────────────
  // quote_items 일괄 prefetch (N+1 회피)
  // ───────────────────────────────────────────────────────────
  type ItemRow = {
    quote_id: string;
    media: Media;
    tier: Tier;
    quantity: number;
    unit_price: number;
    line_total: number;
  };
  const { data: allItemsRaw } = await supabase
    .from('quote_items')
    .select('quote_id, media, tier, quantity, unit_price, line_total')
    .in('quote_id', ids);
  const itemsByQuote = new Map<string, ItemRow[]>();
  for (const it of (allItemsRaw ?? []) as unknown as ItemRow[]) {
    const arr = itemsByQuote.get(it.quote_id) ?? [];
    arr.push(it);
    itemsByQuote.set(it.quote_id, arr);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (obj: unknown, event?: string) => {
        const prefix = event ? `event: ${event}\n` : '';
        controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(obj)}\n\n`));
      };

      enqueue({ total: ids.length }, 'init');

      let success = 0;
      const failed: { id: string; quote_no: string; error: string }[] = [];

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        let quoteNoForLog = id;
        try {
          type QuoteRow = Quote & {
            companies: { id: string; name: string };
            sub_companies: { id: string; name: string } | null;
          };
          const { data: qRaw, error: qErr } = await supabase
            .from('quotes')
            .select(
              'id, quote_no, company_id, sub_company_id, status, service_start, service_end, addon_fee, variable_adjust, fixed_adjust, extra_discount_rate, extra_discount_amount, extra_discount_note, base_amount, vat_amount, total_amount, sender_snapshot, bank_account, payment_method, tax_invoice_type, notes, sent_at, won_at, paid_at, created_at, updated_at, created_by, companies(id, name), sub_companies(id, name)',
            )
            .eq('id', id)
            .single();
          if (qErr || !qRaw) throw new Error(`견적 조회 실패: ${qErr?.message ?? '없음'}`);
          const qRow = qRaw as unknown as QuoteRow;
          quoteNoForLog = qRow.quote_no ?? id;

          // 연락처
          let contacts: CompanyContact[] = [];
          if (qRow.sub_company_id) {
            const { data } = await supabase
              .from('company_contacts')
              .select(
                'id, sub_company_id, role, display_name, email, phone, formatted_address, sort_order, created_at',
              )
              .eq('sub_company_id', qRow.sub_company_id)
              .order('sort_order', { ascending: true });
            contacts = (data ?? []) as unknown as CompanyContact[];
          }

          // 발신자 스냅샷 우선
          const snapshot = (qRow.sender_snapshot ?? {}) as Partial<SenderProfile>;
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
            addon_fee: Number(qRow.addon_fee),
            variable_adjust: Number(qRow.variable_adjust),
            fixed_adjust: Number(qRow.fixed_adjust),
            extra_discount_rate: Number(qRow.extra_discount_rate ?? 0),
            extra_discount_amount: Number(qRow.extra_discount_amount ?? 0),
            extra_discount_note: qRow.extra_discount_note ?? null,
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

          // 이 견적의 items prefetch 결과 (메일 본문 표 + PDF 양쪽에 사용)
          // list_price도 현재 단가맵에서 매핑하여 메일 본문 표의 절약액 계산용
          const items = (itemsByQuote.get(id) ?? []).map((it) => {
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
            company: qRow.companies,
            contacts,
            items,
            template,
          });

          if (built.to.length === 0) {
            throw new Error('수신자(primary 연락처)가 없습니다');
          }

          // PDF 생성
          const primaryContact = contacts.find((c) => c.role === 'primary') ?? null;
          const pdfBuffer = await generateQuotePdfBuffer({
            quote,
            sender,
            company: qRow.companies,
            subCompany: qRow.sub_companies,
            primaryContact: primaryContact
              ? {
                  display_name: primaryContact.display_name,
                  email: primaryContact.email,
                  phone: primaryContact.phone,
                }
              : null,
            items,
          });
          const pdfFilename = `견적서_${quoteNoForLog}.pdf`;

          // 수신자 문자열을 그대로 to/cc 로 — '이름' <email> 형식은 nodemailer가 인식
          const info = await transporter.sendMail({
            from,
            to: built.to,
            cc: built.cc,
            subject: built.subject,
            html: built.body_html,
            text: built.body_text,
            attachments: [
              {
                filename: pdfFilename,
                content: pdfBuffer,
                contentType: 'application/pdf',
              },
            ],
          });

          await supabase.from('quote_emails').insert({
            quote_id: id,
            kind: 'quote',
            to_addresses: built.to,
            cc_addresses: built.cc,
            subject: built.subject,
            body_html: built.body_html,
            body_text: built.body_text,
            status: 'sent',
            smtp_message_id: info.messageId ?? null,
            error: null,
            sent_at: new Date().toISOString(),
            created_by: user.id,
          });

          if (qRow.status === 'draft') {
            await applyTransition('sent', { supabase, quoteId: id });
          }

          success++;
          enqueue({
            index: i,
            quote_no: quoteNoForLog,
            ok: true,
            pdf_size_kb: Math.round(pdfBuffer.length / 1024),
          });
        } catch (e) {
          const errMsg = (e as Error).message;
          failed.push({ id, quote_no: quoteNoForLog, error: errMsg });
          // 실패도 이력 남기기
          try {
            await supabase.from('quote_emails').insert({
              quote_id: id,
              kind: 'quote',
              to_addresses: [],
              cc_addresses: [],
              subject: '(일괄 발송 실패)',
              body_html: '',
              body_text: null,
              status: 'failed',
              error: errMsg,
              created_by: user.id,
            });
          } catch {
            // 이력 기록 실패는 무시
          }
          enqueue({ index: i, quote_no: quoteNoForLog, ok: false, error: errMsg });
        }
      }

      enqueue({ success, failed }, 'done');
      controller.close();

      revalidatePath('/quotes');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
