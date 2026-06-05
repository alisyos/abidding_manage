'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { senderSchema, type SenderInput } from '@/lib/validation/sender';
import { updateSender } from '../actions';

interface SenderFormProps {
  defaultValues: SenderInput;
}

export function SenderForm({ defaultValues }: SenderFormProps) {
  const [saving, setSaving] = useState(false);

  const form = useForm<SenderInput>({
    resolver: zodResolver(senderSchema),
    defaultValues,
  });

  async function onSubmit(values: SenderInput) {
    setSaving(true);
    const res = await updateSender(values);
    setSaving(false);
    if (res.ok) {
      toast.success('발신자 정보가 저장되었습니다');
      form.reset(values);
    } else {
      toast.error(`저장 실패: ${res.error}`);
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="회사명" error={form.formState.errors.company_name?.message}>
              <Input {...form.register('company_name')} placeholder="주식회사 디엠피코리아" />
            </Field>
            <Field label="담당자명" error={form.formState.errors.contact_name?.message}>
              <Input {...form.register('contact_name')} placeholder="홍길동 사원" />
            </Field>
            <Field label="연락처">
              <Input {...form.register('phone')} placeholder="02-0000-0000" />
            </Field>
            <Field label="이메일" error={form.formState.errors.email?.message}>
              <Input type="email" {...form.register('email')} placeholder="contact@dmpkorea.co.kr" />
            </Field>
          </div>

          <Field label="주소">
            <Textarea rows={2} {...form.register('address')} placeholder="서울특별시 ..." />
          </Field>

          <Field label="입금통장">
            <Input
              {...form.register('bank_account')}
              placeholder="국민은행 000000-00-000000 (예금주)"
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              type="button"
              variant="ghost"
              onClick={() => form.reset(defaultValues)}
              disabled={saving || !form.formState.isDirty}
            >
              되돌리기
            </Button>
            <Button type="submit" disabled={saving || !form.formState.isDirty}>
              {saving ? '저장중...' : '저장'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-700">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
