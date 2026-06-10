'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  /** 서버에서 계산한 현재 적용 월 (디폴트: 현재 월, 빈 문자열: 전체 기간) */
  effectiveMonth: string;
}

export function AdjustmentsFilterBar({ effectiveMonth }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');

  // 검색 debounce 300ms
  useEffect(() => {
    const cur = sp.get('q') ?? '';
    if (q === cur) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams(sp.toString());
      if (q) p.set('q', q);
      else p.delete('q');
      p.delete('page');
      router.replace(`/adjustments?${p.toString()}`);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setMonth(value: string) {
    const p = new URLSearchParams(sp.toString());
    // 빈 값이면 '전체 기간'을 명시(빈 문자열). param 삭제 시 현재 월 디폴트로 되돌아가므로 삭제하지 않음.
    p.set('month', value);
    p.delete('page');
    router.replace(`/adjustments?${p.toString()}`);
  }

  const hasFilter = q !== '' || sp.get('month') !== null;

  return (
    <div className="space-y-3 border-b border-gray-200 bg-white px-8 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="견적번호 또는 거래처명으로 검색..."
            className="pl-9"
          />
        </div>

        <Input
          type="month"
          value={effectiveMonth}
          onChange={(e) => setMonth(e.target.value)}
          className="w-[180px]"
        />

        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ('');
              router.replace('/adjustments');
            }}
          >
            초기화
          </Button>
        )}
      </div>
    </div>
  );
}
