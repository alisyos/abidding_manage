import * as XLSX from 'xlsx';
import {
  CELL_KEYS,
  MEDIA_ORDER,
  TIER_ORDER,
  type PivotResult,
} from './pivot';
import { MEDIA_LABEL, TIER_LABEL } from '@/lib/supabase/types';

/**
 * 월매출 피벗을 xlsx Buffer 로 빌드.
 *
 * 시트 구조 (엑셀 월매출 시트와 동일 모양):
 *  R1: 거래처 / 세부거래처 / 견적번호 / 상태 / [매체 그룹: K, S, M] (각 4셀 merge) / 기본가액 / 추가할인 / 변동조정 / 공급가액 / 부가세 / 입금일
 *  R2: (앞 4컬럼 비움) / 유니크/프리미엄/베이직/라이트 × 3매체 / (뒤 6컬럼 비움)
 *  R3~: 데이터
 *  마지막: 합계 행
 */
export function buildSalesWorkbook(pivot: PivotResult, month: string): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  const header1: (string | number)[] = ['거래처', '세부거래처', '견적번호', '상태'];
  for (const media of MEDIA_ORDER) {
    header1.push(MEDIA_LABEL[media]);
    header1.push('', '', '');
  }
  header1.push('기본가액', '추가할인', '변동조정', '공급가액', '부가세', '입금일');

  const header2: string[] = ['', '', '', ''];
  for (let i = 0; i < MEDIA_ORDER.length; i++) {
    for (const tier of TIER_ORDER) header2.push(TIER_LABEL[tier]);
  }
  header2.push('', '', '', '', '', '');

  const aoa: (string | number | null)[][] = [header1, header2];

  for (const row of pivot.rows) {
    const r: (string | number | null)[] = [
      row.company_name,
      row.sub_company_name ?? '',
      row.quote_no ?? '',
      row.quote_status,
    ];
    for (const key of CELL_KEYS) {
      r.push(row.cells[key] || 0);
    }
    r.push(
      row.base_amount,
      row.extra_discount ? -row.extra_discount : 0,
      row.variable_adjust,
      row.total_amount - row.vat_amount, // 공급가액 (부가세 별도)
      row.vat_amount,
      row.payment_date ?? '',
    );
    aoa.push(r);
  }

  // 합계 행
  const totalRow: (string | number | null)[] = ['합계', '', '', ''];
  for (const key of CELL_KEYS) totalRow.push(pivot.totals.cells[key] || 0);
  totalRow.push(
    pivot.totals.base_amount,
    pivot.totals.extra_discount ? -pivot.totals.extra_discount : 0,
    pivot.totals.variable_adjust,
    pivot.totals.total_amount - pivot.totals.vat_amount, // 공급가액
    pivot.totals.vat_amount,
    '',
  );
  aoa.push(totalRow);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 매체 헤더 셀 병합 (R1의 5~8, 9~12, 13~16 컬럼 — 0-indexed 4~7, 8~11, 12~15)
  ws['!merges'] = [
    { s: { r: 0, c: 4 }, e: { r: 0, c: 7 } },   // K
    { s: { r: 0, c: 8 }, e: { r: 0, c: 11 } },  // S
    { s: { r: 0, c: 12 }, e: { r: 0, c: 15 } }, // M
  ];

  // 컬럼 너비
  ws['!cols'] = [
    { wch: 20 }, // 거래처
    { wch: 20 }, // 세부거래처
    { wch: 16 }, // 견적번호
    { wch: 10 }, // 상태
    ...new Array(12).fill({ wch: 8 }), // 12 매체×등급
    { wch: 14 }, // 기본가액
    { wch: 14 }, // 추가할인
    { wch: 14 }, // 변동조정
    { wch: 14 }, // 공급가액
    { wch: 12 }, // 부가세
    { wch: 12 }, // 입금일
  ];

  XLSX.utils.book_append_sheet(wb, ws, `월매출_${month}`);

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}
