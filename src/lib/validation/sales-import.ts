import { z } from 'zod';

const optString = z.string().trim().optional().nullable().or(z.literal(''));
const optDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식')
  .optional()
  .nullable()
  .or(z.literal(''));

export const salesImportRowSchema = z.object({
  quote_no: z.string().trim().min(1, '견적번호 누락'),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '입금일자(YYYY-MM-DD)'),
  tax_invoice_no: optString,
  tax_invoice_issued_at: optDate,
});

export type SalesImportRow = z.infer<typeof salesImportRowSchema>;

export interface SalesImportPreviewItem {
  rowIndex: number;
  raw: SalesImportRow;
  match:
    | {
        ok: true;
        quote_id: string;
        company_name: string;
        total_amount: number;
        already_paid: boolean;
      }
    | { ok: false; reason: string };
}

export interface SalesImportDryResult {
  total: number;
  valid: number;
  errors: { rowIndex: number; message: string; raw: unknown }[];
  preview: SalesImportPreviewItem[];
}

export interface SalesImportApplyResult {
  applied: number;
  alreadyPaid: number;
  notFound: { quote_no: string; rowIndex: number }[];
  failed: { quote_no: string; rowIndex: number; error: string }[];
}
