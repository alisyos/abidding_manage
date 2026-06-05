import type { WorkSheet } from 'xlsx';
import {
  sheetToAOA,
  findHeaderRow,
  mapIndices,
  cellStr,
  cellInt,
  excelDateToISO,
  normalizeMedia,
  normalizeTier,
} from './sheet-utils';
import type { SubCompanyRow, UsageRow } from '@/lib/validation/import';

/**
 * raw 시트의 좌측 영역 (A-J열) → 세부거래처(sub_companies) + 월별 사용량(monthly_usage).
 *
 * 헤더: 거래처 / 세부거래처 / database / agencyId / 타입(K/S/M) /
 *       상품(유니크/프리미엄/베이직/라이트) / 개수 / 사용시작 / 사용종료
 *
 * 한 행 = (세부거래처, 매체, 등급) 1개씩의 사용량.
 */
export function parseRawUsage(sheet: WorkSheet): {
  subCompanies: SubCompanyRow[];
  usage: UsageRow[];
} {
  const aoa = sheetToAOA(sheet);
  const headerIdx = findHeaderRow(aoa, ['거래처', '세부거래처', '타입(K/S/M)']);
  if (headerIdx === -1) return { subCompanies: [], usage: [] };

  const idx = mapIndices(aoa[headerIdx], [
    '거래처',
    '세부거래처',
    'database',
    'agencyId',
    '타입(K/S/M)',
    '상품(유니크/프리미엄/베이직/라이트)',
    '개수',
    '사용시작(YYYY-MM-DD)',
    '사용종료(YYYY-MM-DD)',
  ]);

  const subMap = new Map<string, SubCompanyRow>(); // key: company__sub
  const usage: UsageRow[] = [];

  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const companyName = cellStr(row[idx['거래처']]);
    const subName = cellStr(row[idx['세부거래처']]);
    if (!companyName || !subName) continue;

    const key = `${companyName}__${subName}`;
    if (!subMap.has(key)) {
      subMap.set(key, {
        company_name: companyName,
        name: subName,
        database_code: cellStr(row[idx['database']]) ?? null,
        agency_id: cellStr(row[idx['agencyId']]) ?? null,
      });
    }

    const media = normalizeMedia(row[idx['타입(K/S/M)']]);
    const tier = normalizeTier(row[idx['상품(유니크/프리미엄/베이직/라이트)']]);
    const quantity = cellInt(row[idx['개수']]);
    if (!media || !tier || quantity == null || quantity <= 0) continue;

    usage.push({
      company_name: companyName,
      sub_company_name: subName,
      media,
      tier,
      quantity,
      usage_start: excelDateToISO(row[idx['사용시작(YYYY-MM-DD)']]),
      usage_end: excelDateToISO(row[idx['사용종료(YYYY-MM-DD)']]),
    });
  }

  return { subCompanies: Array.from(subMap.values()), usage };
}
