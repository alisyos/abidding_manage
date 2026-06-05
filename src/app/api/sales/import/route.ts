import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/server';
import { parseSalesSheet } from '@/lib/import/parse-sales';
import {
  salesImportRowSchema,
  type SalesImportDryResult,
  type SalesImportApplyResult,
  type SalesImportPreviewItem,
} from '@/lib/validation/sales-import';
import { applyTransition } from '@/lib/quotes/statusMachine';
import type { QuoteStatus } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 입금 일괄 업로드.
 *  - dry=true → 미리보기 (매칭/오류/이미입금)
 *  - dry=false → 적용 (changeStatus로 paid 전환 + sales_records 동기화)
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '인증되지 않은 사용자' }, { status: 401 });
  }

  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === 'true';

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e) {
    return NextResponse.json(
      { error: `폼 파싱 실패: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file 필드가 비어있습니다' }, { status: 400 });
  }

  let workbook: XLSX.WorkBook;
  try {
    const buf = await file.arrayBuffer();
    workbook = XLSX.read(buf, { type: 'array', cellDates: true });
  } catch (e) {
    return NextResponse.json(
      { error: `엑셀 파싱 실패: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  // 파싱 + 검증
  const parsed = parseSalesSheet(workbook);
  const errors: SalesImportDryResult['errors'] = [];
  const validRows: { rowIndex: number; row: ReturnType<typeof salesImportRowSchema.parse> }[] = [];

  parsed.forEach((r) => {
    const result = salesImportRowSchema.safeParse(r);
    if (result.success) {
      validRows.push({ rowIndex: r.rowIndex, row: result.data });
    } else {
      errors.push({
        rowIndex: r.rowIndex,
        message: result.error.errors[0]?.message ?? '검증 실패',
        raw: r,
      });
    }
  });

  // 견적 매칭 일괄 조회
  type QuoteRef = {
    id: string;
    quote_no: string;
    status: QuoteStatus;
    total_amount: number;
    companies: { name: string };
  };
  const quoteNos = Array.from(new Set(validRows.map((r) => r.row.quote_no)));
  let quoteMap = new Map<string, QuoteRef>();
  if (quoteNos.length > 0) {
    const { data: qRows } = await supabase
      .from('quotes')
      .select('id, quote_no, status, total_amount, companies(name)')
      .in('quote_no', quoteNos);
    for (const q of (qRows ?? []) as unknown as QuoteRef[]) {
      quoteMap.set(q.quote_no, q);
    }
  }

  const preview: SalesImportPreviewItem[] = validRows.map(({ rowIndex, row }) => {
    const found = quoteMap.get(row.quote_no);
    if (!found) {
      return {
        rowIndex,
        raw: row,
        match: { ok: false, reason: '해당 견적번호를 찾을 수 없습니다' },
      };
    }
    return {
      rowIndex,
      raw: row,
      match: {
        ok: true,
        quote_id: found.id,
        company_name: found.companies?.name ?? '-',
        total_amount: Number(found.total_amount ?? 0),
        already_paid: found.status === 'paid',
      },
    };
  });

  const result: SalesImportDryResult = {
    total: parsed.length,
    valid: validRows.length,
    errors,
    preview,
  };

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, result });
  }

  // 검증 오류 있으면 거부
  if (errors.length > 0) {
    return NextResponse.json(
      { error: `검증 오류 ${errors.length}건. dry=true 먼저 확인 필요`, result },
      { status: 422 },
    );
  }

  // 적용
  const applied: SalesImportApplyResult = {
    applied: 0,
    alreadyPaid: 0,
    notFound: [],
    failed: [],
  };
  for (const p of preview) {
    if (!p.match.ok) {
      applied.notFound.push({ quote_no: p.raw.quote_no, rowIndex: p.rowIndex });
      continue;
    }
    // already_paid 면 sales_records의 payment 정보만 갱신 (재발행 케이스 대응)
    try {
      const res = await applyTransition('paid', {
        supabase,
        quoteId: p.match.quote_id,
        paidPatch: {
          payment_date: p.raw.payment_date,
          tax_invoice_no: p.raw.tax_invoice_no || null,
          tax_invoice_issued_at: p.raw.tax_invoice_issued_at || null,
        },
      });
      if (!res.ok) {
        applied.failed.push({
          quote_no: p.raw.quote_no,
          rowIndex: p.rowIndex,
          error: res.error ?? '전환 실패',
        });
      } else if (p.match.already_paid) {
        applied.alreadyPaid++;
      } else {
        applied.applied++;
      }
    } catch (e) {
      applied.failed.push({
        quote_no: p.raw.quote_no,
        rowIndex: p.rowIndex,
        error: (e as Error).message,
      });
    }
  }

  revalidatePath('/sales');
  revalidatePath('/quotes');

  return NextResponse.json({ ok: true, dry: false, applied });
}
