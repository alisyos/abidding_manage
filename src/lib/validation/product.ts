import { z } from 'zod';

export const productPatchSchema = z.object({
  unit_price: z
    .number({ invalid_type_error: '숫자로 입력해주세요' })
    .nonnegative('0 이상이어야 합니다'),
  monitoring_period: z.string().nullable().default(null),
});

export type ProductPatch = z.infer<typeof productPatchSchema>;
