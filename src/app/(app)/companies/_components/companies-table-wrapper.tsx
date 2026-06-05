'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { CompaniesTable, type CompaniesRow } from './companies-table';

interface Props {
  rows: CompaniesRow[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
}

/**
 * URL 쿼리 파라미터를 페이지네이션 콜백으로 연결하는 클라이언트 래퍼.
 * 서버 컴포넌트는 query string을 읽어 데이터를 fetch한다.
 */
export function CompaniesTableWrapper({ rows, totalCount, pageIndex, pageSize }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function update(params: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.replace(`/companies?${p.toString()}`);
  }

  return (
    <CompaniesTable
      rows={rows}
      totalCount={totalCount}
      pageIndex={pageIndex}
      pageSize={pageSize}
      onPageChange={(i) => update({ page: String(i + 1) })}
      onPageSizeChange={(s) => update({ size: String(s), page: '1' })}
    />
  );
}
