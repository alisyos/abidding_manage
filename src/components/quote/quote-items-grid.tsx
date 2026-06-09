'use client';

import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { MEDIA_LABEL, TIER_LABEL, type Media, type Tier } from '@/lib/supabase/types';
import { formatKRW } from '@/lib/format/currency';
import { Input } from '@/components/ui/input';
import { DISCOUNT_THRESHOLD } from '@/lib/quotes/calculator';
import type { PriceKey } from '@/lib/quotes/pricing';
import type { QuoteInput } from '@/lib/validation/quote';

const MEDIA_ORDER: Media[] = ['K', 'S', 'M'];
const TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];

interface ItemKey {
  media: Media;
  tier: Tier;
  unit_price: number;   // 할인가
  list_price: number;   // 공시가
}

interface Props {
  /** items 배열의 인덱스를 (media, tier) 로 식별. items 는 RHF의 useFieldArray로 12행 고정. */
  itemKeys: ItemKey[]; // length 12, MEDIA_ORDER × TIER_ORDER 순서
}

/**
 * 3×4 매트릭스 견적 품목 그리드.
 * - 부모 폼의 `items[*]` 를 useWatch 로 관찰하여 실시간 줄합계/총합 계산.
 * - 신규 정책: 할인가 기준 합계 ≥ 100,000원 → 할인가 적용
 */
export function QuoteItemsGrid({ itemKeys }: Props) {
  const form = useFormContext<QuoteInput>();
  const items = useWatch({ control: form.control, name: 'items' });
  const addonFee = useWatch({ control: form.control, name: 'addon_fee' }) ?? 0;
  const forceDiscount = useWatch({ control: form.control, name: 'force_discount' }) ?? false;

  // (media,tier) → idx 매핑
  const indexByKey = useMemo(() => {
    const m = new Map<PriceKey, number>();
    itemKeys.forEach((k, idx) => m.set(`${k.media}__${k.tier}` as PriceKey, idx));
    return m;
  }, [itemKeys]);

  function getIdx(media: Media, tier: Tier): number {
    return indexByKey.get(`${media}__${tier}` as PriceKey) ?? -1;
  }

  // 공시가 합계(참고) + 할인가 합계(임계값 판정용)
  const listSum = (items ?? []).reduce((sum, it, i) => {
    const qty = Number(it?.quantity ?? 0);
    const lp = Number(itemKeys[i]?.list_price ?? 0);
    return sum + qty * lp;
  }, 0);
  const discountSum = (items ?? []).reduce((sum, it, i) => {
    const qty = Number(it?.quantity ?? 0);
    const up = Number(itemKeys[i]?.unit_price ?? 0);
    return sum + qty * up;
  }, 0);
  const discountApplied = Boolean(forceDiscount) || discountSum >= DISCOUNT_THRESHOLD;
  const forcedException = Boolean(forceDiscount) && discountSum < DISCOUNT_THRESHOLD;

  // 줄합계 (적용 단가 기준)
  const lineTotals: number[] = (items ?? []).map((it, i) => {
    const qty = Number(it?.quantity ?? 0);
    const up = discountApplied
      ? Number(itemKeys[i]?.unit_price ?? 0)
      : Number(itemKeys[i]?.list_price ?? 0);
    return qty * up;
  });
  const itemsSum = lineTotals.reduce((a, b) => a + b, 0);
  const baseAmount = itemsSum + Number(addonFee || 0);
  const savings = discountApplied ? listSum - itemsSum : 0;

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
                    const listPrice = itemKeys[idx]?.list_price ?? 0;
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
                          공시 {formatKRW(listPrice)} / 할인 {formatKRW(unitPrice)}
                          <br />합 {formatKRW(lineTotal)}
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

      {/* 할인 적용 여부 안내 */}
      <div
        className={`rounded-md px-3 py-2 text-xs ${
          discountApplied && !forcedException
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-amber-50 text-amber-800 border border-amber-200'
        }`}
      >
        {forcedException ? (
          <>
            ⚠️ 할인가 강제 적용 (예외) — 할인가 합계 {formatKRW(discountSum)} 가 임계값{' '}
            {formatKRW(DISCOUNT_THRESHOLD)} 미만이나 강제 적용 설정으로 할인가 적용 (절약{' '}
            {formatKRW(savings)})
          </>
        ) : discountApplied ? (
          <>
            ✅ 할인가 적용 — 할인가 합계 {formatKRW(discountSum)} ≥ {formatKRW(DISCOUNT_THRESHOLD)}{' '}
            (절약 {formatKRW(savings)})
          </>
        ) : (
          <>
            ℹ️ 공시가 적용 — 할인가 합계 {formatKRW(discountSum)} 가 임계값{' '}
            {formatKRW(DISCOUNT_THRESHOLD)} 미만. 수량을 늘리면 할인가로 자동 전환됩니다.
          </>
        )}
      </div>

      {/* 합계 요약 */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <SummaryCell label="공시가 합계" value={listSum} />
        <SummaryCell label="할인가 합계 (판정 기준)" value={discountSum} />
        <SummaryCell label="품목 적용 합계" value={itemsSum} />
        <SummaryCell label="부가서비스" value={Number(addonFee || 0)} />
        <SummaryCell label="기본가 (소계)" value={baseAmount} />
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
