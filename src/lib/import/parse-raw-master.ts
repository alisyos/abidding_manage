import type { WorkSheet } from 'xlsx';
import { sheetToAOA, findHeaderRow, mapIndices, cellStr, cellInt } from './sheet-utils';
import type { MasterRow } from '@/lib/validation/import';

/**
 * raw 시트의 우측 마스터 영역 (L-Q열) → 거래처(companies) 마스터 row.
 *
 * 헤더: No / 업체명 / userDatabase / userAgencyId / URL / (수정/삭제 무시)
 */
export function parseRawMaster(sheet: WorkSheet): MasterRow[] {
  const aoa = sheetToAOA(sheet);
  const headerIdx = findHeaderRow(aoa, ['No', '업체명']);
  if (headerIdx === -1) return [];

  const idx = mapIndices(aoa[headerIdx], [
    'No',
    '업체명',
    'userDatabase',
    'userAgencyId',
    'URL',
  ]);

  const rows: MasterRow[] = [];
  const seenName = new Set<string>();

  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const name = cellStr(row[idx['업체명']]);
    if (!name) continue;
    if (seenName.has(name)) continue;
    seenName.add(name);

    rows.push({
      no: cellInt(row[idx['No']]),
      name,
      user_database: cellStr(row[idx['userDatabase']]) ?? null,
      user_agency_id: cellStr(row[idx['userAgencyId']]) ?? null,
      url: cellStr(row[idx['URL']]) ?? null,
    });
  }

  return rows;
}
