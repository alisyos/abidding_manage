import { z } from 'zod';

const optString = z.string().trim().optional().nullable().or(z.literal(''));

export const adjustmentMediaSchema = z.object({
  media: z.enum(['K', 'S', 'M']),
  delta_unique: z.number().int().default(0),
  delta_premium: z.number().int().default(0),
  delta_basic: z.number().int().default(0),
  delta_lite: z.number().int().default(0),
  /** 관리자 최종 정산액 (천원내림 기본값 + 수정 가능) */
  pre_adjust_amount: z.number().default(0),
});

export const adjustmentInputSchema = z
  .object({
    quote_id: z.string().uuid('견적을 선택해주세요'),
    adjustment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '조정일(YYYY-MM-DD)'),
    media_deltas: z.array(adjustmentMediaSchema).min(1, '변동 매체가 없습니다'),
    reason: optString,
  })
  .refine(
    (d) =>
      d.media_deltas.some(
        (m) => m.delta_unique || m.delta_premium || m.delta_basic || m.delta_lite,
      ),
    { message: '변동 수량을 1개 이상 입력하세요', path: ['media_deltas'] },
  );

export type AdjustmentMediaInput = z.infer<typeof adjustmentMediaSchema>;
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
