'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { Column } from '@tanstack/react-table';
import { cn } from '@/lib/utils';

interface Props<T> {
  column: Column<T, unknown>;
  label: string;
  className?: string;
}

export function ColumnHeader<T>({ column, label, className }: Props<T>) {
  const canSort = column.getCanSort();
  if (!canSort) {
    return <span className={cn('text-xs font-semibold text-gray-600', className)}>{label}</span>;
  }
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === 'asc')}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900',
        className,
      )}
    >
      {label}
      {sorted === 'asc' ? (
        <ArrowUp className="h-3 w-3" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}
