import type { WorkSheet } from 'xlsx';
import * as XLSX from 'xlsx';

/**
 * 워크시트를 2차원 배열로 변환 (1-indexed 헤더 + 0-indexed values).
 */
export function sheetToAOA(sheet: WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
}

/**
 * AOA에서 헤더 행 인덱스 탐색 (필수 키워드 모두 포함하는 첫 행).
 */
export function findHeaderRow(aoa: unknown[][], requiredKeywords: string[]): number {
  for (let r = 0; r < Math.min(aoa.length, 10); r++) {
    const row = (aoa[r] ?? []).map((c) => (c == null ? '' : String(c).trim()));
    const ok = requiredKeywords.every((kw) => row.some((cell) => cell === kw));
    if (ok) return r;
  }
  return -1;
}

/** 헤더 명칭 → 컬럼 인덱스 매핑 (첫 등장). */
export function mapIndices(headerRow: unknown[], labels: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const label of labels) {
    map[label] = headerRow.findIndex((c) => c != null && String(c).trim() === label);
  }
  return map;
}

/** 셀 값을 trim된 string으로. 빈 값은 null. */
export function cellStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

/**
 * 견적서DB 이메일 셀에서 자주 보이는 잡음 정리:
 *  - "이름 <email@x>" → email@x
 *  - "<email@x>"      → email@x
 *  - "'email@x'"      → email@x
 *  - "email@x)"       → email@x
 *  - 양 끝 공백/따옴표/괄호 제거
 * 정리 후에도 비어있으면 null. 비-이메일 문자열은 그대로 반환되어
 * 후속 Zod 검증에서 실패하도록 둔다(사용자에게 노출).
 */
export function cleanEmail(v: unknown): string | null {
  let s = cellStr(v);
  if (!s) return null;

  // "이름 <email>" 또는 "<email>" 안의 이메일 추출
  const bracket = s.match(/<\s*([^<>]+?)\s*>/);
  if (bracket && bracket[1]) {
    s = bracket[1];
  }

  // 양 끝 잡문자 제거 (따옴표 ' " ` , 공백, 괄호)
  s = s.replace(/^[\s'"`(]+|[\s'"`)]+$/g, '').trim();

  return s.length === 0 ? null : s;
}

/** 셀 값을 정수로. 변환 불가/빈 값은 null. */
export function cellInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** 엑셀 날짜 셀 → 'YYYY-MM-DD' 문자열. Date 인스턴스/숫자/문자열 모두 처리. */
export function excelDateToISO(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y.toString().padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (typeof v === 'string') {
    // 이미 'YYYY-MM-DD' 형식이거나 'YYYY-MM-DD 00:00:00' 등
    const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
  }
  return null;
}

/** 할인율 정규화: 0.10 / 10 / "10%" 모두 0.10으로. */
export function normalizeRate(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const t = v.trim().replace('%', '');
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    // "10%" → 10 → 0.10
    return n > 1 ? n / 100 : n;
  }
  if (typeof v === 'number') {
    return v > 1 ? v / 100 : v;
  }
  return null;
}

/** 매체 코드 정규화. */
export function normalizeMedia(v: unknown): 'K' | 'S' | 'M' | null {
  const s = cellStr(v);
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === 'K' || u === 'S' || u === 'M') return u;
  return null;
}

/** 상품 등급 정규화 (한글 → enum). */
export function normalizeTier(v: unknown): 'unique' | 'premium' | 'basic' | 'lite' | null {
  const s = cellStr(v);
  if (!s) return null;
  if (s === '유니크' || s.toLowerCase() === 'unique') return 'unique';
  if (s === '프리미엄' || s.toLowerCase() === 'premium') return 'premium';
  if (s === '베이직' || s.toLowerCase() === 'basic') return 'basic';
  if (s === '라이트' || s.toLowerCase() === 'lite') return 'lite';
  return null;
}

/** 계정유형 정규화 (한글 → enum). */
export function normalizeAccountType(v: unknown): 'advertiser' | 'agency' | null {
  const s = cellStr(v);
  if (!s) return null;
  if (s === '광고주') return 'advertiser';
  if (s === '제휴사') return 'agency';
  return null;
}
