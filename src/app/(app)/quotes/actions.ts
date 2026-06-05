'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  emailTemplatePatchSchema,
  paidPatchSchema,
  quoteInputSchema,
  type EmailTemplatePatch,
  type PaidPatch,
  type QuoteInput,
} from '@/lib/validation/quote';
import {
  bulkCreateQuotesInputSchema,
  type BulkCreateQuotesInput,
  type BulkCreateQuotesResult,
} from '@/lib/validation/bulk';
import { computeQuote } from '@/lib/quotes/calculator';
import { generateQuoteNo } from '@/lib/quotes/quoteNo';
import { fetchActivePriceMap, priceKey } from '@/lib/quotes/pricing';
import { firstDayOfMonth } from '@/lib/quotes/period';
import { applyTransition } from '@/lib/quotes/statusMachine';
import type {
  Media,
  QuoteStatus,
  SenderProfile,
  Tier,
} from '@/lib/supabase/types';

export interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

function nullify(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length === 0 ? null : t;
}

// ───────────────────────────────────────────────────────────────
// Create
// ───────────────────────────────────────────────────────────────
export async function createQuote(
  inputRaw: QuoteInput,
): Promise<ActionResult<{ id: string; quote_no: string }>> {
  const parsed = quoteInputSchema.safeParse(inputRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? '검증 실패' };
  }
  const input = parsed.data;

  const supabase = createClient();

  // 발신자 스냅샷
  const { data: senderRow } = await supabase
    .from('sender_profile')
    .select('*')
    .eq('id', 1)
    .single();
  const sender = (senderRow ?? {}) as Partial<SenderProfile>;

  // quote_no 발급
  let quoteNo: string;
  try {
    quoteNo = await generateQuoteNo(supabase, input.service_start);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // 금액 계산 — 임계값 기반 할인 자동 결정 + 추가 할인
  const calc = computeQuote(
    input.items.map((i) => ({
      quantity: i.quantity,
      unit_price: i.unit_price,
      list_price: i.list_price,
    })),
    input.addon_fee,
    input.fixed_adjust,
    input.variable_adjust,
    input.extra_discount_rate,
    input.extra_discount_amount,
  );

  // created_by
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: insRow, error: insErr } = await supabase
    .from('quotes')
    .insert({
      quote_no: quoteNo,
      company_id: input.company_id,
      sub_company_id: input.sub_company_id ?? null,
      status: 'draft',
      service_start: input.service_start,
      service_end: input.service_end,
      addon_fee: input.addon_fee,
      variable_adjust: input.variable_adjust,
      fixed_adjust: input.fixed_adjust,
      extra_discount_rate: input.extra_discount_rate,
      extra_discount_amount: input.extra_discount_amount,
      extra_discount_note: nullify(input.extra_discount_note),
      base_amount: round2(calc.baseAmount),
      vat_amount: calc.vatAmount,
      total_amount: round2(calc.totalAmount),
      sender_snapshot: sender,
      bank_account: nullify(input.bank_account) ?? sender.bank_account ?? null,
      payment_method: nullify(input.payment_method),
      tax_invoice_type: input.tax_invoice_type ?? null,
      notes: nullify(input.notes),
      created_by: user?.id ?? null,
    })
    .select('id')
    .single();

  if (insErr || !insRow) {
    return { ok: false, error: `견적 생성 실패: ${insErr?.message}` };
  }

  // quote_items — quantity > 0 만 저장. unit_price는 적용된 단가(할인/공시)로 저장
  const itemsToInsert = input.items
    .map((i, idx) => ({
      quote_id: insRow.id,
      media: i.media,
      tier: i.tier,
      quantity: i.quantity,
      unit_price: calc.discountApplied ? i.unit_price : i.list_price,
      line_total: calc.lineTotals[idx] ?? 0,
    }))
    .filter((i) => i.quantity > 0);

  if (itemsToInsert.length) {
    const { error: iErr } = await supabase.from('quote_items').insert(itemsToInsert);
    if (iErr) return { ok: false, error: `품목 저장 실패: ${iErr.message}` };
  }

  revalidatePath('/quotes');
  return { ok: true, data: { id: insRow.id, quote_no: quoteNo } };
}

// ───────────────────────────────────────────────────────────────
// Update (items: delete-then-insert)
// ───────────────────────────────────────────────────────────────
export async function updateQuote(
  id: string,
  inputRaw: QuoteInput,
): Promise<ActionResult> {
  const parsed = quoteInputSchema.safeParse(inputRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? '검증 실패' };
  }
  const input = parsed.data;

  const supabase = createClient();

  const calc = computeQuote(
    input.items.map((i) => ({
      quantity: i.quantity,
      unit_price: i.unit_price,
      list_price: i.list_price,
    })),
    input.addon_fee,
    input.fixed_adjust,
    input.variable_adjust,
    input.extra_discount_rate,
    input.extra_discount_amount,
  );

  const { error: uErr } = await supabase
    .from('quotes')
    .update({
      company_id: input.company_id,
      sub_company_id: input.sub_company_id ?? null,
      service_start: input.service_start,
      service_end: input.service_end,
      addon_fee: input.addon_fee,
      variable_adjust: input.variable_adjust,
      fixed_adjust: input.fixed_adjust,
      extra_discount_rate: input.extra_discount_rate,
      extra_discount_amount: input.extra_discount_amount,
      extra_discount_note: nullify(input.extra_discount_note),
      base_amount: round2(calc.baseAmount),
      vat_amount: calc.vatAmount,
      total_amount: round2(calc.totalAmount),
      bank_account: nullify(input.bank_account),
      payment_method: nullify(input.payment_method),
      tax_invoice_type: input.tax_invoice_type ?? null,
      notes: nullify(input.notes),
    })
    .eq('id', id);

  if (uErr) return { ok: false, error: `견적 수정 실패: ${uErr.message}` };

  // items delete-then-insert
  const { error: dErr } = await supabase.from('quote_items').delete().eq('quote_id', id);
  if (dErr) return { ok: false, error: `품목 삭제 실패: ${dErr.message}` };

  const itemsToInsert = input.items
    .map((i, idx) => ({
      quote_id: id,
      media: i.media,
      tier: i.tier,
      quantity: i.quantity,
      unit_price: calc.discountApplied ? i.unit_price : i.list_price,
      line_total: calc.lineTotals[idx] ?? 0,
    }))
    .filter((i) => i.quantity > 0);

  if (itemsToInsert.length) {
    const { error: iErr } = await supabase.from('quote_items').insert(itemsToInsert);
    if (iErr) return { ok: false, error: `품목 재저장 실패: ${iErr.message}` };
  }

  // status >= 'sent' 이고 sales_records 가 있는 경우 service_start 변경 시 동기화
  type QRow = {
    status: QuoteStatus;
    base_amount: number;
    variable_adjust: number;
    total_amount: number;
  };
  const { data: postRaw } = await supabase
    .from('quotes')
    .select('status, base_amount, variable_adjust, total_amount')
    .eq('id', id)
    .single();
  const post = postRaw as unknown as QRow | null;

  if (post && (post.status === 'won' || post.status === 'paid')) {
    await supabase
      .from('sales_records')
      .update({
        revenue_month: firstDayOfMonth(input.service_start),
        base_amount: post.base_amount,
        variable_adjust: post.variable_adjust,
        total_amount: post.total_amount,
      })
      .eq('quote_id', id);
  }

  revalidatePath('/quotes');
  revalidatePath(`/quotes/${id}`);
  revalidatePath('/sales');
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────
// 상태 전이
// ───────────────────────────────────────────────────────────────
export async function changeStatus(
  id: string,
  to: QuoteStatus,
  paidPatchRaw?: PaidPatch,
): Promise<ActionResult> {
  if (to === 'paid' && !paidPatchRaw) {
    return { ok: false, error: '입금 정보가 필요합니다' };
  }

  let paidPatch: PaidPatch | undefined;
  if (paidPatchRaw) {
    const parsed = paidPatchSchema.safeParse(paidPatchRaw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.errors[0]?.message ?? '입금 정보 검증 실패' };
    }
    paidPatch = parsed.data;
  }

  const supabase = createClient();
  const res = await applyTransition(to, { supabase, quoteId: id, paidPatch });
  if (!res.ok) return res;

  revalidatePath('/quotes');
  revalidatePath(`/quotes/${id}`);
  revalidatePath('/sales');
  return { ok: true };
}

export async function bulkChangeStatus(
  ids: string[],
  to: QuoteStatus,
): Promise<ActionResult<{ success: number; failed: string[] }>> {
  if (to === 'paid') {
    return { ok: false, error: '일괄 입금확인은 지원하지 않습니다 (개별 입금일자 필요)' };
  }
  const supabase = createClient();
  let success = 0;
  const failed: string[] = [];
  for (const id of ids) {
    const res = await applyTransition(to, { supabase, quoteId: id });
    if (res.ok) success++;
    else failed.push(`${id}: ${res.error}`);
  }
  revalidatePath('/quotes');
  revalidatePath('/sales');
  return { ok: true, data: { success, failed } };
}

// ───────────────────────────────────────────────────────────────
// 메일 템플릿
// ───────────────────────────────────────────────────────────────
export async function updateEmailTemplate(
  key: string,
  patchRaw: EmailTemplatePatch,
): Promise<ActionResult> {
  const parsed = emailTemplatePatchSchema.safeParse(patchRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? '검증 실패' };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from('email_templates')
    .update({
      subject: parsed.data.subject,
      body_html: parsed.data.body_html,
      body_text: parsed.data.body_text ?? null,
    })
    .eq('key', key);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/email-templates');
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────
// 일괄 견적 생성 (전월 견적 복제)
// ───────────────────────────────────────────────────────────────
export async function bulkCreateQuotes(
  inputRaw: BulkCreateQuotesInput,
): Promise<ActionResult<BulkCreateQuotesResult>> {
  const parsed = bulkCreateQuotesInputSchema.safeParse(inputRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? '검증 실패' };
  }
  const input = parsed.data;

  const supabase = createClient();

  // 현재 단가맵 (변경 반영)
  const priceMap = await fetchActivePriceMap(supabase);

  // 발신자 스냅샷 — 모든 신규 견적에 동일하게 적용
  const { data: senderRow } = await supabase
    .from('sender_profile')
    .select('*')
    .eq('id', 1)
    .single();
  const sender = (senderRow ?? {}) as Partial<SenderProfile>;

  // 로그인 사용자
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 소스 견적 + 항목 일괄 조회
  type SourceQuote = {
    id: string;
    quote_no: string | null;
    company_id: string;
    sub_company_id: string | null;
    service_start: string;
    addon_fee: number;
    variable_adjust: number;
    fixed_adjust: number;
    extra_discount_rate: number;
    extra_discount_amount: number;
    extra_discount_note: string | null;
    bank_account: string | null;
    payment_method: string | null;
    tax_invoice_type: 'receipt' | 'claim' | null;
    notes: string | null;
    companies: { name: string };
  };
  type SourceItem = {
    quote_id: string;
    media: Media;
    tier: Tier;
    quantity: number;
  };

  const { data: sourceQuotesRaw, error: sErr } = await supabase
    .from('quotes')
    .select(
      'id, quote_no, company_id, sub_company_id, service_start, addon_fee, variable_adjust, fixed_adjust, extra_discount_rate, extra_discount_amount, extra_discount_note, bank_account, payment_method, tax_invoice_type, notes, companies(name)',
    )
    .in('id', input.source_quote_ids);
  if (sErr) return { ok: false, error: `소스 견적 조회 실패: ${sErr.message}` };

  const sourceQuotes = (sourceQuotesRaw ?? []) as unknown as SourceQuote[];

  const { data: sourceItemsRaw } = await supabase
    .from('quote_items')
    .select('quote_id, media, tier, quantity')
    .in('quote_id', input.source_quote_ids);
  const itemsByQuote = new Map<string, SourceItem[]>();
  for (const it of (sourceItemsRaw ?? []) as unknown as SourceItem[]) {
    const arr = itemsByQuote.get(it.quote_id) ?? [];
    arr.push(it);
    itemsByQuote.set(it.quote_id, arr);
  }

  const created: BulkCreateQuotesResult['created'] = [];
  const skipped: BulkCreateQuotesResult['skipped'] = [];

  for (const src of sourceQuotes) {
    try {
      // 중복 검사: (company_id, sub_company_id, target_service_start)
      const dupQuery = supabase
        .from('quotes')
        .select('id', { head: true, count: 'exact' })
        .eq('company_id', src.company_id)
        .eq('service_start', input.target_service_start);
      if (src.sub_company_id) {
        dupQuery.eq('sub_company_id', src.sub_company_id);
      } else {
        dupQuery.is('sub_company_id', null);
      }
      const { count: dupCount } = await dupQuery;
      if ((dupCount ?? 0) > 0) {
        skipped.push({
          source_quote_no: src.quote_no ?? '(번호없음)',
          reason: `${src.companies.name}: 같은 기간 견적이 이미 존재합니다`,
        });
        continue;
      }

      // 신규 quote_no 발급
      const newQuoteNo = await generateQuoteNo(supabase, input.target_service_start);

      // 항목 재구성 (현재 단가 적용 — 할인가 + 공시가 둘 다)
      const srcItems = itemsByQuote.get(src.id) ?? [];
      const newItems = srcItems
        .filter((i) => i.quantity > 0)
        .map((i) => {
          const product = priceMap.get(priceKey(i.media, i.tier));
          return {
            media: i.media,
            tier: i.tier,
            quantity: i.quantity,
            unit_price: Number(product?.unit_price ?? 0),
            list_price: Number(product?.list_price ?? 0),
          };
        });

      // 금액 재계산 — 임계값 기반 할인 자동 결정 + 추가 할인 복제
      const calc = computeQuote(
        newItems.map((i) => ({
          quantity: i.quantity,
          unit_price: i.unit_price,
          list_price: i.list_price,
        })),
        Number(src.addon_fee ?? 0),
        Number(src.fixed_adjust ?? 0),
        Number(src.variable_adjust ?? 0),
        Number(src.extra_discount_rate ?? 0),
        Number(src.extra_discount_amount ?? 0),
      );

      // quotes insert
      const { data: insRow, error: insErr } = await supabase
        .from('quotes')
        .insert({
          quote_no: newQuoteNo,
          company_id: src.company_id,
          sub_company_id: src.sub_company_id,
          status: 'draft',
          service_start: input.target_service_start,
          service_end: input.target_service_end,
          addon_fee: src.addon_fee,
          variable_adjust: src.variable_adjust,
          fixed_adjust: src.fixed_adjust,
          extra_discount_rate: src.extra_discount_rate ?? 0,
          extra_discount_amount: src.extra_discount_amount ?? 0,
          extra_discount_note: src.extra_discount_note ?? null,
          base_amount: round2(calc.baseAmount),
          vat_amount: calc.vatAmount,
          total_amount: round2(calc.totalAmount),
          sender_snapshot: sender,
          bank_account: src.bank_account ?? sender.bank_account ?? null,
          payment_method: src.payment_method,
          tax_invoice_type: src.tax_invoice_type,
          notes: src.notes,
          created_by: user?.id ?? null,
        })
        .select('id')
        .single();

      if (insErr || !insRow) {
        skipped.push({
          source_quote_no: src.quote_no ?? '(번호없음)',
          reason: `생성 실패: ${insErr?.message ?? 'unknown'}`,
        });
        continue;
      }

      // quote_items insert — 적용된 단가(할인/공시)로 저장
      if (newItems.length > 0) {
        const itemRows = newItems.map((i, idx) => ({
          quote_id: insRow.id,
          media: i.media,
          tier: i.tier,
          quantity: i.quantity,
          unit_price: calc.discountApplied ? i.unit_price : i.list_price,
          line_total: calc.lineTotals[idx] ?? 0,
        }));
        await supabase.from('quote_items').insert(itemRows);
      }

      created.push({
        quote_no: newQuoteNo,
        company_name: src.companies.name,
        total_amount: round2(calc.totalAmount),
      });
    } catch (e) {
      skipped.push({
        source_quote_no: src.quote_no ?? '(번호없음)',
        reason: `예외: ${(e as Error).message}`,
      });
    }
  }

  revalidatePath('/quotes');
  return { ok: true, data: { created, skipped } };
}

// ───────────────────────────────────────────────────────────────
// 헬퍼
// ───────────────────────────────────────────────────────────────
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
