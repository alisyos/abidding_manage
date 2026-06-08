'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatKRW } from '@/lib/format/currency';
import { todayKstISO } from '@/lib/format/date';
import { calcProRatedDelta, floorToThousand } from '@/lib/quotes/dayCount';
import { MEDIA_LABEL, TIER_LABEL, type Media, type Tier } from '@/lib/supabase/types';
import { createAdjustment, updateAdjustment } from '../../actions';

const MEDIA_ORDER: Media[] = ['K', 'S', 'M'];
const TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];

export interface QuoteOption {
  id: string;
  quote_no: string | null;
  company_name: string;
  sub_company_name: string | null;
  service_start: string;
  service_end: string;
  items: { media: Media; tier: Tier; quantity: number; unit_price: number }[];
  /** 조정 반영 후 현재 사용량 (원본 + Σ 기존 조정 delta). 없으면 items 사용. */
  currentQty?: Record<string, number>;
}

export interface PriceRow {
  media: Media;
  tier: Tier;
  unit_price: number;
}

export interface EditContext {
  quoteId: string;
  quoteLabel: string;
  adjustmentDate: string;
  reason: string;
  /** 이 이벤트를 제외한 현재 사용량 (원본 + 다른 조정 delta) */
  baseline: Record<string, number>;
  /** 초기 목표 수량 = baseline + 이 이벤트 delta */
  initialTargets: Record<string, number>;
  /** 매체별 저장된 정산액 */
  initialAmounts: Record<string, number>;
  /** 교체 대상 행 id (이벤트 형제 행) */
  replaceIds: string[];
}

interface Props {
  mode?: 'create' | 'edit';
  quotes: QuoteOption[];
  prices: PriceRow[];
  defaultQuoteId?: string;
  editContext?: EditContext;
}

const slotKey = (m: Media, t: Tier) => `${m}__${t}`;

export function AdjustmentForm({ mode = 'create', quotes, prices, defaultQuoteId, editContext }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEdit = mode === 'edit';
  const [saving, setSaving] = useState(false);

  const [quoteId, setQuoteId] = useState(
    editContext?.quoteId ?? defaultQuoteId ?? searchParams.get('quoteId') ?? '',
  );
  const [adjustmentDate, setAdjustmentDate] = useState(
    editContext?.adjustmentDate ?? todayKstISO(),
  );
  const [reason, setReason] = useState(editContext?.reason ?? '');
  // 조정 후 목표 수량 (12칸)
  const [targets, setTargets] = useState<Record<string, number>>(
    editContext?.initialTargets ?? {},
  );

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    prices.forEach((p) => m.set(slotKey(p.media, p.tier), p.unit_price));
    return m;
  }, [prices]);

  const selectedQuote = quotes.find((q) => q.id === quoteId);

  // 현재 수량(baseline) 맵 — edit: 이벤트 제외 현재, create: 견적의 조정 반영 후 현재
  const currentQty = useMemo(() => {
    const m = new Map<string, number>();
    if (isEdit && editContext) {
      for (const [k, v] of Object.entries(editContext.baseline)) m.set(k, v);
    } else if (selectedQuote) {
      const eff = selectedQuote.currentQty;
      if (eff) {
        for (const [k, v] of Object.entries(eff)) m.set(k, v);
      } else {
        selectedQuote.items.forEach((i) => m.set(slotKey(i.media, i.tier), i.quantity));
      }
    }
    return m;
  }, [selectedQuote, isEdit, editContext]);

  // 견적 선택 시 목표 수량을 현재 수량으로 초기화 (create 전용; edit은 initialTargets 유지)
  useEffect(() => {
    if (isEdit) return;
    if (!selectedQuote) {
      setTargets({});
      return;
    }
    const next: Record<string, number> = {};
    for (const m of MEDIA_ORDER) {
      for (const t of TIER_ORDER) {
        next[slotKey(m, t)] = currentQty.get(slotKey(m, t)) ?? 0;
      }
    }
    setTargets(next);
  }, [quoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = (m: Media, t: Tier) => currentQty.get(slotKey(m, t)) ?? 0;
  const tgt = (m: Media, t: Tier) => Number(targets[slotKey(m, t)] ?? cur(m, t));
  const delta = (m: Media, t: Tier) => tgt(m, t) - cur(m, t);

  // 매체별 일할 계산 미리보기
  const preview = useMemo(() => {
    if (!selectedQuote || !adjustmentDate) return null;
    const perMedia = MEDIA_ORDER.map((m) => {
      const deltas = {
        unique: delta(m, 'unique'),
        premium: delta(m, 'premium'),
        basic: delta(m, 'basic'),
        lite: delta(m, 'lite'),
      };
      const hasChange = TIER_ORDER.some((t) => deltas[t] !== 0);
      const res = calcProRatedDelta({
        deltas,
        unitPrices: {
          unique: priceMap.get(slotKey(m, 'unique')) ?? 0,
          premium: priceMap.get(slotKey(m, 'premium')) ?? 0,
          basic: priceMap.get(slotKey(m, 'basic')) ?? 0,
          lite: priceMap.get(slotKey(m, 'lite')) ?? 0,
        },
        serviceStart: selectedQuote.service_start,
        serviceEnd: selectedQuote.service_end,
        adjustmentDate,
      });
      return { media: m, deltas, hasChange, res };
    });
    const total = perMedia.reduce((s, p) => s + p.res.preAdjustAmount, 0);
    const meta = perMedia[0]?.res;
    return { perMedia, total, totalDays: meta?.totalDays ?? 0, remainingDays: meta?.remainingDays ?? 0, ratio: meta?.ratio ?? 0 };
  }, [selectedQuote, adjustmentDate, targets, priceMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasAnyChange = preview?.perMedia.some((p) => p.hasChange) ?? false;

  // 매체별 최종 정산액 (기본값 = 천원내림, 관리자 수정 가능). 수량/견적/조정일 변경 시 기본값으로 재설정.
  // edit 진입 시에는 저장된 금액을 유지(최초 렌더 skip).
  const [amounts, setAmounts] = useState<Record<string, number>>(
    editContext?.initialAmounts ?? {},
  );
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (isEdit) return; // 저장된 금액 유지
    }
    const next: Record<string, number> = {};
    if (preview) {
      for (const p of preview.perMedia) {
        if (p.hasChange) next[p.media] = floorToThousand(p.res.preAdjustAmount);
      }
    }
    setAmounts(next);
  }, [preview]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalAmount = MEDIA_ORDER.reduce((s, m) => s + (amounts[m] ?? 0), 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedQuote) {
      toast.error('견적을 선택하세요');
      return;
    }
    const media_deltas = MEDIA_ORDER.map((m) => ({
      media: m,
      delta_unique: delta(m, 'unique'),
      delta_premium: delta(m, 'premium'),
      delta_basic: delta(m, 'basic'),
      delta_lite: delta(m, 'lite'),
      pre_adjust_amount: amounts[m] ?? 0,
    })).filter((md) => md.delta_unique || md.delta_premium || md.delta_basic || md.delta_lite);

    if (media_deltas.length === 0) {
      toast.error('변동 수량을 1개 이상 입력하세요');
      return;
    }

    setSaving(true);
    try {
      const input = { quote_id: quoteId, adjustment_date: adjustmentDate, media_deltas, reason };
      const res =
        isEdit && editContext
          ? await updateAdjustment(editContext.replaceIds, input)
          : await createAdjustment(input);
      if (res.ok && res.data) {
        if (isEdit) {
          toast.success('조정 수정 완료');
          router.push('/adjustments');
        } else {
          toast.success('조정 등록 완료. 메일 발송 화면으로 이동합니다.');
          router.push(`/adjustments/${res.data.id}/send`);
        }
        router.refresh();
      } else {
        toast.error(`저장 실패: ${res.error}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* 견적 선택 + 기본 정보 */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">대상 견적 선택</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">견적 *</Label>
              {isEdit && editContext ? (
                <div className="h-10 flex items-center px-3 rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-700">
                  {editContext.quoteLabel}
                </div>
              ) : (
              <Select value={quoteId || ''} onValueChange={setQuoteId}>
                <SelectTrigger>
                  <SelectValue placeholder="견적 선택" />
                </SelectTrigger>
                <SelectContent>
                  {quotes.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      <span className="font-mono mr-2">{q.quote_no}</span>
                      {q.company_name}
                      {q.sub_company_name ? ` / ${q.sub_company_name}` : ''} · {q.service_start}~
                      {q.service_end}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              )}
            </div>
            <div>
              <Label className="text-xs">조정일자 *</Label>
              <Input
                type="date"
                value={adjustmentDate}
                onChange={(e) => setAdjustmentDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 변동 입력 — 매체×등급 그리드 (현재 수량 + 조정 후 목표 수량) */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">변동 내역 (조정 후 수량 입력)</h2>
            <span className="text-[10px] text-gray-400">
              각 칸에 조정 후 목표 수량을 입력하세요. 변동량(Δ)은 자동 계산됩니다.
            </span>
          </div>

          {!selectedQuote ? (
            <p className="text-xs text-gray-400">먼저 견적을 선택하세요.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="px-2 py-1 text-left font-medium">매체</th>
                    {TIER_ORDER.map((t) => (
                      <th key={t} className="px-2 py-1 text-center font-medium">
                        {TIER_LABEL[t]}
                        <div className="text-[10px] text-gray-400 font-normal">
                          단가 {formatKRW(priceMap.get(slotKey('K', t)) ?? 0)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MEDIA_ORDER.map((m) => (
                    <tr key={m} className="border-t border-gray-100">
                      <td className="px-2 py-2 font-semibold text-gray-700 whitespace-nowrap">
                        {MEDIA_LABEL[m]}
                      </td>
                      {TIER_ORDER.map((t) => {
                        const d = delta(m, t);
                        return (
                          <td key={t} className="px-2 py-2 align-top">
                            <Input
                              type="number"
                              step={10}
                              min={0}
                              className="h-8 w-24"
                              value={targets[slotKey(m, t)] ?? 0}
                              onChange={(e) =>
                                setTargets((prev) => ({
                                  ...prev,
                                  [slotKey(m, t)]: Number(e.target.value || 0),
                                }))
                              }
                            />
                            <div className="mt-0.5 text-[10px] text-gray-400">
                              현재 {cur(m, t)}
                              {d !== 0 && (
                                <span className={d < 0 ? 'text-red-600 ml-1' : 'text-blue-600 ml-1'}>
                                  Δ{d > 0 ? `+${d}` : d}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <Label className="text-xs">사유</Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 광고주 요청으로 6/15부터 수량 감소"
            />
          </div>
        </CardContent>
      </Card>

      {/* 일할 계산 미리보기 */}
      {preview && selectedQuote && hasAnyChange && (
        <Card className="bg-blue-50/40 border-blue-200">
          <CardContent className="p-6 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">일할 계산 결과</h3>
            <p className="text-xs text-gray-600">
              서비스 기간: {selectedQuote.service_start} ~ {selectedQuote.service_end} (총{' '}
              {preview.totalDays}일)
              <br />
              조정일자 {adjustmentDate} 기준 잔여 {preview.remainingDays}일 (
              {(preview.ratio * 100).toFixed(1)}%)
            </p>
            <p className="text-[11px] text-gray-500">
              정산액 기본값은 천원 단위 내림(고객사 유리)이며, 매체별 최종 금액은 직접 수정할 수 있습니다.
            </p>

            <div className="space-y-3">
              {preview.perMedia
                .filter((p) => p.hasChange)
                .map((p) => (
                  <div key={p.media} className="rounded-md border border-blue-200 bg-white/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-gray-800">
                        {MEDIA_LABEL[p.media]}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500">
                          계산 {formatKRW(floorToThousand(p.res.preAdjustAmount))}
                        </span>
                        <Label className="text-[11px] text-gray-600">최종 정산액</Label>
                        <Input
                          type="number"
                          step={1000}
                          className="h-8 w-32 text-right"
                          value={amounts[p.media] ?? 0}
                          onChange={(e) =>
                            setAmounts((prev) => ({
                              ...prev,
                              [p.media]: Number(e.target.value || 0),
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      {TIER_ORDER.filter((t) => p.deltas[t] !== 0)
                        .map(
                          (t) =>
                            `${TIER_LABEL[t]} ${p.deltas[t] > 0 ? '+' : ''}${p.deltas[t]} (${formatKRW(
                              p.res.lineDeltas[t],
                            )})`,
                        )
                        .join('  ·  ')}
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-blue-200">
              <span className="text-xs text-gray-600">총 정산액 (당월 매출 반영):</span>
              <span
                className={`text-xl font-bold tabular-nums ${
                  totalAmount < 0 ? 'text-red-600' : 'text-gray-900'
                }`}
              >
                {formatKRW(totalAmount)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" asChild>
          <Link href="/adjustments">취소</Link>
        </Button>
        <Button type="submit" disabled={saving || !selectedQuote || !hasAnyChange}>
          {saving ? '저장중...' : '등록 후 메일 발송 화면으로'}
        </Button>
      </div>
    </form>
  );
}
