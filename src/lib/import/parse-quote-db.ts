import type { WorkSheet } from 'xlsx';
import { sheetToAOA, cellStr, cleanEmail } from './sheet-utils';
import { generateFormattedAddress } from '@/lib/format/contact';
import type { ContactRow } from '@/lib/validation/import';

/**
 * 견적서DB 시트 → company_contacts row 분해.
 *
 * 헤더 (R2):
 *   C2=세부거래처, C3=회사명, C4=담당자명, C5=연락처, C6=이메일
 *   C7=받는사람(primary 표시명), C8=이메일, C9=양식(formatted_address)
 *   C10=cc 전체 (요약 — 사용 안함)
 *   C11=cc1 표시명, C12=이메일, C13=cc양식1
 *   ... cc1~cc8 (총 8명까지)
 *
 * 한 행 = 한 세부거래처 → primary 1명 + cc 0~8명 분해.
 */
export function parseQuoteDb(sheet: WorkSheet): ContactRow[] {
  const aoa = sheetToAOA(sheet);
  // 헤더가 R2(인덱스 1)에 있다고 가정 (시트 분석 결과)
  // findHeaderRow로 안전하게 탐색
  let headerIdx = -1;
  for (let r = 0; r < Math.min(aoa.length, 5); r++) {
    const row = (aoa[r] ?? []).map((c) => (c == null ? '' : String(c).trim()));
    if (row.includes('세부거래처') && row.includes('받는 사람')) {
      headerIdx = r;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const header = aoa[headerIdx] as unknown[];
  const cIdx = (label: string, from = 0): number => {
    for (let c = from; c < header.length; c++) {
      if (cellStr(header[c]) === label) return c;
    }
    return -1;
  };

  // 핵심 컬럼 위치
  const subIdx = cIdx('세부거래처');
  const companyIdx = cIdx('회사명');
  const primaryNameIdx = cIdx('받는 사람');
  const formatIdx = cIdx('양식');
  // primary의 이메일은 '받는 사람' 바로 다음 '이메일'
  const primaryEmailIdx = primaryNameIdx !== -1 ? cIdx('이메일', primaryNameIdx + 1) : -1;
  const ccAllIdx = cIdx('cc 전체');

  // 담당자 폴백용
  const ownerNameIdx = cIdx('담당자명');
  const ownerPhoneIdx = cIdx('연락처');
  const ownerEmailIdx = cIdx('이메일');

  // cc 블록 8개 (cc1~cc8)
  const ccBlocks: { name: number; email: number; format: number }[] = [];
  let ccSearchFrom = Math.max(ccAllIdx + 1, formatIdx + 1);
  for (let n = 1; n <= 8; n++) {
    const nameI = cIdx(`cc${n}`, ccSearchFrom);
    if (nameI === -1) break;
    const emailI = cIdx('이메일', nameI + 1);
    const formatI = cIdx(`cc 양식${n}`, nameI + 1);
    ccBlocks.push({ name: nameI, email: emailI, format: formatI });
    ccSearchFrom = nameI + 1;
  }

  const out: ContactRow[] = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const subName = cellStr(row[subIdx]);
    const companyName = cellStr(row[companyIdx]);
    if (!subName || !companyName) continue;

    // primary
    const pEmail = cleanEmail(row[primaryEmailIdx]) ?? cleanEmail(row[ownerEmailIdx]);
    if (pEmail) {
      const pName = cellStr(row[primaryNameIdx]) ?? cellStr(row[ownerNameIdx]);
      const pFormat = cellStr(row[formatIdx]);
      out.push({
        company_name: companyName,
        sub_company_name: subName,
        role: 'primary',
        sort_order: 0,
        display_name: pName,
        email: pEmail,
        phone: cellStr(row[ownerPhoneIdx]),
        formatted_address:
          pFormat ??
          generateFormattedAddress({
            companyName,
            displayName: pName ?? '',
            email: pEmail,
          }),
      });
    }

    // cc 블록들
    ccBlocks.forEach((b, i) => {
      if (b.email === -1) return;
      const cEmail = cleanEmail(row[b.email]);
      if (!cEmail) return;
      const cName = b.name !== -1 ? cellStr(row[b.name]) : null;
      const cFormat = b.format !== -1 ? cellStr(row[b.format]) : null;
      out.push({
        company_name: companyName,
        sub_company_name: subName,
        role: 'cc',
        sort_order: i + 1,
        display_name: cName,
        email: cEmail,
        phone: null,
        formatted_address:
          cFormat ??
          generateFormattedAddress({
            companyName,
            displayName: cName ?? '',
            email: cEmail,
          }),
      });
    });
  }

  return out;
}
