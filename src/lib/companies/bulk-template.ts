/**
 * 거래처 대량 관리(다운로드/업로드)용 단일 평면 시트 양식 정의.
 * export 빌더와 import 파서가 이 정의를 공유한다 — 헤더/순서의 단일 소스 오브 트루스.
 *
 * 행 구조: 연락처당 1행. 거래처/세부거래처 정보는 반복 표기.
 * 좌측 3개 ID 컬럼은 숨김(hidden) — ID 유무로 신규/수정을 판별한다.
 */

export const COMPANIES_SHEET_NAME = '거래처';

export interface BulkColumn {
  /** 엑셀 헤더 라벨 */
  header: string;
  /** 평면 행 객체의 키 */
  key: string;
  /** 컬럼 너비(wch) */
  width: number;
  /** 숨김 컬럼 여부 (시스템 ID) */
  hidden?: boolean;
}

export const BULK_COLUMNS: BulkColumn[] = [
  { header: '거래처ID', key: 'company_id', width: 16, hidden: true },
  { header: '세부거래처ID', key: 'sub_company_id', width: 16, hidden: true },
  { header: '연락처ID', key: 'contact_id', width: 16, hidden: true },
  { header: '거래처명', key: 'company_name', width: 22 },
  { header: 'No', key: 'no', width: 8 },
  { header: '계정유형', key: 'account_type', width: 10 },
  { header: 'userDatabase', key: 'user_database', width: 16 },
  { header: 'userAgencyId', key: 'user_agency_id', width: 16 },
  { header: 'URL', key: 'url', width: 22 },
  { header: '거래처메모', key: 'company_memo', width: 20 },
  { header: '활성', key: 'is_active', width: 6 },
  { header: '세부거래처명', key: 'sub_company_name', width: 20 },
  { header: 'database', key: 'database_code', width: 14 },
  { header: 'agencyId', key: 'agency_id', width: 14 },
  { header: '세부메모', key: 'sub_memo', width: 18 },
  { header: '역할', key: 'role', width: 10 },
  { header: '담당자명', key: 'display_name', width: 14 },
  { header: '이메일', key: 'email', width: 26 },
  { header: '연락처(전화)', key: 'phone', width: 16 },
  { header: '표시양식', key: 'formatted_address', width: 30 },
];

/** 헤더 행(라벨 배열). */
export const BULK_HEADER_ROW: string[] = BULK_COLUMNS.map((c) => c.header);

/** 파서가 헤더 행을 찾을 때 쓰는 필수 키워드. */
export const BULK_REQUIRED_HEADERS = ['거래처명', '세부거래처명', '이메일'];

/** 한 행을 표현하는 평면 객체 타입(모든 셀은 문자열 또는 빈 값). */
export interface FlatRow {
  company_id: string | null;
  sub_company_id: string | null;
  contact_id: string | null;
  company_name: string | null;
  no: number | null;
  account_type: string | null;
  user_database: string | null;
  user_agency_id: string | null;
  url: string | null;
  company_memo: string | null;
  is_active: string | null;
  sub_company_name: string | null;
  database_code: string | null;
  agency_id: string | null;
  sub_memo: string | null;
  role: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  formatted_address: string | null;
}
