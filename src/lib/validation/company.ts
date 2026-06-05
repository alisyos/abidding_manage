import { z } from 'zod';

const optString = z.string().trim().optional().nullable().or(z.literal(''));

export const contactInputSchema = z.object({
  id: z.string().uuid().optional(),
  role: z.enum(['primary', 'cc']),
  display_name: optString,
  email: z.string().trim().email('올바른 이메일 형식이 아닙니다'),
  phone: optString,
  formatted_address: optString,
  sort_order: z.number().int().nonnegative().default(0),
});

export const subCompanyInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, '세부거래처명을 입력해주세요'),
  database_code: optString,
  agency_id: optString,
  memo: optString,
  contacts: z.array(contactInputSchema).default([]),
});

export const companyInputSchema = z.object({
  no: z.number().int().nullable().optional(),
  name: z.string().trim().min(1, '거래처명을 입력해주세요'),
  account_type: z.enum(['advertiser', 'agency']),
  user_database: optString,
  user_agency_id: optString,
  url: optString,
  memo: optString,
  is_active: z.boolean().default(true),
  sub_companies: z.array(subCompanyInputSchema).default([]),
});

export type ContactInput = z.infer<typeof contactInputSchema>;
export type SubCompanyInput = z.infer<typeof subCompanyInputSchema>;
export type CompanyInput = z.infer<typeof companyInputSchema>;
