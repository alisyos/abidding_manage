'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function MonthPicker({ month }: { month: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(v: string) {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set('month', v);
    else p.delete('month');
    router.replace(`/sales?${p.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs whitespace-nowrap">매출월</Label>
      <Input
        type="month"
        value={month}
        onChange={(e) => onChange(e.target.value)}
        className="w-[180px]"
      />
    </div>
  );
}
