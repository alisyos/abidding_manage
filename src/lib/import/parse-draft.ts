import type { WorkSheet } from 'xlsx';
import {
  sheetToAOA,
  findHeaderRow,
  mapIndices,
  cellStr,
  normalizeAccountType,
} from './sheet-utils';
import type { DraftRow } from '@/lib/validation/import';

/**
 * 초안 시트 → 거래처별 계정 유형 추출.
 *
 * 헤더: 거래처 / 세부거래처 / 계정 유형 (광고주/제휴사) / ...
 * (할인율 컬럼은 신규 가격 정책에서 사용하지 않으므로 파싱하지 않음)
 * 같은 거래처가 여러 세부거래처로 분기된 경우, 첫 행의 값을 사용한다.
 */
export function parseDraft(sheet: WorkSheet): DraftRow[] {
  const aoa = sheetToAOA(sheet);
  const headerIdx = findHeaderRow(aoa, ['거래처', '계정 유형']);
  if (headerIdx === -1) return [];

  const idx = mapIndices(aoa[headerIdx], ['거래처', '계정 유형']);

  const seen = new Map<string, DraftRow>();
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const name = cellStr(row[idx['거래처']]);
    if (!name) continue;
    if (seen.has(name)) continue;

    seen.set(name, {
      name,
      account_type: normalizeAccountType(row[idx['계정 유형']]),
    });
  }

  return Array.from(seen.values());
}
