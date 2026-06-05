import { z } from 'zod';

// ───────────────────────────────────────────────────────────────
// 일괄 견적 생성 (/quotes/bulk-create)
// ───────────────────────────────────────────────────────────────
export const bulkCreateQuotesInputSchema = z
  .object({
    source_month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, '기준월(YYYY-MM) 형식이 아닙니다'),
    source_quote_ids: z
      .array(z.string().uuid())
      .min(1, '복제할 견적을 1건 이상 선택하세요')
      .max(200, '한 번에 최대 200건까지 일괄 생성 가능합니다'),
    target_service_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '시작일(YYYY-MM-DD)'),
    target_service_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '종료일(YYYY-MM-DD)'),
  })
  .refine((d) => d.target_service_end >= d.target_service_start, {
    message: '종료일은 시작일 이후여야 합니다',
    path: ['target_service_end'],
  });

export type BulkCreateQuotesInput = z.infer<typeof bulkCreateQuotesInputSchema>;

export interface BulkCreateQuotesResult {
  created: { quote_no: string; company_name: string; total_amount: number }[];
  skipped: { source_quote_no: string; reason: string }[];
}

// ───────────────────────────────────────────────────────────────
// 일괄 발송 (/quotes/bulk-send)
// ───────────────────────────────────────────────────────────────
export const bulkSendInputSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, '발송 대상을 1건 이상 선택하세요')
    .max(200, '한 번에 최대 200건까지 일괄 발송 가능합니다'),
});

export type BulkSendInput = z.infer<typeof bulkSendInputSchema>;

export interface BulkSendProgress {
  index: number;
  quote_no: string;
  ok: boolean;
  error?: string;
}

export interface BulkSendSummary {
  success: number;
  failed: { id: string; quote_no: string; error: string }[];
}
