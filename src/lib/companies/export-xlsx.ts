import * as XLSX from 'xlsx';
import {
  BULK_COLUMNS,
  BULK_HEADER_ROW,
  COMPANIES_SHEET_NAME,
  type FlatRow,
} from './bulk-template';

/**
 * 평면 행 배열 → 거래처 대량 관리 xlsx (ArrayBuffer).
 * 행이 없으면 헤더만 있는 빈 양식이 된다.
 */
export function buildCompaniesWorkbook(rows: FlatRow[]): ArrayBuffer {
  const aoa: (string | number | null)[][] = [BULK_HEADER_ROW];

  for (const r of rows) {
    aoa.push(
      BULK_COLUMNS.map((col) => {
        const v = (r as unknown as Record<string, unknown>)[col.key];
        if (v == null) return null;
        return typeof v === 'number' ? v : String(v);
      }),
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 컬럼 너비 + 숨김(시스템 ID)
  ws['!cols'] = BULK_COLUMNS.map((c) => ({ wch: c.width, hidden: c.hidden ?? false }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, COMPANIES_SHEET_NAME);

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
