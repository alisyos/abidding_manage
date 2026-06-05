'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { QUOTE_STATUS_LABEL, type QuoteStatus } from '@/lib/supabase/types';

const STATUS_TABS: { value: 'all' | QuoteStatus; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'draft', label: QUOTE_STATUS_LABEL.draft },
  { value: 'sent', label: QUOTE_STATUS_LABEL.sent },
  { value: 'won', label: QUOTE_STATUS_LABEL.won },
  { value: 'paid', label: QUOTE_STATUS_LABEL.paid },
];

export function QuotesFilterBar() {
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
      router.replace(`/quotes?${p.toString()}`);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setParam(key: string, value: string | null) {
    const p = new URLSearchParams(sp.toString());
    if (value === null || value === '') p.delete(key);
    else p.set(key, value);
    p.delete('page');
    router.replace(`/quotes?${p.toString()}`);
  }

  const status = (sp.get('status') ?? 'all') as 'all' | QuoteStatus;
  const month = sp.get('month') ?? '';

  return (
    <div className="space-y-3 border-b border-gray-200 bg-white px-8 py-4">
      {/* 상태 탭 */}
      <div className="flex items-center gap-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setParam('status', tab.value === 'all' ? null : tab.value)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              status === tab.value
                ? 'bg-gray-900 text-white font-semibold'
                : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 검색 + 월 필터 */}
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
          onChange={(e) => setParam('month', e.target.value || null)}
          className="w-[180px]"
        />

        {(q || status !== 'all' || month) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ('');
              router.replace('/quotes');
            }}
          >
            초기화
          </Button>
        )}
      </div>
    </div>
  );
}
