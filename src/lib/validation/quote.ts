import { z } from 'zod';

const optString = z.string().trim().optional().nullable().or(z.literal(''));

export const quoteItemInputSchema = z.object({
  media: z.enum(['K', 'S', 'M']),
  tier: z.enum(['unique', 'premium', 'basic', 'lite']),
  quantity: z.number().int().nonnegative('0 이상이어야 합니다'),
  unit_price: z.number().nonnegative(),
  list_price: z.number().nonnegative(),
});

export const quoteInputSchema = z
  .object({
    company_id: z.string().uuid('거래처를 선택해주세요'),
    sub_company_id: z.string().uuid().nullable().optional(),
    service_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '시작일(YYYY-MM-DD) 형식'),
    service_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '종료일(YYYY-MM-DD) 형식'),
    addon_fee: z.number().nonnegative().default(0),
    variable_adjust: z.number().default(0),
    fixed_adjust: z.number().default(0),
    bank_account: optString,
    payment_method: optString,
    tax_invoice_type: z.enum(['receipt', 'claim']).nullable().optional(),
    notes: optString,
    items: z.array(quoteItemInputSchema).default([]),
  })
  .refine((d) => d.service_end >= d.service_start, {
    message: '종료일은 시작일 이후여야 합니다',
    path: ['service_end'],
  });

export type QuoteItemInput = z.infer<typeof quoteItemInputSchema>;
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export const paidPatchSchema = z.object({
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '입금일자(YYYY-MM-DD)'),
  tax_invoice_no: optString,
  tax_invoice_issued_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .or(z.literal('')),
});
export type PaidPatch = z.infer<typeof paidPatchSchema>;

export const emailTemplatePatchSchema = z.object({
  subject: z.string().trim().min(1, '제목을 입력해주세요'),
  body_html: z.string().min(1, '본문(HTML)을 입력해주세요'),
  body_text: z.string().nullable().optional(),
});
export type EmailTemplatePatch = z.infer<typeof emailTemplatePatchSchema>;

export const sendQuoteEmailSchema = z.object({
  to: z.array(z.string().email()).min(1, '수신자를 1명 이상 지정하세요'),
  cc: z.array(z.string().email()).default([]),
  subject: z.string().trim().min(1),
  body_html: z.string().min(1),
  body_text: z.string().nullable().optional(),
  isTestSend: z.boolean().default(false),
});
export type SendQuoteEmailInput = z.infer<typeof sendQuoteEmailSchema>;
