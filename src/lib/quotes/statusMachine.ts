import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuoteStatus } from '@/lib/supabase/types';
import { firstDayOfMonth } from './period';
import { computeSalesEconomics } from '@/lib/sales/economics';

export interface PaidPatch {
  payment_date: string;
  tax_invoice_no?: string | null;
  tax_invoice_issued_at?: string | null;
}

export interface TransitionContext {
  supabase: SupabaseClient;
  quoteId: string;
  paidPatch?: PaidPatch;
}

export interface TransitionResult {
  ok: boolean;
  error?: string;
}

// Phase 3 정책: 모든 전이 허용 (사용자 확인 팝업에 의존).
export function canTransition(_from: QuoteStatus, _to: QuoteStatus): boolean {
  return true;
}

/**
 * 견적 상태 전이 + sales_records 동기화.
 *
 * 매출 동기화 규칙:
 *  - won 또는 paid 진입: sales_records upsert(by quote_id)
 *  - won 또는 paid 에서 sent/draft 로 이탈: sales_records delete
 *  - won → paid: payment_date / tax_invoice 정보 patch
 *  - paid → won: payment_date / tax_invoice 정보 클리어
 */
export async function applyTransition(
  to: QuoteStatus,
  ctx: TransitionContext,
): Promise<TransitionResult> {
  const { supabase, quoteId } = ctx;

  type QuoteRow = {
    id: string;
    status: QuoteStatus;
    company_id: string;
    sub_company_id: string | null;
    service_start: string;
    base_amount: number;
    variable_adjust: number;
    total_amount: number;
  };

  const { data: qRaw, error: qErr } = await supabase
    .from('quotes')
    .select('id, status, company_id, sub_company_id, service_start, base_amount, variable_adjust, total_amount')
    .eq('id', quoteId)
    .single();

  if (qErr || !qRaw) return { ok: false, error: qErr?.message ?? '견적을 찾을 수 없습니다' };
  const q = qRaw as unknown as QuoteRow;
  const from = q.status;

  if (from === to) return { ok: true };

  // 1) quotes 패치
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to };

  if (to === 'sent') patch.sent_at = nowIso;
  if (to === 'won') patch.won_at = nowIso;
  if (to === 'paid') patch.paid_at = nowIso;

  if (to === 'draft') patch.sent_at = null;
  if (from === 'won' && to !== 'paid') patch.won_at = null;
  if (from === 'paid' && to !== 'paid') patch.paid_at = null;

  const { error: updErr } = await supabase.from('quotes').update(patch).eq('id', quoteId);
  if (updErr) return { ok: false, error: `상태 저장 실패: ${updErr.message}` };

  // 2) sales_records 동기화
  const becameRevenue = to === 'won' || to === 'paid';
  const wasRevenue = from === 'won' || from === 'paid';

  if (becameRevenue && !wasRevenue) {
    // 신규 매출 생성 — 매출 경제값은 단일 소스(computeSalesEconomics)로 산출.
    // 조정(quote_adjustments)이 이미 있으면 일할 계산액이 함께 반영된다.
    const econ = await computeSalesEconomics(supabase, q.id);
    const { error } = await supabase.from('sales_records').upsert(
      {
        quote_id: q.id,
        company_id: q.company_id,
        sub_company_id: q.sub_company_id,
        revenue_month: firstDayOfMonth(q.service_start),
        base_amount: econ?.base_amount ?? q.base_amount,
        variable_adjust: econ?.variable_adjust ?? q.variable_adjust,
        vat_amount: econ?.vat_amount ?? 0,
        total_amount: econ?.total_amount ?? q.total_amount,
        payment_date: to === 'paid' ? ctx.paidPatch?.payment_date ?? null : null,
        tax_invoice_no: to === 'paid' ? ctx.paidPatch?.tax_invoice_no ?? null : null,
        tax_invoice_issued_at:
          to === 'paid' ? ctx.paidPatch?.tax_invoice_issued_at ?? null : null,
      },
      { onConflict: 'quote_id' },
    );
    if (error) return { ok: false, error: `매출 생성 실패: ${error.message}` };
  } else if (!becameRevenue && wasRevenue) {
    // 매출 삭제 (revenue 상태에서 이탈)
    const { error } = await supabase.from('sales_records').delete().eq('quote_id', q.id);
    if (error) return { ok: false, error: `매출 삭제 실패: ${error.message}` };
  } else if (becameRevenue && wasRevenue) {
    // won ↔ paid 사이 이동
    if (to === 'paid') {
      if (!ctx.paidPatch?.payment_date) {
        return { ok: false, error: '입금일자(payment_date)가 필요합니다' };
      }
      const { error } = await supabase
        .from('sales_records')
        .update({
          payment_date: ctx.paidPatch.payment_date,
          tax_invoice_no: ctx.paidPatch.tax_invoice_no ?? null,
          tax_invoice_issued_at: ctx.paidPatch.tax_invoice_issued_at ?? null,
        })
        .eq('quote_id', q.id);
      if (error) return { ok: false, error: `매출 갱신 실패: ${error.message}` };
    } else {
      // paid → won: payment 정보 클리어
      const { error } = await supabase
        .from('sales_records')
        .update({
          payment_date: null,
          tax_invoice_no: null,
          tax_invoice_issued_at: null,
        })
        .eq('quote_id', q.id);
      if (error) return { ok: false, error: `매출 갱신 실패: ${error.message}` };
    }
  }

  return { ok: true };
}
