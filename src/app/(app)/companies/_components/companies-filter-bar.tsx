'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { GroupOption } from './group-manager-dialog';

export function CompaniesFilterBar({ groups }: { groups: GroupOption[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');

  // q debounce (300ms)
  useEffect(() => {
    const cur = sp.get('q') ?? '';
    if (q === cur) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams(sp.toString());
      if (q) p.set('q', q);
      else p.delete('q');
      p.delete('page');
      router.replace(`/companies?${p.toString()}`);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setParam(key: string, value: string | null) {
    const p = new URLSearchParams(sp.toString());
    if (value === null || value === '') p.delete(key);
    else p.set(key, value);
    p.delete('page');
    router.replace(`/companies?${p.toString()}`);
  }

  const accountType = sp.get('account_type') ?? 'all';
  const status = sp.get('status') ?? 'active';
  const groupId = sp.get('group_id') ?? 'all';

  return (
    <div className="flex flex-wrap items-center gap-2 px-8 py-4 bg-white border-b border-gray-200">
      <div className="relative flex-1 min-w-[240px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="거래처명으로 검색..."
          className="pl-9"
        />
      </div>

      <Select
        value={accountType}
        onValueChange={(v) => setParam('account_type', v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체 유형</SelectItem>
          <SelectItem value="agency">제휴사</SelectItem>
          <SelectItem value="advertiser">광고주</SelectItem>
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={(v) => setParam('status', v)}>
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">활성만</SelectItem>
          <SelectItem value="inactive">비활성만</SelectItem>
          <SelectItem value="all">전체</SelectItem>
        </SelectContent>
      </Select>

      <Select value={groupId} onValueChange={(v) => setParam('group_id', v === 'all' ? null : v)}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="그룹" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체 그룹</SelectItem>
          {groups.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name} ({g.member_count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(q || sp.get('account_type') || sp.get('status') || sp.get('group_id')) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ('');
            router.replace('/companies');
          }}
        >
          초기화
        </Button>
      )}
    </div>
  );
}
