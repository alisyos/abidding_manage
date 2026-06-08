'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  adjustmentInputSchema,
  type AdjustmentInput,
} from '@/lib/validation/adjustment';
import { firstDayOfMonth } from '@/lib/quotes/period';
import { computeSalesEconomics } from '@/lib/sales/economics';
import type { Media, Tier, QuoteStatus } from '@/lib/supabase/types';

export interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

const TIERS: Tier[] = ['unique', 'premium', 'basic', 'lite'];

/** 변동 있는 매체별 insert 행 생성. 정산액은 클라이언트 최종값(천원내림 + 관리자 수정) 그대로. */
function buildAdjustmentRows(
  input: AdjustmentInput,
  accountType: 'advertiser' | 'agency',
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const md of input.media_deltas) {
    const deltas = {
      unique: md.delta_unique,
      premium: md.delta_premium,
      basic: md.delta_basic,
      lite: md.delta_lite,
    };
    if (!TIERS.some((t) => deltas[t] !== 0)) continue; // 변동 없는 매체 skip
    rows.push({
      quote_id: input.quote_id,
      adjustment_date: input.adjustment_date,
      account_type: accountType,
      media: md.media as Media,
      delta_unique: md.delta_unique,
      delta_premium: md.delta_premium,
      delta_basic: md.delta_basic,
      delta_lite: md.delta_lite,
      pre_adjust_amount: md.pre_adjust_amount,
      reason: input.reason || null,
    });
  }
  return rows;
}

async function fetchAccountType(
  supabase: ReturnType<typeof createClient>,
  quoteId: string,
): Promise<'advertiser' | 'agency' | null> {
  const { data } = await supabase
    .from('quotes')
    .select('companies(account_type)')
    .eq('id', quoteId)
    .single();
  const row = data as unknown as { companies: { account_type: 'advertiser' | 'agency' } | null } | null;
  return row?.companies?.account_type ?? null;
}

/**
 * 조정 등록: quote_adjustments insert(다중 매체) + (won/paid면) sales_records 동기화.
 *
 * 견적/매출 분리 모델: 조정은 견적서 문서(quotes 금액)를 수정하지 않는다.
 * 일할 계산액은 sales_records 에만 반영되고(computeSalesEconomics), 익월 견적에는
 * 조정 delta 합산 수량으로 별도 반영된다(carryForward).
 *
 * 이 액션은 메일 발송을 하지 않는다 — 호출 후 클라이언트가 /adjustments/[id]/send 로 이동.
 */
export async function createAdjustment(
  inputRaw: AdjustmentInput,
): Promise<ActionResult<{ id: string; quote_id: string; adjustment_date: string }>> {
  const parsed = adjustmentInputSchema.safeParse(inputRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? '검증 실패' };
  }
  const input = parsed.data;
  const supabase = createClient();

  const accountType = await fetchAccountType(supabase, input.quote_id);
  if (!accountType) return { ok: false, error: '견적을 찾을 수 없습니다' };

  const rows = buildAdjustmentRows(input, accountType);
  if (rows.length === 0) return { ok: false, error: '변동 수량을 1개 이상 입력하세요' };

  const { data: insRows, error: insErr } = await supabase
    .from('quote_adjustments')
    .insert(rows)
    .select('id');
  if (insErr || !insRows || insRows.length === 0) {
    return { ok: false, error: `조정 등록 실패: ${insErr?.message}` };
  }
  const firstId = (insRows[0] as unknown as { id: string }).id;

  await resyncSalesIfRevenue(supabase, input.quote_id);

  revalidatePath('/adjustments');
  revalidatePath('/quotes');
  revalidatePath('/sales');

  return {
    ok: true,
    data: { id: firstId, quote_id: input.quote_id, adjustment_date: input.adjustment_date },
  };
}

/**
 * 조정 수정(이벤트 단위): replaceIds(같은 견적+조정일자의 형제 행) 삭제 후 새 행 insert.
 * 견적이 won/paid면 매출 재동기화.
 */
export async function updateAdjustment(
  replaceIds: string[],
  inputRaw: AdjustmentInput,
): Promise<ActionResult<{ id: string; quote_id: string; adjustment_date: string }>> {
  const parsed = adjustmentInputSchema.safeParse(inputRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? '검증 실패' };
  }
  const input = parsed.data;
  const supabase = createClient();

  const accountType = await fetchAccountType(supabase, input.quote_id);
  if (!accountType) return { ok: false, error: '견적을 찾을 수 없습니다' };

  const rows = buildAdjustmentRows(input, accountType);
  if (rows.length === 0) return { ok: false, error: '변동 수량을 1개 이상 입력하세요' };

  // 기존 이벤트 행 삭제 → 새 행 insert
  if (replaceIds.length > 0) {
    const { error: delErr } = await supabase
      .from('quote_adjustments')
      .delete()
      .in('id', replaceIds);
    if (delErr) return { ok: false, error: `기존 조정 삭제 실패: ${delErr.message}` };
  }
  const { data: insRows, error: insErr } = await supabase
    .from('quote_adjustments')
    .insert(rows)
    .select('id');
  if (insErr || !insRows || insRows.length === 0) {
    return { ok: false, error: `조정 수정 실패: ${insErr?.message}` };
  }
  const firstId = (insRows[0] as unknown as { id: string }).id;

  await resyncSalesIfRevenue(supabase, input.quote_id);

  revalidatePath('/adjustments');
  revalidatePath('/quotes');
  revalidatePath('/sales');

  return {
    ok: true,
    data: { id: firstId, quote_id: input.quote_id, adjustment_date: input.adjustment_date },
  };
}

// ───────────────────────────────────────────────────────────────
// 조정 삭제 — 삭제 후 won/paid 견적은 매출 재계산 (조정 delta 제거 반영)
// ───────────────────────────────────────────────────────────────
async function resyncSalesIfRevenue(
  supabase: ReturnType<typeof createClient>,
  quoteId: string,
): Promise<void> {
  const { data: qRaw } = await supabase
    .from('quotes')
    .select('status, service_start')
    .eq('id', quoteId)
    .single();
  const q = qRaw as unknown as { status: QuoteStatus; service_start: string } | null;
  if (!q || (q.status !== 'won' && q.status !== 'paid')) return;
  const econ = await computeSalesEconomics(supabase, quoteId);
  if (!econ) return;
  await supabase
    .from('sales_records')
    .update({
      revenue_month: firstDayOfMonth(q.service_start),
      base_amount: econ.base_amount,
      variable_adjust: econ.variable_adjust,
      vat_amount: econ.vat_amount,
      total_amount: econ.total_amount,
    })
    .eq('quote_id', quoteId);
}

export async function deleteAdjustment(id: string): Promise<ActionResult> {
  const supabase = createClient();

  const { data: aRaw, error: aErr } = await supabase
    .from('quote_adjustments')
    .select('quote_id')
    .eq('id', id)
    .single();
  if (aErr || !aRaw) return { ok: false, error: '조정을 찾을 수 없습니다' };
  const quoteId = (aRaw as unknown as { quote_id: string }).quote_id;

  const { error } = await supabase.from('quote_adjustments').delete().eq('id', id);
  if (error) return { ok: false, error: `조정 삭제 실패: ${error.message}` };

  await resyncSalesIfRevenue(supabase, quoteId);

  revalidatePath('/adjustments');
  revalidatePath('/quotes');
  revalidatePath('/sales');
  return { ok: true };
}

export async function bulkDeleteAdjustments(
  ids: string[],
): Promise<ActionResult<{ success: number; failed: string[] }>> {
  if (!ids.length) return { ok: true, data: { success: 0, failed: [] } };
  const supabase = createClient();

  // 영향 quote_id 매핑 (재계산용)
  const { data: rows } = await supabase
    .from('quote_adjustments')
    .select('id, quote_id')
    .in('id', ids);
  const found = (rows ?? []) as unknown as { id: string; quote_id: string }[];
  const affectedQuoteIds = Array.from(new Set(found.map((r) => r.quote_id)));

  const failed: string[] = [];
  const { error } = await supabase.from('quote_adjustments').delete().in('id', ids);
  if (error) return { ok: false, error: `조정 삭제 실패: ${error.message}` };
  const success = found.length;
  for (const id of ids) {
    if (!found.find((r) => r.id === id)) failed.push(`${id}: 조정 없음`);
  }

  // 영향 견적별 매출 재계산
  for (const qid of affectedQuoteIds) {
    await resyncSalesIfRevenue(supabase, qid);
  }

  revalidatePath('/adjustments');
  revalidatePath('/quotes');
  revalidatePath('/sales');
  return { ok: true, data: { success, failed } };
}
