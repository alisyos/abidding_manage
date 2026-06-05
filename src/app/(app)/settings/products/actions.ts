'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { productPatchSchema } from '@/lib/validation/product';

export async function updateProduct(
  id: string,
  patchRaw: { unit_price: number; monitoring_period: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = productPatchSchema.safeParse(patchRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? '입력 검증 실패' };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('products')
    .update({
      unit_price: parsed.data.unit_price,
      monitoring_period: parsed.data.monitoring_period,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/products');
  return { ok: true };
}
