'use client';

import { Printer, X } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function PrintBar({ backHref }: { backHref: string }) {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
      <Button variant="ghost" asChild size="sm">
        <Link href={backHref}>
          <X className="h-4 w-4 mr-1" /> 닫기
        </Link>
      </Button>
      <Button onClick={() => window.print()} size="sm">
        <Printer className="h-4 w-4 mr-1" /> 인쇄
      </Button>
    </div>
  );
}
