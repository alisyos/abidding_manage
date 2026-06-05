import type { WorkSheet, WorkBook } from 'xlsx';
import { sheetToAOA, findHeaderRow, mapIndices, cellStr, excelDateToISO } from './sheet-utils';

export interface ParsedSalesRow {
  rowIndex: number;
  quote_no: string;
  payment_date: string | null;
  tax_invoice_no: string | null;
  tax_invoice_issued_at: string | null;
}

/**
 * 입금/세금계산서 일괄 업로드 시트 파서.
 * 첫 시트의 헤더에 `견적번호` 또는 `quote_no` 가 포함된 것을 자동 감지.
 *
 * 인식 헤더 (별칭 모두 지원):
 *  - 견적번호 | quote_no
 *  - 입금일자 | payment_date
 *  - 세금계산서번호 | tax_invoice_no
 *  - 계산서발행일 | tax_invoice_issued_at
 */
export function parseSalesSheet(workbook: WorkBook): ParsedSalesRow[] {
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];

  return parseSalesSheetCore(sheet);
}

function parseSalesSheetCore(sheet: WorkSheet): ParsedSalesRow[] {
  const aoa = sheetToAOA(sheet);
  // 헤더 자동 감지: 첫 10행 안에서 quote_no 후보가 있는 행
  const headerCandidates = ['견적번호', 'quote_no', 'Quote No'];
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(aoa.length, 10); r++) {
    const row = (aoa[r] ?? []).map((c) => (c == null ? '' : String(c).trim()));
    if (headerCandidates.some((h) => row.includes(h))) {
      headerRowIdx = r;
      break;
    }
  }
  if (headerRowIdx === -1) {
    // 마지막 시도: findHeaderRow
    headerRowIdx = findHeaderRow(aoa, ['견적번호']);
    if (headerRowIdx === -1) return [];
  }

  const header = aoa[headerRowIdx];
  const idx = mapIndicesAny(header, {
    quote_no: ['견적번호', 'quote_no', 'Quote No'],
    payment_date: ['입금일자', 'payment_date', '입금일'],
    tax_invoice_no: ['세금계산서번호', 'tax_invoice_no', '세계번호'],
    tax_invoice_issued_at: ['계산서발행일', 'tax_invoice_issued_at', '발행일'],
  });

  if (idx.quote_no === -1 || idx.payment_date === -1) return [];

  const rows: ParsedSalesRow[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const quoteNo = cellStr(row[idx.quote_no]);
    if (!quoteNo) continue;

    rows.push({
      rowIndex: r - headerRowIdx,
      quote_no: quoteNo,
      payment_date: excelDateToISO(row[idx.payment_date]) ?? cellStr(row[idx.payment_date]),
      tax_invoice_no:
        idx.tax_invoice_no >= 0 ? cellStr(row[idx.tax_invoice_no]) : null,
      tax_invoice_issued_at:
        idx.tax_invoice_issued_at >= 0
          ? excelDateToISO(row[idx.tax_invoice_issued_at]) ??
            cellStr(row[idx.tax_invoice_issued_at])
          : null,
    });
  }

  return rows;
}

/** mapIndices 의 별칭 버전 — 여러 후보 헤더명 중 첫 매칭 인덱스 반환 */
function mapIndicesAny(
  header: unknown[],
  aliasMap: Record<string, string[]>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(aliasMap)) {
    let found = -1;
    for (const alias of aliases) {
      const i = header.findIndex((c) => c != null && String(c).trim() === alias);
      if (i >= 0) {
        found = i;
        break;
      }
    }
    out[key] = found;
  }
  return out;
}
