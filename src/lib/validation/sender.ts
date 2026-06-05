import { z } from 'zod';

export const senderSchema = z.object({
  company_name: z.string().trim().min(1, '회사명을 입력해주세요'),
  contact_name: z.string().trim().min(1, '담당자명을 입력해주세요'),
  phone: z.string().trim().nullable().optional(),
  email: z
    .string()
    .trim()
    .email('올바른 이메일 형식이 아닙니다')
    .nullable()
    .optional()
    .or(z.literal('')),
  address: z.string().nullable().optional(),
  bank_account: z.string().nullable().optional(),
});

export type SenderInput = z.infer<typeof senderSchema>;
