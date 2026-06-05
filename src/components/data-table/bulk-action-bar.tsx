'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}

export function BulkActionBar({ count, onClear, children }: Props) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
      <div className="flex items-center gap-3 rounded-xl bg-gray-900 text-white shadow-xl border border-gray-700 px-4 py-3">
        <span className="text-sm font-medium">{count}개 선택됨</span>
        <div className="h-5 w-px bg-gray-700" />
        <div className="flex items-center gap-2">{children}</div>
        <div className="h-5 w-px bg-gray-700" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-white hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
