import type { WorkBook } from 'xlsx';
import {
  BULK_COLUMNS,
  BULK_REQUIRED_HEADERS,
  COMPANIES_SHEET_NAME,
} from '@/lib/companies/bulk-template';
import {
  sheetToAOA,
  findHeaderRow,
  mapIndices,
  cellStr,
  cellInt,
  cleanEmail,
  normalizeAccountType,
} from './sheet-utils';

/** 활성 셀(Y/N, 활성/비활성, true/false 등) → boolean | null. */
export function normalizeActive(v: unknown): boolean | null {
  const s = cellStr(v);
  if (!s) return null;
  const u = s.toLowerCase();
  if (['y', 'yes', 'true', '1', '활성', 'o'].includes(u) || s === '활성') return true;
  if (['n', 'no', 'false', '0', '비활성', 'x'].includes(u) || s === '비활성') return false;
  return null;
}

/** 역할 셀(받는사람/참조/primary/cc) → 'primary' | 'cc' | null. */
export function normalizeRole(v: unknown): 'primary' | 'cc' | null {
  const s = cellStr(v);
  if (!s) return null;
  const u = s.toLowerCase();
  if (s === '받는사람' || s === '받는 사람' || u === 'primary' || s === '주') return 'primary';
  if (s === '참조' || u === 'cc') return 'cc';
  return null;
}

/** 파서 출력: Zod 검증 전의 정규화 행 (값은 적절히 타입 변환됨). */
export interface ParsedFlatRow {
  rowIndex: number;
  company_id: string | null;
  sub_company_id: string | null;
  contact_id: string | null;
  company_name: string | null;
  no: number | null;
  account_type: 'advertiser' | 'agency' | null;
  user_database: string | null;
  user_agency_id: string | null;
  url: string | null;
  company_memo: string | null;
  is_active: boolean | null;
  sub_company_name: string | null;
  database_code: string | null;
  agency_id: string | null;
  sub_memo: string | null;
  role: 'primary' | 'cc' | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  formatted_address: string | null;
}

/**
 * 거래처 대량 관리 단일 평면 시트 파싱.
 * "거래처" 시트 우선, 없으면 첫 시트. 헤더는 필수 키워드로 자동 탐색.
 * 거래처명/세부ID/연락처ID 모두 빈 행은 스킵.
 */
export function parseCompaniesFlat(workbook: WorkBook): ParsedFlatRow[] {
  const sheet =
    workbook.Sheets[COMPANIES_SHEET_NAME] ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const aoa = sheetToAOA(sheet);
  const headerIdx = findHeaderRow(aoa, BULK_REQUIRED_HEADERS);
  if (headerIdx < 0) return [];

  const idx = mapIndices(aoa[headerIdx], BULK_COLUMNS.map((c) => c.header));
  const at = (row: unknown[], header: string) => {
    const i = idx[header];
    return i >= 0 ? row[i] : null;
  };

  const out: ParsedFlatRow[] = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];

    const companyName = cellStr(at(row, '거래처명'));
    const subId = cellStr(at(row, '세부거래처ID'));
    const contactId = cellStr(at(row, '연락처ID'));
    const companyId = cellStr(at(row, '거래처ID'));

    // 완전 빈 행 스킵
    if (!companyName && !companyId && !subId && !contactId) continue;

    out.push({
      rowIndex: r - headerIdx, // 1-base (헤더 다음 행이 1)
      company_id: companyId,
      sub_company_id: subId,
      contact_id: contactId,
      company_name: companyName,
      no: cellInt(at(row, 'No')),
      account_type: normalizeAccountType(at(row, '계정유형')),
      user_database: cellStr(at(row, 'userDatabase')),
      user_agency_id: cellStr(at(row, 'userAgencyId')),
      url: cellStr(at(row, 'URL')),
      company_memo: cellStr(at(row, '거래처메모')),
      is_active: normalizeActive(at(row, '활성')),
      sub_company_name: cellStr(at(row, '세부거래처명')),
      database_code: cellStr(at(row, 'database')),
      agency_id: cellStr(at(row, 'agencyId')),
      sub_memo: cellStr(at(row, '세부메모')),
      role: normalizeRole(at(row, '역할')),
      display_name: cellStr(at(row, '담당자명')),
      email: cleanEmail(at(row, '이메일')),
      phone: cellStr(at(row, '연락처(전화)')),
      formatted_address: cellStr(at(row, '표시양식')),
    });
  }

  return out;
}
