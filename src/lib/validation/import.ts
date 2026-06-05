import { z } from 'zod';

// 엑셀 임포트 - 각 시트별 정규화 row 스키마

export const masterRowSchema = z.object({
  no: z.number().int().nullable().optional(),
  name: z.string().trim().min(1, '업체명 누락'),
  user_database: z.string().nullable().optional(),
  user_agency_id: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
});

export const subCompanyRowSchema = z.object({
  company_name: z.string().trim().min(1),
  name: z.string().trim().min(1),
  database_code: z.string().nullable().optional(),
  agency_id: z.string().nullable().optional(),
});

export const usageRowSchema = z.object({
  company_name: z.string().trim().min(1),
  sub_company_name: z.string().trim().min(1),
  media: z.enum(['K', 'S', 'M']),
  tier: z.enum(['unique', 'premium', 'basic', 'lite']),
  quantity: z.number().int().nonnegative(),
  usage_start: z.string().nullable().optional(), // YYYY-MM-DD
  usage_end: z.string().nullable().optional(),
});

export const contactRowSchema = z.object({
  company_name: z.string().trim().min(1),
  sub_company_name: z.string().trim().min(1),
  role: z.enum(['primary', 'cc']),
  display_name: z.string().nullable().optional(),
  email: z.string().email('이메일 형식 오류'),
  phone: z.string().nullable().optional(),
  formatted_address: z.string().nullable().optional(),
  sort_order: z.number().int().nonnegative().default(0),
});

export const draftRowSchema = z.object({
  name: z.string().trim().min(1),
  account_type: z.enum(['advertiser', 'agency']).nullable(),
});

export type MasterRow = z.infer<typeof masterRowSchema>;
export type SubCompanyRow = z.infer<typeof subCompanyRowSchema>;
export type UsageRow = z.infer<typeof usageRowSchema>;
export type ContactRow = z.infer<typeof contactRowSchema>;
export type DraftRow = z.infer<typeof draftRowSchema>;

// dry-run 미리보기 응답 타입
export interface ImportSectionResult<T> {
  total: number;
  valid: number;
  errors: { rowIndex: number; message: string; raw: unknown }[];
  preview: T[]; // 검증 통과한 행 (최대 N개로 잘라서 응답)
}

export interface ImportDryResult {
  master: ImportSectionResult<MasterRow>;
  subCompanies: ImportSectionResult<SubCompanyRow>;
  usage: ImportSectionResult<UsageRow>;
  contacts: ImportSectionResult<ContactRow>;
  draft: ImportSectionResult<DraftRow>;
}

export interface ImportApplyResult {
  companies: { upserted: number };
  sub_companies: { upserted: number };
  contacts: { inserted: number };
  usage: { inserted: number };
  warnings: string[];
}
