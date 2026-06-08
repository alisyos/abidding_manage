'use client';

import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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

/** 'YYYY-MM' → 그 달 말일 'YYYY-MM-DD' */
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return `${month}-28`;
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

/** service_start가 1일 & service_end가 같은 달 말일이면 월 단위로 간주 */
function isFullMonth(start: string, end: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  return start.endsWith('-01') && end === lastDayOfMonth(start.slice(0, 7));
}

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
  const [periodMode, setPeriodMode] = useState<'month' | 'custom'>(() =>
    isFullMonth(defaultValues.service_start, defaultValues.service_end) ? 'month' : 'custom',
  );

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

  // 합계 미리보기 — 임계값 기반 할인 자동 + 추가 할인
  const items = useWatch({ control: form.control, name: 'items' });
  const addonFee = useWatch({ control: form.control, name: 'addon_fee' }) ?? 0;
  const fixedAdjust = useWatch({ control: form.control, name: 'fixed_adjust' }) ?? 0;
  const variableAdjust = useWatch({ control: form.control, name: 'variable_adjust' }) ?? 0;
  const extraDiscountRate = useWatch({ control: form.control, name: 'extra_discount_rate' }) ?? 0;
  const extraDiscountAmount =
    useWatch({ control: form.control, name: 'extra_discount_amount' }) ?? 0;

  const calc = computeQuote(
    (items ?? []).map((i) => ({
      quantity: Number(i?.quantity ?? 0),
      unit_price: Number(i?.unit_price ?? 0),
      list_price: Number(i?.list_price ?? 0),
    })),
    Number(addonFee || 0),
    Number(fixedAdjust || 0),
    Number(variableAdjust || 0),
    Number(extraDiscountRate || 0),
    Number(extraDiscountAmount || 0),
  );

  // ── 개별 신규 견적: 이전 달 사용량 + 조정 delta(조정 후 수량) 불러오기 ──
  const subCompanyId = useWatch({ control: form.control, name: 'sub_company_id' });
  const serviceStart = useWatch({ control: form.control, name: 'service_start' });
  const [prefilling, setPrefilling] = useState(false);
  const autoLoadedKey = useRef<string | null>(null);

  async function loadPreviousUsage(silent = false) {
    const company_id = form.getValues('company_id');
    const service_start = form.getValues('service_start');
    if (!company_id || !service_start) {
      if (!silent) toast.info('거래처와 서비스 시작일을 먼저 선택하세요');
      return;
    }
    const sub = form.getValues('sub_company_id');
    setPrefilling(true);
    try {
      const params = new URLSearchParams({ company_id, service_start });
      if (sub) params.set('sub_company_id', sub);
      const res = await fetch(`/api/quotes/prefill?${params.toString()}`);
      const data = (await res.json()) as {
        source: { quote_no: string | null; service_start: string } | null;
        items: { media: Media; tier: Tier; quantity: number }[];
        adjust: {
          addon_fee: number;
          fixed_adjust: number;
          variable_adjust: number;
          extra_discount_rate: number;
          extra_discount_amount: number;
          extra_discount_note: string;
        } | null;
      };
      if (!res.ok || !data.source) {
        if (!silent) toast.info('이전 달 견적이 없습니다');
        return;
      }
      const qtyByKey = new Map(data.items.map((i) => [`${i.media}__${i.tier}`, i.quantity]));
      const items12 = itemKeys.map((k) => ({
        media: k.media,
        tier: k.tier,
        quantity: qtyByKey.get(`${k.media}__${k.tier}`) ?? 0,
        unit_price: k.unit_price,
        list_price: k.list_price,
      }));
      form.setValue('items', items12, { shouldValidate: true, shouldDirty: true });
      // 금액 조정/할인 필드도 이전 견적에서 복제 (일괄 생성과 동일)
      if (data.adjust) {
        const opt = { shouldValidate: true, shouldDirty: true } as const;
        form.setValue('addon_fee', data.adjust.addon_fee, opt);
        form.setValue('fixed_adjust', data.adjust.fixed_adjust, opt);
        form.setValue('variable_adjust', data.adjust.variable_adjust, opt);
        form.setValue('extra_discount_rate', data.adjust.extra_discount_rate, opt);
        form.setValue('extra_discount_amount', data.adjust.extra_discount_amount, opt);
        form.setValue('extra_discount_note', data.adjust.extra_discount_note, opt);
      }
      const label = data.source.service_start.slice(0, 7).replace('-', '.');
      toast.success(`${label} 견적 기준 조정 후 수량을 불러왔습니다`);
    } catch {
      if (!silent) toast.error('이전 달 사용량 불러오기 실패');
    } finally {
      setPrefilling(false);
    }
  }

  // 자동 제안: create 모드에서 거래처/세부/서비스 월이 바뀔 때마다 해당 월 기준 이전 달 수량 재로드
  useEffect(() => {
    if (mode !== 'create') return;
    if (!companyId || !serviceStart) return;
    const key = `${companyId}__${subCompanyId ?? ''}__${serviceStart.slice(0, 7)}`;
    if (autoLoadedKey.current === key) return;
    autoLoadedKey.current = key;
    void loadPreviousUsage(true);
  }, [companyId, subCompanyId, serviceStart]); // eslint-disable-line react-hooks/exhaustive-deps

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

              <div className="md:col-span-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">서비스 기간 *</Label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <Checkbox
                      checked={periodMode === 'custom'}
                      onCheckedChange={(v) => setPeriodMode(v ? 'custom' : 'month')}
                    />
                    직접 입력 (일 단위)
                  </label>
                </div>

                {periodMode === 'month' ? (
                  <div className="mt-1 flex items-center gap-3">
                    <Input
                      type="month"
                      className="w-[180px]"
                      value={(form.watch('service_start') || '').slice(0, 7)}
                      onChange={(e) => {
                        const m = e.target.value;
                        if (!m) return;
                        form.setValue('service_start', `${m}-01`, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        form.setValue('service_end', lastDayOfMonth(m), {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }}
                    />
                    <span className="text-xs text-gray-500 tabular-nums">
                      {form.watch('service_start')} ~ {form.watch('service_end')}
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 grid grid-cols-2 gap-4">
                    <div>
                      <Input type="date" {...form.register('service_start')} />
                      {form.formState.errors.service_start && (
                        <p className="mt-1 text-xs text-red-500">
                          {form.formState.errors.service_start.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <Input type="date" {...form.register('service_end')} />
                      {form.formState.errors.service_end && (
                        <p className="mt-1 text-xs text-red-500">
                          {form.formState.errors.service_end.message}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 견적 항목 */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">견적 항목</h2>
              {mode === 'create' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => loadPreviousUsage(false)}
                  disabled={prefilling}
                >
                  {prefilling ? '불러오는 중…' : '이전 달 사용량 불러오기 (조정 반영)'}
                </Button>
              )}
            </div>
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

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-gray-700">추가 할인 (견적별)</h3>
                <span className="text-[10px] text-gray-400">
                  표준 할인과 별도로 적용되며 두 값 모두 채우면 합산됩니다.
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">추가 할인율 (0~1)</Label>
                  <Input
                    type="number"
                    step={0.01}
                    min={0}
                    max={1}
                    {...form.register('extra_discount_rate', { valueAsNumber: true })}
                  />
                </div>
                <div>
                  <Label className="text-xs">추가 할인액 (원)</Label>
                  <Input
                    type="number"
                    step={100}
                    min={0}
                    {...form.register('extra_discount_amount', { valueAsNumber: true })}
                  />
                </div>
                <div>
                  <Label className="text-xs">추가 할인 사유</Label>
                  <Input
                    placeholder="예: 통계 무료 제공"
                    {...form.register('extra_discount_note')}
                  />
                </div>
              </div>
            </div>

            <p className="text-[11px] text-gray-500">
              ※ 표준 할인은 공시가 합계 ≥ 100,000원 시 자동 적용됩니다.
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
          <CardContent className="p-6 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <Summary label="공시가 합계" value={calc.listSum} muted />
            <Summary
              label={calc.discountApplied ? '할인 적용 후 기본가' : '기본가 (공시가 적용)'}
              value={calc.baseAmount}
            />
            <Summary label="− 추가할인" value={-calc.extraDiscount} muted />
            <Summary label="+ 조정 후" value={calc.adjusted} muted />
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
