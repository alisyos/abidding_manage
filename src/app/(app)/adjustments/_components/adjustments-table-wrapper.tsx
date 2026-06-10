'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { AdjustmentsTable, type AdjustmentRow } from './adjustments-table';

interface Props {
  rows: AdjustmentRow[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
}

export function AdjustmentsTableWrapper({ rows, totalCount, pageIndex, pageSize }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function update(params: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.replace(`/adjustments?${p.toString()}`);
  }

  return (
    <AdjustmentsTable
      rows={rows}
      totalCount={totalCount}
      pageIndex={pageIndex}
      pageSize={pageSize}
      onPageChange={(i) => update({ page: String(i + 1) })}
      onPageSizeChange={(s) => update({ size: String(s), page: '1' })}
    />
  );
}
