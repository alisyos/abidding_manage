'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function SalesSearchBar({ q: initialQ }: { q: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(initialQ);

  useEffect(() => {
    const cur = sp.get('q') ?? '';
    if (q === cur) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams(sp.toString());
      if (q) p.set('q', q);
      else p.delete('q');
      router.replace(`/sales?${p.toString()}`);
    }, 300);
    return () => clearTimeout(t);
  }, [q, sp, router]);

  return (
    <div className="relative flex-1 min-w-[240px] max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="거래처·세부거래처 검색..."
        className="pl-9"
      />
    </div>
  );
}
