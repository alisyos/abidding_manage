import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { parseRawMaster } from '@/lib/import/parse-raw-master';
import { parseRawUsage } from '@/lib/import/parse-raw-usage';
import { parseQuoteDb } from '@/lib/import/parse-quote-db';
import { parseDraft } from '@/lib/import/parse-draft';
import { applyImport } from '@/lib/import/apply-import';
import {
  masterRowSchema,
  subCompanyRowSchema,
  contactRowSchema,
  usageRowSchema,
  draftRowSchema,
  type ImportDryResult,
  type ImportSectionResult,
} from '@/lib/validation/import';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validateSection<T>(
  rows: unknown[],
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { errors: { message: string }[] } } },
  previewLimit = 50,
): ImportSectionResult<T> {
  const valid: T[] = [];
  const errors: { rowIndex: number; message: string; raw: unknown }[] = [];
  rows.forEach((raw, i) => {
    const result = schema.safeParse(raw);
    if (result.success) {
      valid.push(result.data);
    } else {
      errors.push({
        rowIndex: i + 1,
        message: result.error.errors[0]?.message ?? '검증 실패',
        raw,
      });
    }
  });
  return {
    total: rows.length,
    valid: valid.length,
    errors,
    preview: valid.slice(0, previewLimit),
  };
}

export async function POST(req: Request) {
  // 인증 확인
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

  // 시트 존재 검증
  const requiredSheets = ['raw', '견적서DB', '초안'];
  const missing = requiredSheets.filter((n) => !workbook.Sheets[n]);
  if (missing.length) {
    return NextResponse.json(
      { error: `필수 시트 누락: ${missing.join(', ')}` },
      { status: 400 },
    );
  }

  // 파싱
  const rawSheet = workbook.Sheets['raw'];
  const master = parseRawMaster(rawSheet);
  const { subCompanies, usage } = parseRawUsage(rawSheet);
  const contacts = parseQuoteDb(workbook.Sheets['견적서DB']);
  const draft = parseDraft(workbook.Sheets['초안']);

  // 검증
  const result: ImportDryResult = {
    master: validateSection(master, masterRowSchema),
    subCompanies: validateSection(subCompanies, subCompanyRowSchema),
    usage: validateSection(usage, usageRowSchema, 100),
    contacts: validateSection(contacts, contactRowSchema, 100),
    draft: validateSection(draft, draftRowSchema),
  };

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, result });
  }

  // 오류가 있으면 거부
  const totalErrors =
    result.master.errors.length +
    result.subCompanies.errors.length +
    result.usage.errors.length +
    result.contacts.errors.length +
    result.draft.errors.length;
  if (totalErrors > 0) {
    return NextResponse.json(
      { error: `검증 오류 ${totalErrors}건이 있습니다. dry=true로 먼저 확인하세요.`, result },
      { status: 422 },
    );
  }

  // 적용
  try {
    const service = createServiceClient();
    const applyResult = await applyImport(service, {
      master: result.master.preview.length === result.master.total ? result.master.preview : master,
      subCompanies:
        result.subCompanies.preview.length === result.subCompanies.total
          ? result.subCompanies.preview
          : subCompanies,
      usage: result.usage.preview.length === result.usage.total ? result.usage.preview : usage,
      contacts:
        result.contacts.preview.length === result.contacts.total
          ? result.contacts.preview
          : contacts,
      draft: result.draft.preview.length === result.draft.total ? result.draft.preview : draft,
    });

    revalidatePath('/companies');
    return NextResponse.json({ ok: true, dry: false, applied: applyResult });
  } catch (e) {
    return NextResponse.json(
      { error: `적용 실패: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
