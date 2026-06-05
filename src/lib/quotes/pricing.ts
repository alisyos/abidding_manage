import type { SupabaseClient } from '@supabase/supabase-js';
import type { Media, Tier, Product } from '@/lib/supabase/types';

export type PriceKey = `${Media}__${Tier}`;

export function priceKey(media: Media, tier: Tier): PriceKey {
  return `${media}__${tier}` as PriceKey;
}

/**
 * 활성 단가 12종을 Map으로 반환. 견적 폼 초기화 / 서버 저장 시 단가 스냅샷용.
 */
export async function fetchActivePriceMap(
  supabase: SupabaseClient,
): Promise<Map<PriceKey, Product>> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true);

  if (error) throw new Error(`단가표 로드 실패: ${error.message}`);

  const map = new Map<PriceKey, Product>();
  for (const row of (data ?? []) as Product[]) {
    map.set(priceKey(row.media, row.tier), row);
  }
  return map;
}
