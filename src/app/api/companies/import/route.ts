import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseCompaniesFlat, type ParsedFlatRow } from '@/lib/import/parse-companies-flat';
import { applyCompaniesBulk, computeCounts } from '@/lib/import/apply-companies-bulk';
import { bulkFlatRowSchema, type BulkDryResult, type BulkRowError } from '@/lib/validation/company-bulk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 거래처 대량 등록·수정 (단일 평면 시트).
 *   POST /api/companies/import?dry=true   — 파싱+검증+요약 미리보기
 *   POST /api/companies/import?dry=false  — 적용 (ID 유무로 신규/수정 판별)
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
    return NextResponse.json({ error: `폼 파싱 실패: ${(e as Error).message}` }, { status: 400 });
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
    return NextResponse.json({ error: `엑셀 파싱 실패: ${(e as Error).message}` }, { status: 400 });
  }

  const parsed = parseCompaniesFlat(workbook);
  if (parsed.length === 0) {
    return NextResponse.json(
      { error: '데이터 행을 찾지 못했습니다. "거래처명/세부거래처명/이메일" 헤더가 있는지 확인하세요.' },
      { status: 400 },
    );
  }

  // 검증
  const validRows: ParsedFlatRow[] = [];
  const errors: BulkRowError[] = [];
  for (const row of parsed) {
    const res = bulkFlatRowSchema.safeParse(row);
    if (res.success) {
      validRows.push(row);
    } else {
      errors.push({
        rowIndex: row.rowIndex,
        message: res.error.errors[0]?.message ?? '검증 실패',
        raw: row,
      });
    }
  }

  const counts = computeCounts(validRows);
  const result: BulkDryResult = {
    totalRows: parsed.length,
    validRows: validRows.length,
    errors,
    preview: validRows.slice(0, 30) as unknown as BulkDryResult['preview'],
    counts,
  };

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, result });
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { error: `검증 오류 ${errors.length}건이 있습니다. dry=true로 먼저 확인하세요.`, result },
      { status: 422 },
    );
  }

  try {
    const service = createServiceClient();
    const applied = await applyCompaniesBulk(service, validRows);
    revalidatePath('/companies');
    return NextResponse.json({ ok: true, dry: false, applied });
  } catch (e) {
    return NextResponse.json({ error: `적용 실패: ${(e as Error).message}` }, { status: 500 });
  }
}
