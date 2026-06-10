import { z } from 'zod';

/** 빈 문자열/누락을 null로 허용하는 선택 문자열. */
const optStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null) return null;
    const t = v.trim();
    return t.length === 0 ? null : t;
  });

/** 빈 값 허용 uuid (있으면 형식 검증). */
const optUuid = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v == null || v.trim().length === 0 ? null : v.trim()))
  .refine(
    (v) => v == null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    { message: 'ID 형식 오류(UUID 아님)' },
  );

/**
 * 평면 행 검증 스키마.
 * - 거래처명 필수
 * - 이메일은 값 있을 때만 형식 검증 (연락처 없는 행 허용)
 * - account_type/role/is_active 정규화는 파서에서 끝낸 값(enum/Y·N)을 받는다
 */
export const bulkFlatRowSchema = z
  .object({
    company_id: optUuid,
    sub_company_id: optUuid,
    contact_id: optUuid,
    company_name: z.string().trim().min(1, '거래처명 누락'),
    no: z.number().int().nullable().optional(),
    account_type: z.enum(['advertiser', 'agency']).nullable().optional(),
    user_database: optStr,
    user_agency_id: optStr,
    url: optStr,
    company_memo: optStr,
    is_active: z.boolean().nullable().optional(),
    sub_company_name: optStr,
    database_code: optStr,
    agency_id: optStr,
    sub_memo: optStr,
    role: z.enum(['primary', 'cc']).nullable().optional(),
    display_name: optStr,
    email: optStr,
    phone: optStr,
    formatted_address: optStr,
  })
  .superRefine((row, ctx) => {
    if (row.email != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `이메일 형식 오류: ${row.email}`, path: ['email'] });
    }
    // 세부거래처 없이 연락처만 있는 행은 연결 불가
    if (row.email != null && row.sub_company_name == null && row.sub_company_id == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '연락처가 있으나 세부거래처명/세부ID가 비어 있습니다',
        path: ['sub_company_name'],
      });
    }
  });

export type BulkFlatRow = z.infer<typeof bulkFlatRowSchema>;

export interface BulkRowError {
  rowIndex: number;
  message: string;
  raw: unknown;
}

/** dry-run 미리보기 결과. */
export interface BulkDryResult {
  totalRows: number;
  validRows: number;
  errors: BulkRowError[];
  preview: BulkFlatRow[];
  counts: {
    companies: { insert: number; update: number };
    subCompanies: { insert: number; update: number };
    contacts: { insert: number; update: number };
  };
}

/** 적용 결과. */
export interface BulkApplyResult {
  companies: { inserted: number; updated: number };
  sub_companies: { inserted: number; updated: number };
  contacts: { inserted: number; updated: number };
  warnings: string[];
}
