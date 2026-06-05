'use client';

import { FormProvider, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { toast } from 'react-toastify';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';

import { SubCompanyFields } from './sub-company-fields';
import { companyInputSchema, type CompanyInput } from '@/lib/validation/company';
import { createCompany, updateCompany } from '../actions';

interface Props {
  mode: 'create' | 'edit';
  companyId?: string;
  defaultValues: CompanyInput;
}

export function CompanyForm({ mode, companyId, defaultValues }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const form = useForm<CompanyInput>({
    resolver: zodResolver(companyInputSchema),
    defaultValues,
  });

  const subArr = useFieldArray({ control: form.control, name: 'sub_companies' });

  async function onSubmit(values: CompanyInput) {
    setSaving(true);
    try {
      if (mode === 'create') {
        const res = await createCompany(values);
        if (res.ok && res.data) {
          toast.success('거래처가 등록되었습니다');
          router.push(`/companies/${res.data.id}`);
          router.refresh();
        } else {
          toast.error(`저장 실패: ${res.error}`);
        }
      } else if (companyId) {
        const res = await updateCompany(companyId, values);
        if (res.ok) {
          toast.success('거래처가 수정되었습니다');
          router.push(`/companies/${companyId}`);
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
            <h2 className="text-sm font-semibold text-gray-900">기본 정보</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">거래처명 *</Label>
                <Input {...form.register('name')} placeholder="예: NHNAD" />
                {form.formState.errors.name && (
                  <p className="mt-1 text-xs text-red-500">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs">No</Label>
                <Input
                  type="number"
                  {...form.register('no', {
                    setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
                  })}
                  placeholder="자동/임의 번호"
                />
              </div>

              <div>
                <Label className="text-xs">계정 유형 *</Label>
                <RadioGroup
                  className="flex gap-4 mt-1"
                  value={form.watch('account_type')}
                  onValueChange={(v) =>
                    form.setValue('account_type', v as 'advertiser' | 'agency', {
                      shouldDirty: true,
                    })
                  }
                >
                  <label className="flex items-center gap-1.5 text-sm">
                    <RadioGroupItem value="agency" /> 제휴사
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <RadioGroupItem value="advertiser" /> 광고주
                  </label>
                </RadioGroup>
              </div>

              <div>
                <Label className="text-xs">기본 할인율 (0~1, 예: 0.10)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  {...form.register('default_discount_rate', { valueAsNumber: true })}
                />
                {form.formState.errors.default_discount_rate && (
                  <p className="mt-1 text-xs text-red-500">
                    {form.formState.errors.default_discount_rate.message}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs">userDatabase</Label>
                <Input {...form.register('user_database')} />
              </div>
              <div>
                <Label className="text-xs">userAgencyId</Label>
                <Input {...form.register('user_agency_id')} />
              </div>

              <div className="md:col-span-2">
                <Label className="text-xs">URL</Label>
                <Input {...form.register('url')} placeholder="https://..." />
              </div>

              <div className="md:col-span-2">
                <Label className="text-xs">메모</Label>
                <Textarea rows={2} {...form.register('memo')} />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch('is_active')}
                    onCheckedChange={(v) =>
                      form.setValue('is_active', !!v, { shouldDirty: true })
                    }
                  />
                  활성 상태
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 세부거래처 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">
              세부거래처 ({subArr.fields.length}개)
            </h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                subArr.append({
                  name: '',
                  database_code: '',
                  agency_id: '',
                  memo: '',
                  contacts: [],
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" /> 세부거래처 추가
            </Button>
          </div>

          {subArr.fields.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-gray-400">
                세부거래처가 없습니다. 위의 버튼으로 추가하세요.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {subArr.fields.map((field, i) => (
                <SubCompanyFields
                  key={field.id}
                  subIndex={i}
                  onRemove={() => subArr.remove(i)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 액션 */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
          <Button type="button" variant="ghost" asChild>
            <Link
              href={mode === 'edit' && companyId ? `/companies/${companyId}` : '/companies'}
            >
              취소
            </Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? '저장중...' : mode === 'create' ? '등록' : '저장'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
