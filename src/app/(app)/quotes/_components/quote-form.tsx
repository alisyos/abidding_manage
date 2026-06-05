'use client';

import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';

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
import { QuoteItemsGrid } from '@/components/quote/quote-items-grid';
import { computeQuote } from '@/lib/quotes/calculator';
import { formatKRW } from '@/lib/format/currency';
import {
  MEDIA_LABEL,
  TIER_LABEL,
  type Media,
  type Tier,
} from '@/lib/supabase/types';
import { quoteInputSchema, type QuoteInput } from '@/lib/validation/quote';
import { createQuote, updateQuote } from '../actions';

const MEDIA_ORDER: Media[] = ['K', 'S', 'M'];
const TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];

export interface CompanyOption {
  id: string;
  name: string;
  sub_companies: { id: string; name: string }[];
}

export interface PriceRow {
  media: Media;
  tier: Tier;
  unit_price: number;
  list_price: number;
}

interface Props {
  mode: 'create' | 'edit';
  quoteId?: string;
  quoteNo?: string | null;
  defaultValues: QuoteInput;
  companies: CompanyOption[];
  prices: PriceRow[];
}

export function QuoteForm({ mode, quoteId, quoteNo, defaultValues, companies, prices }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // 단가맵 (media,tier → {unit_price, list_price})
  const priceMap = useMemo(() => {
    const m = new Map<string, { unit_price: number; list_price: number }>();
    prices.forEach((p) =>
      m.set(`${p.media}__${p.tier}`, { unit_price: p.unit_price, list_price: p.list_price }),
    );
    return m;
  }, [prices]);

  // 12 행 itemKeys (단가 표시용)
  const itemKeys = useMemo(() => {
    const out: { media: Media; tier: Tier; unit_price: number; list_price: number }[] = [];
    for (const media of MEDIA_ORDER) {
      for (const tier of TIER_ORDER) {
        const p = priceMap.get(`${media}__${tier}`) ?? { unit_price: 0, list_price: 0 };
        out.push({ media, tier, unit_price: p.unit_price, list_price: p.list_price });
      }
    }
    return out;
  }, [priceMap]);

  // defaultValues.items 를 12행으로 정규화 (없는 셀은 quantity=0)
  const normalizedDefaults: QuoteInput = useMemo(() => {
    const itemByKey = new Map<string, { quantity: number }>();
    defaultValues.items.forEach((i) => itemByKey.set(`${i.media}__${i.tier}`, { quantity: i.quantity }));
    const items12 = itemKeys.map((k) => ({
      media: k.media,
      tier: k.tier,
      quantity: itemByKey.get(`${k.media}__${k.tier}`)?.quantity ?? 0,
      unit_price: k.unit_price,
      list_price: k.list_price,
    }));
    return { ...defaultValues, items: items12 };
  }, [defaultValues, itemKeys]);

  const form = useForm<QuoteInput>({
    resolver: zodResolver(quoteInputSchema),
    defaultValues: normalizedDefaults,
  });

  // 거래처가 바뀌면 sub_company 클리어 (할인율은 더 이상 거래처별 아님)
  const companyId = useWatch({ control: form.control, name: 'company_id' });
  const selectedCompany = companies.find((c) => c.id === companyId);

  useEffect(() => {
    if (!selectedCompany) return;
    const curSub = form.getValues('sub_company_id');
    if (curSub && !selectedCompany.sub_companies.find((s) => s.id === curSub)) {
      form.setValue('sub_company_id', null);
    }
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 합계 미리보기 — 임계값 기반 할인 자동
  const items = useWatch({ control: form.control, name: 'items' });
  const addonFee = useWatch({ control: form.control, name: 'addon_fee' }) ?? 0;
  const fixedAdjust = useWatch({ control: form.control, name: 'fixed_adjust' }) ?? 0;
  const variableAdjust = useWatch({ control: form.control, name: 'variable_adjust' }) ?? 0;

  const calc = computeQuote(
    (items ?? []).map((i) => ({
      quantity: Number(i?.quantity ?? 0),
      unit_price: Number(i?.unit_price ?? 0),
      list_price: Number(i?.list_price ?? 0),
    })),
    Number(addonFee || 0),
    Number(fixedAdjust || 0),
    Number(variableAdjust || 0),
  );

  async function onSubmit(values: QuoteInput) {
    setSaving(true);
    try {
      // 정규화: unit_price/list_price 를 priceMap 으로 재주입
      const cleaned: QuoteInput = {
        ...values,
        items: values.items.map((i) => {
          const p = priceMap.get(`${i.media}__${i.tier}`);
          return {
            ...i,
            unit_price: p?.unit_price ?? i.unit_price,
            list_price: p?.list_price ?? i.list_price,
          };
        }),
      };

      if (mode === 'create') {
        const res = await createQuote(cleaned);
        if (res.ok && res.data) {
          toast.success(`견적 등록 완료: ${res.data.quote_no}`);
          router.push(`/quotes/${res.data.id}`);
          router.refresh();
        } else {
          toast.error(`저장 실패: ${res.error}`);
        }
      } else if (quoteId) {
        const res = await updateQuote(quoteId, cleaned);
        if (res.ok) {
          toast.success('견적 수정 완료');
          router.push(`/quotes/${quoteId}`);
          router.refresh();
        } else {
          toast.error(`저장 실패: ${res.error}`);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* 기본 정보 */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">기본 정보</h2>
              {quoteNo && (
                <span className="text-xs text-gray-500">
                  견적번호:{' '}
                  <span className="font-mono font-semibold text-gray-900">{quoteNo}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">거래처 *</Label>
                <Select
                  value={form.watch('company_id') || ''}
                  onValueChange={(v) =>
                    form.setValue('company_id', v, { shouldDirty: true, shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="거래처 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.company_id && (
                  <p className="mt-1 text-xs text-red-500">
                    {form.formState.errors.company_id.message}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs">세부거래처</Label>
                <Select
                  value={form.watch('sub_company_id') ?? ''}
                  onValueChange={(v) =>
                    form.setValue('sub_company_id', v || null, { shouldDirty: true })
                  }
                  disabled={!selectedCompany}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedCompany ? '선택 (선택사항)' : '거래처 먼저 선택'} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedCompany?.sub_companies.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">서비스 시작일 *</Label>
                <Input type="date" {...form.register('service_start')} />
                {form.formState.errors.service_start && (
                  <p className="mt-1 text-xs text-red-500">
                    {form.formState.errors.service_start.message}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs">서비스 종료일 *</Label>
                <Input type="date" {...form.register('service_end')} />
                {form.formState.errors.service_end && (
                  <p className="mt-1 text-xs text-red-500">
                    {form.formState.errors.service_end.message}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 견적 항목 */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">견적 항목</h2>
            <QuoteItemsGrid itemKeys={itemKeys} />
          </CardContent>
        </Card>

        {/* 금액 조정 */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">금액 조정</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">부가서비스 (원)</Label>
                <Input
                  type="number"
                  step={100}
                  {...form.register('addon_fee', { valueAsNumber: true })}
                />
              </div>
              <div>
                <Label className="text-xs">고정 조정가 (원)</Label>
                <Input
                  type="number"
                  step={100}
                  {...form.register('fixed_adjust', { valueAsNumber: true })}
                />
              </div>
              <div>
                <Label className="text-xs">변동 조정가 (원)</Label>
                <Input
                  type="number"
                  step={100}
                  {...form.register('variable_adjust', { valueAsNumber: true })}
                />
              </div>
            </div>
            <p className="text-[11px] text-gray-500">
              ※ 할인은 견적 금액 정책에 따라 자동 결정됩니다 (공시가 합계 ≥ 100,000원 시 할인가 적용).
            </p>
          </CardContent>
        </Card>

        {/* 입금 / 메모 */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">입금 / 메모</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">입금통장</Label>
                <Input {...form.register('bank_account')} placeholder="(비우면 발신자 기본값)" />
              </div>
              <div>
                <Label className="text-xs">입금방식</Label>
                <Input {...form.register('payment_method')} placeholder="예: 선입금 진행" />
              </div>
              <div>
                <Label className="text-xs">세금계산서</Label>
                <Select
                  value={form.watch('tax_invoice_type') ?? ''}
                  onValueChange={(v) =>
                    form.setValue('tax_invoice_type', (v as 'receipt' | 'claim') || null, {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receipt">영수</SelectItem>
                    <SelectItem value="claim">청구</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">메모</Label>
              <Textarea rows={2} {...form.register('notes')} />
            </div>
          </CardContent>
        </Card>

        {/* 최종 합계 미리보기 */}
        <Card className="bg-gray-900 text-white">
          <CardContent className="p-6 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <Summary label="공시가 합계" value={calc.listSum} muted />
            <Summary
              label={calc.discountApplied ? '할인 적용 후 기본가' : '기본가 (공시가 적용)'}
              value={calc.baseAmount}
            />
            <Summary label="+ 조정" value={calc.adjusted} muted />
            <Summary label="VAT (10%)" value={calc.vatAmount} muted />
            <Summary label="견적가 (VAT 포함)" value={calc.totalAmount} emphasis />
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" asChild>
            <Link href={mode === 'edit' && quoteId ? `/quotes/${quoteId}` : '/quotes'}>취소</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? '저장중...' : mode === 'create' ? '등록' : '저장'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

function Summary({
  label,
  value,
  muted,
  emphasis,
}: {
  label: string;
  value: number;
  muted?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className={`text-[11px] ${muted ? 'text-gray-400' : 'text-gray-300'}`}>{label}</div>
      <div
        className={`tabular-nums ${emphasis ? 'text-xl font-bold text-yellow-300' : 'text-base font-semibold'}`}
      >
        {formatKRW(value)}
      </div>
    </div>
  );
}
