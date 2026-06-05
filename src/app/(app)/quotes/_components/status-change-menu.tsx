'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QUOTE_STATUS_LABEL, type QuoteStatus } from '@/lib/supabase/types';
import { changeStatus } from '../actions';
import { PaidInfoDialog } from './paid-info-dialog';

interface Props {
  quoteId: string;
  current: QuoteStatus;
}

const ALL_STATUSES: QuoteStatus[] = ['draft', 'sent', 'won', 'paid'];

export function StatusChangeMenu({ quoteId, current }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState<QuoteStatus | ''>('');
  const [paidOpen, setPaidOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleChange(to: QuoteStatus) {
    if (to === current) return;

    if (to === 'paid') {
      // 다이얼로그 띄움
      setPaidOpen(true);
      return;
    }

    const confirmMsg =
      `상태를 [${QUOTE_STATUS_LABEL[current]}] → [${QUOTE_STATUS_LABEL[to]}] 로 변경하시겠습니까?\n` +
      (current === 'won' || current === 'paid'
        ? '\n매출 데이터가 영향을 받을 수 있습니다.'
        : '');
    if (!confirm(confirmMsg)) {
      setTarget('');
      return;
    }

    setPending(true);
    const res = await changeStatus(quoteId, to);
    setPending(false);
    if (res.ok) {
      toast.success(`상태가 ${QUOTE_STATUS_LABEL[to]} 로 변경되었습니다`);
      router.refresh();
    } else {
      toast.error(`상태 변경 실패: ${res.error}`);
    }
    setTarget('');
  }

  return (
    <>
      <div className="inline-flex items-center gap-2">
        <span className="text-xs text-gray-500">상태 변경:</span>
        <Select
          value={target || current}
          onValueChange={(v) => {
            setTarget(v as QuoteStatus);
            handleChange(v as QuoteStatus);
          }}
          disabled={pending}
        >
          <SelectTrigger className="w-[140px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {QUOTE_STATUS_LABEL[s]}
                {s === current ? ' (현재)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PaidInfoDialog open={paidOpen} onOpenChange={setPaidOpen} quoteId={quoteId} />
    </>
  );
}
