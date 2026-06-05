'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'react-toastify';
import { useRouter } from 'next/navigation';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { paidPatchSchema, type PaidPatch } from '@/lib/validation/quote';
import { todayKstISO } from '@/lib/format/date';
import { changeStatus } from '../actions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  defaultPaymentDate?: string;
}

export function PaidInfoDialog({ open, onOpenChange, quoteId, defaultPaymentDate }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const form = useForm<PaidPatch>({
    resolver: zodResolver(paidPatchSchema),
    defaultValues: {
      payment_date: defaultPaymentDate ?? todayKstISO(),
      tax_invoice_no: '',
      tax_invoice_issued_at: '',
    },
  });

  async function onSubmit(values: PaidPatch) {
    setSaving(true);
    try {
      const res = await changeStatus(quoteId, 'paid', {
        payment_date: values.payment_date,
        tax_invoice_no: values.tax_invoice_no || null,
        tax_invoice_issued_at: values.tax_invoice_issued_at || null,
      });
      if (res.ok) {
        toast.success('입금확인 처리 완료');
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(`처리 실패: ${res.error}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>입금확인 처리</DialogTitle>
          <DialogDescription>
            입금일자를 입력하세요. 세금계산서 정보는 선택 입력입니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label className="text-xs">입금일자 *</Label>
            <Input type="date" {...form.register('payment_date')} />
            {form.formState.errors.payment_date && (
              <p className="mt-1 text-xs text-red-500">
                {form.formState.errors.payment_date.message}
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs">세금계산서번호</Label>
            <Input {...form.register('tax_invoice_no')} />
          </div>
          <div>
            <Label className="text-xs">계산서 발행일</Label>
            <Input type="date" {...form.register('tax_invoice_issued_at')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '처리중...' : '입금확인 저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
