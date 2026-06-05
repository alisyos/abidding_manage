'use client';

import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { MEDIA_LABEL, TIER_LABEL, type Media, type Tier } from '@/lib/supabase/types';
import { formatKRW } from '@/lib/format/currency';
import { Input } from '@/components/ui/input';
import type { PriceKey } from '@/lib/quotes/pricing';
import type { QuoteInput } from '@/lib/validation/quote';

const MEDIA_ORDER: Media[] = ['K', 'S', 'M'];
const TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];

interface ItemKey {
  media: Media;
  tier: Tier;
  unit_price: number;
}

interface Props {
  /** items 배열의 인덱스를 (media, tier) 로 식별. items 는 RHF의 useFieldArray로 12행 고정. */
  itemKeys: ItemKey[]; // length 12, MEDIA_ORDER × TIER_ORDER 순서
}

/**
 * 3×4 매트릭스 견적 품목 그리드.
 * - 부모 폼의 `items[*]` 를 useWatch 로 관찰하여 실시간 줄합계/총합 계산.
 * - 단가는 prop으로 받은 itemKeys 의 unit_price (스냅샷).
 */
export function QuoteItemsGrid({ itemKeys }: Props) {
  const form = useFormContext<QuoteInput>();
  const items = useWatch({ control: form.control, name: 'items' });
  const addonFee = useWatch({ control: form.control, name: 'addon_fee' }) ?? 0;
  const discountRate = useWatch({ control: form.control, name: 'discount_rate' }) ?? 0;

  // (media,tier) → idx 매핑
  const indexByKey = useMemo(() => {
    const m = new Map<PriceKey, number>();
    itemKeys.forEach((k, idx) => m.set(`${k.media}__${k.tier}` as PriceKey, idx));
    return m;
  }, [itemKeys]);

  function getIdx(media: Media, tier: Tier): number {
    return indexByKey.get(`${media}__${tier}` as PriceKey) ?? -1;
  }

  const lineTotals: number[] = (items ?? []).map((it, i) => {
    const qty = Number(it?.quantity ?? 0);
    const up = Number(itemKeys[i]?.unit_price ?? 0);
    return qty * up;
  });
  const itemsSum = lineTotals.reduce((a, b) => a + b, 0);
  const baseAmount = itemsSum + Number(addonFee || 0);
  const discounted = baseAmount * (1 - Number(discountRate || 0));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-600 w-[140px]">매체</th>
              {TIER_ORDER.map((tier) => (
                <th key={tier} className="px-3 py-2 text-left font-semibold text-gray-600">
                  {TIER_LABEL[tier]}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold text-gray-600 w-[140px]">
                매체 소계
              </th>
            </tr>
          </thead>
          <tbody>
            {MEDIA_ORDER.map((media) => {
              const rowTotal = TIER_ORDER.reduce((sum, tier) => {
                const idx = getIdx(media, tier);
                return idx >= 0 ? sum + (lineTotals[idx] ?? 0) : sum;
              }, 0);
              return (
                <tr key={media} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-900 bg-gray-50/40">
                    {MEDIA_LABEL[media]}
                  </td>
                  {TIER_ORDER.map((tier) => {
                    const idx = getIdx(media, tier);
                    const unitPrice = itemKeys[idx]?.unit_price ?? 0;
                    const lineTotal = lineTotals[idx] ?? 0;
                    return (
                      <td key={tier} className="px-2 py-1.5 align-top">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          {...form.register(`items.${idx}.quantity`, {
                            setValueAs: (v) => (v === '' || v === null ? 0 : Number(v)),
                          })}
                          className="h-8 w-full text-right tabular-nums"
                        />
                        <div className="mt-0.5 text-[10px] text-gray-400 text-right tabular-nums">
                          단가 {formatKRW(unitPrice)} · 합 {formatKRW(lineTotal)}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                    {formatKRW(rowTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 합계 요약 */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <SummaryCell label="품목 합계" value={itemsSum} />
        <SummaryCell label="부가서비스" value={Number(addonFee || 0)} />
        <SummaryCell label="기본가 (할인전)" value={baseAmount} />
        <SummaryCell label="할인 적용 후" value={discounted} muted />
      </div>
    </div>
  );
}

function SummaryCell({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`font-semibold tabular-nums ${muted ? 'text-gray-600' : 'text-gray-900'}`}>
        {formatKRW(value)}
      </div>
    </div>
  );
}
