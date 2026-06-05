import { z } from 'zod';

const optString = z.string().trim().optional().nullable().or(z.literal(''));

export const adjustmentInputSchema = z.object({
  quote_id: z.string().uuid('견적을 선택해주세요'),
  adjustment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '조정일(YYYY-MM-DD)'),
  media: z.enum(['K', 'S', 'M']),
  delta_unique: z.number().int().default(0),
  delta_premium: z.number().int().default(0),
  delta_basic: z.number().int().default(0),
  delta_lite: z.number().int().default(0),
  reason: optString,
});

export type AdjustmentInput = z.infer<typeof adjustmentInputSchema>;

export const sendAdjustmentEmailSchema = z.object({
  to: z.array(z.string().email()).min(1, '수신자를 1명 이상 지정하세요'),
  cc: z.array(z.string().email()).default([]),
  subject: z.string().trim().min(1),
  body_html: z.string().min(1),
  body_text: z.string().nullable().optional(),
  isTestSend: z.boolean().default(false),
});

export type SendAdjustmentEmailInput = z.infer<typeof sendAdjustmentEmailSchema>;
