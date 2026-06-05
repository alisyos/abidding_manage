'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { formatKRW } from '@/lib/format/currency';
import { todayKstISO } from '@/lib/format/date';
import { calcProRatedDelta } from '@/lib/quotes/dayCount';
import { adjustmentInputSchema, type AdjustmentInput } from '@/lib/validation/adjustment';
import {
  MEDIA_LABEL,
  TIER_LABEL,
  type Media,
  type Tier,
} from '@/lib/supabase/types';
import { createAdjustment } from '../../actions';

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
}

export interface PriceRow {
  media: Media;
  tier: Tier;
  unit_price: number;
}

interface Props {
  quotes: QuoteOption[];
  prices: PriceRow[];
  defaultQuoteId?: string;
}

export function AdjustmentForm({ quotes, prices, defaultQuoteId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saving, setSaving] = useState(false);

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    prices.forEach((p) => m.set(`${p.media}__${p.tier}`, p.unit_price));
    return m;
  }, [prices]);

  const form = useForm<AdjustmentInput>({
    resolver: zodResolver(adjustmentInputSchema),
    defaultValues: {
      quote_id: defaultQuoteId ?? '',
      adjustment_date: todayKstISO(),
      media: 'K',
      delta_unique: 0,
      delta_premium: 0,
      delta_basic: 0,
      delta_lite: 0,
      reason: '',
    },
  });

  // URL ?quoteId= 가 있으면 form에 반영
  useEffect(() => {
    const qid = searchParams.get('quoteId');
    if (qid && !form.getValues('quote_id')) {
      form.setValue('quote_id', qid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quoteId = useWatch({ control: form.control, name: 'quote_id' });
  const media = useWatch({ control: form.control, name: 'media' });
  const adjustmentDate = useWatch({ control: form.control, name: 'adjustment_date' });
  const deltaUnique = useWatch({ control: form.control, name: 'delta_unique' });
  const deltaPremium = useWatch({ control: form.control, name: 'delta_premium' });
  const deltaBasic = useWatch({ control: form.control, name: 'delta_basic' });
  const deltaLite = useWatch({ control: form.control, name: 'delta_lite' });

  const selectedQuote = quotes.find((q) => q.id === quoteId);

  // 일할 계산 미리보기
  const preview = useMemo(() => {
    if (!selectedQuote || !adjustmentDate || !media) return null;
    const unitPrices = {
      unique: priceMap.get(`${media}__unique`) ?? 0,
      premium: priceMap.get(`${media}__premium`) ?? 0,
      basic: priceMap.get(`${media}__basic`) ?? 0,
      lite: priceMap.get(`${media}__lite`) ?? 0,
    };
    return calcProRatedDelta({
      deltas: {
        unique: Number(deltaUnique || 0),
        premium: Number(deltaPremium || 0),
        basic: Number(deltaBasic || 0),
        lite: Number(deltaLite || 0),
      },
      unitPrices,
      serviceStart: selectedQuote.service_start,
      serviceEnd: selectedQuote.service_end,
      adjustmentDate,
    });
  }, [
    selectedQuote,
    adjustmentDate,
    media,
    deltaUnique,
    deltaPremium,
    deltaBasic,
    deltaLite,
    priceMap,
  ]);

  async function onSubmit(values: AdjustmentInput) {
    setSaving(true);
    try {
      const res = await createAdjustment(values);
      if (res.ok && res.data) {
        toast.success('조정 등록 완료. 메일 발송 화면으로 이동합니다.');
        router.push(`/adjustments/${res.data.id}/send`);
        router.refresh();
      } else {
        toast.error(`저장 실패: ${res.error}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* 견적 선택 + 기본 정보 */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">대상 견적 선택</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">견적 *</Label>
              <Select
                value={quoteId || ''}
                onValueChange={(v) => form.setValue('quote_id', v, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="견적 선택" />
                </SelectTrigger>
                <SelectContent>
                  {quotes.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      <span className="font-mono mr-2">{q.quote_no}</span>
                      {q.company_name}
                      {q.sub_company_name ? ` / ${q.sub_company_name}` : ''} · {q.service_start}~{q.service_end}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.quote_id && (
                <p className="mt-1 text-xs text-red-500">
                  {form.formState.errors.quote_id.message}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">조정일자 *</Label>
              <Input type="date" {...form.register('adjustment_date')} />
            </div>
          </div>

          {/* 현재 견적 항목 readonly */}
          {selectedQuote && (
            <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] text-gray-500 mb-1">현재 견적 항목 (수량)</p>
              <div className="grid grid-cols-3 gap-3 text-xs">
                {MEDIA_ORDER.map((m) => {
                  const counts = TIER_ORDER.map((t) => {
                    const found = selectedQuote.items.find(
                      (i) => i.media === m && i.tier === t,
                    );
                    return found?.quantity ?? 0;
                  });
                  return (
                    <div key={m}>
                      <p className="font-semibold text-gray-700">{MEDIA_LABEL[m]}</p>
                      <p className="text-gray-600 mt-0.5">
                        {TIER_ORDER.map((t, i) => `${TIER_LABEL[t]}:${counts[i]}`).join(' ')}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 변동 입력 */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">변동 내역</h2>

          <div>
            <Label className="text-xs">매체 *</Label>
            <RadioGroup
              className="flex gap-4 mt-1"
              value={form.watch('media')}
              onValueChange={(v) => form.setValue('media', v as Media, { shouldDirty: true })}
            >
              {MEDIA_ORDER.map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-sm">
                  <RadioGroupItem value={m} /> {MEDIA_LABEL[m]}
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {TIER_ORDER.map((t) => {
              const fieldName =
                t === 'unique'
                  ? 'delta_unique'
                  : t === 'premium'
                  ? 'delta_premium'
                  : t === 'basic'
                  ? 'delta_basic'
                  : 'delta_lite';
              return (
                <div key={t}>
                  <Label className="text-xs">{TIER_LABEL[t]} 변동(개)</Label>
                  <Input
                    type="number"
                    step={1}
                    {...form.register(fieldName, { valueAsNumber: true })}
                  />
                  <p className="mt-0.5 text-[10px] text-gray-400">
                    단가 {formatKRW(priceMap.get(`${media}__${t}`) ?? 0)}
                  </p>
                </div>
              );
            })}
          </div>

          <div>
            <Label className="text-xs">사유</Label>
            <Textarea rows={2} {...form.register('reason')} placeholder="예: 광고주 요청으로 6/15부터 수량 감소" />
          </div>
        </CardContent>
      </Card>

      {/* 일할 계산 미리보기 */}
      {preview && selectedQuote && (
        <Card className="bg-blue-50/40 border-blue-200">
          <CardContent className="p-6 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">일할 계산 결과</h3>
            <p className="text-xs text-gray-600">
              서비스 기간: {selectedQuote.service_start} ~ {selectedQuote.service_end} (총 {preview.totalDays}일)
              <br />
              조정일자 {adjustmentDate} 기준 잔여 {preview.remainingDays}일 ({(preview.ratio * 100).toFixed(1)}%)
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>등급</TableHead>
                  <TableHead className="text-right">delta(개)</TableHead>
                  <TableHead className="text-right">단가</TableHead>
                  <TableHead className="text-right">일할 적용 금액</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TIER_ORDER.map((t) => {
                  const d =
                    t === 'unique'
                      ? Number(deltaUnique || 0)
                      : t === 'premium'
                      ? Number(deltaPremium || 0)
                      : t === 'basic'
                      ? Number(deltaBasic || 0)
                      : Number(deltaLite || 0);
                  if (d === 0) return null;
                  return (
                    <TableRow key={t}>
                      <TableCell>{TIER_LABEL[t]}</TableCell>
                      <TableCell className="text-right tabular-nums">{d > 0 ? `+${d}` : d}</TableCell>
                      <TableCell className="text-right tabular-nums text-gray-500">
                        {formatKRW(priceMap.get(`${media}__${t}`) ?? 0)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${
                          preview.lineDeltas[t] < 0 ? 'text-red-600' : ''
                        }`}
                      >
                        {formatKRW(preview.lineDeltas[t])}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-blue-200">
              <span className="text-xs text-gray-600">선조정가 (견적의 변동조정가에 가산):</span>
              <span
                className={`text-xl font-bold tabular-nums ${
                  preview.preAdjustAmount < 0 ? 'text-red-600' : 'text-gray-900'
                }`}
              >
                {formatKRW(preview.preAdjustAmount)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" asChild>
          <Link href="/adjustments">취소</Link>
        </Button>
        <Button type="submit" disabled={saving || !selectedQuote}>
          {saving ? '저장중...' : '등록 후 메일 발송 화면으로'}
        </Button>
      </div>
    </form>
  );
}
