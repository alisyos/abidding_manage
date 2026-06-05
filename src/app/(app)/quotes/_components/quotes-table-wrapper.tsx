'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { QuotesTable, type QuotesRow } from './quotes-table';

interface Props {
  rows: QuotesRow[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
}

export function QuotesTableWrapper({ rows, totalCount, pageIndex, pageSize }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function update(params: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.replace(`/quotes?${p.toString()}`);
  }

  return (
    <QuotesTable
      rows={rows}
      totalCount={totalCount}
      pageIndex={pageIndex}
      pageSize={pageSize}
      onPageChange={(i) => update({ page: String(i + 1) })}
      onPageSizeChange={(s) => update({ size: String(s), page: '1' })}
    />
  );
}
