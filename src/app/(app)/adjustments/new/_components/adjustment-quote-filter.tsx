'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { todayKstISO } from '@/lib/format/date';

export function AdjustmentQuoteFilter() {
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
      router.replace(`/adjustments/new?${p.toString()}`);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // 월: URL에 키 없으면 이번 달 기본값, 빈 문자열이면 전체
  const month = sp.has('month') ? (sp.get('month') ?? '') : todayKstISO().slice(0, 7);

  function setMonth(value: string) {
    const p = new URLSearchParams(sp.toString());
    p.set('month', value); // 빈 문자열도 명시 → 서버가 '전체'로 인식
    router.replace(`/adjustments/new?${p.toString()}`);
  }

  const hasFilter = !!q || (sp.has('month') ? sp.get('month') !== '' : true);

  return (
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
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="w-[180px]"
      />

      {hasFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ('');
            router.replace('/adjustments/new');
          }}
        >
          초기화
        </Button>
      )}
    </div>
  );
}
