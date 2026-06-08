'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { formatKRW } from '@/lib/format/currency';
import { MEDIA_LABEL, TIER_LABEL } from '@/lib/supabase/types';
import { QuoteStatusBadge } from '@/components/quote/quote-status-badge';
import {
  CELL_KEYS,
  MEDIA_ORDER,
  TIER_ORDER,
  type PivotResult,
  type PivotRow,
} from '@/lib/sales/pivot';
import { cn } from '@/lib/utils';

type SortKey =
  | 'company'
  | 'quote_no'
  | 'status'
  | 'base'
  | 'extra'
  | 'variable'
  | 'supply'
  | 'vat'
  | 'payment';

/** 공급가액 (부가세 별도) = 합계 − 부가세 */
const supplyOf = (r: PivotRow) => r.total_amount - r.vat_amount;

function compareRows(a: PivotRow, b: PivotRow, key: SortKey): number {
  switch (key) {
    case 'company': {
      const c = a.company_name.localeCompare(b.company_name);
      if (c !== 0) return c;
      const s = (a.sub_company_name ?? '').localeCompare(b.sub_company_name ?? '');
      if (s !== 0) return s;
      return (a.quote_no ?? '').localeCompare(b.quote_no ?? '');
    }
    case 'quote_no':
      return (a.quote_no ?? '').localeCompare(b.quote_no ?? '');
    case 'status':
      return a.quote_status.localeCompare(b.quote_status);
    case 'base':
      return a.base_amount - b.base_amount;
    case 'extra':
      return a.extra_discount - b.extra_discount;
    case 'variable':
      return a.variable_adjust - b.variable_adjust;
    case 'supply':
      return supplyOf(a) - supplyOf(b);
    case 'vat':
      return a.vat_amount - b.vat_amount;
    case 'payment': {
      const av = a.payment_date ?? '';
      const bv = b.payment_date ?? '';
      if (!av && !bv) return 0;
      if (!av) return 1; // 미입금은 뒤로
      if (!bv) return -1;
      return av.localeCompare(bv);
    }
  }
}

export function SalesPivotTable({ pivot }: { pivot: PivotResult }) {
  const [sortKey, setSortKey] = useState<SortKey>('company');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDir('asc');
    }
  }

  const sortedRows = useMemo(() => {
    const rows = [...pivot.rows];
    rows.sort((a, b) => {
      const r = compareRows(a, b, sortKey);
      return dir === 'asc' ? r : -r;
    });
    return rows;
  }, [pivot.rows, sortKey, dir]);

  function SortLabel({ label, sortBy }: { label: string; sortBy: SortKey }) {
    const active = sortKey === sortBy;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortBy)}
        className="inline-flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-900"
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50">
          {/* 1행: 그룹 헤더 (매체 merge) */}
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left border-b border-gray-200" rowSpan={2}>
              <SortLabel label="거래처" sortBy="company" />
            </th>
            <th className="px-3 py-2 text-left border-b border-gray-200" rowSpan={2}>
              <SortLabel label="견적번호" sortBy="quote_no" />
            </th>
            <th className="px-3 py-2 text-left border-b border-gray-200" rowSpan={2}>
              <SortLabel label="상태" sortBy="status" />
            </th>
            {MEDIA_ORDER.map((media) => (
              <th
                key={media}
                colSpan={4}
                className="px-3 py-2 text-center font-semibold text-gray-600 border-b border-l border-gray-200"
              >
                {MEDIA_LABEL[media]}
              </th>
            ))}
            <th className="px-3 py-2 text-right border-b border-l border-gray-200" rowSpan={2}>
              <SortLabel label="기본가액" sortBy="base" />
            </th>
            <th className="px-3 py-2 text-right border-b border-gray-200" rowSpan={2}>
              <SortLabel label="추가할인" sortBy="extra" />
            </th>
            <th className="px-3 py-2 text-right border-b border-gray-200" rowSpan={2}>
              <SortLabel label="변동조정" sortBy="variable" />
            </th>
            <th className="px-3 py-2 text-right border-b border-gray-200" rowSpan={2}>
              <SortLabel label="공급가액" sortBy="supply" />
            </th>
            <th className="px-3 py-2 text-right border-b border-gray-200" rowSpan={2}>
              <SortLabel label="부가세" sortBy="vat" />
            </th>
            <th className="px-3 py-2 text-left border-b border-gray-200" rowSpan={2}>
              <SortLabel label="입금일" sortBy="payment" />
            </th>
          </tr>
          {/* 2행: 등급 */}
          <tr>
            {MEDIA_ORDER.flatMap((media, mi) =>
              TIER_ORDER.map((tier, ti) => (
                <th
                  key={`${media}_${tier}`}
                  className={cn(
                    'px-2 py-1.5 text-right font-medium text-gray-500 border-b border-gray-200',
                    ti === 0 && 'border-l border-gray-300',
                  )}
                >
                  {TIER_LABEL[tier]}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td
                colSpan={3 + 12 + 6}
                className="text-center text-gray-400 py-12"
              >
                해당 조건의 매출 데이터가 없습니다. 견적 상태를 ‘수주’로 변경하면 자동으로 표시됩니다.
              </td>
            </tr>
          ) : (
            sortedRows.map((r) => (
              <tr key={r.rowKey} className="hover:bg-gray-50 border-b border-gray-100">
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5 align-top">
                  <div className="font-medium text-gray-900">{r.company_name}</div>
                  {r.sub_company_name && (
                    <div className="text-[10px] text-gray-500">{r.sub_company_name}</div>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <Link
                    href={`/quotes/${r.quote_id}`}
                    className="font-mono text-blue-600 hover:underline"
                  >
                    {r.quote_no ?? '-'}
                  </Link>
                </td>
                <td className="px-3 py-1.5">
                  <QuoteStatusBadge status={r.quote_status} />
                </td>
                {CELL_KEYS.map((key, idx) => {
                  const v = r.cells[key];
                  return (
                    <td
                      key={key}
                      className={cn(
                        'px-2 py-1.5 text-right tabular-nums',
                        idx % 4 === 0 && 'border-l border-gray-100',
                        v === 0 && 'text-gray-300',
                      )}
                    >
                      {v === 0 ? '-' : v.toLocaleString()}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right tabular-nums border-l border-gray-100">
                  {formatKRW(r.base_amount)}
                </td>
                <td
                  className={cn(
                    'px-3 py-1.5 text-right tabular-nums',
                    r.extra_discount > 0 && 'text-rose-600',
                  )}
                >
                  {r.extra_discount === 0 ? '-' : `−${formatKRW(r.extra_discount)}`}
                </td>
                <td
                  className={cn(
                    'px-3 py-1.5 text-right tabular-nums',
                    r.variable_adjust < 0 && 'text-red-600',
                  )}
                >
                  {r.variable_adjust === 0 ? '-' : formatKRW(r.variable_adjust)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                  {formatKRW(supplyOf(r))}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                  {r.vat_amount === 0 ? '-' : formatKRW(r.vat_amount)}
                </td>
                <td className="px-3 py-1.5 text-gray-700">{r.payment_date ?? '-'}</td>
              </tr>
            ))
          )}
        </tbody>
        {sortedRows.length > 0 && (
          <tfoot className="bg-gray-900 text-white font-semibold">
            <tr>
              <td className="sticky left-0 z-10 bg-gray-900 px-3 py-2" colSpan={3}>
                합계
              </td>
              {CELL_KEYS.map((key, idx) => (
                <td
                  key={key}
                  className={cn(
                    'px-2 py-2 text-right tabular-nums',
                    idx % 4 === 0 && 'border-l border-gray-700',
                  )}
                >
                  {pivot.totals.cells[key] === 0 ? '-' : pivot.totals.cells[key].toLocaleString()}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums border-l border-gray-700">
                {formatKRW(pivot.totals.base_amount)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {pivot.totals.extra_discount === 0
                  ? '-'
                  : `−${formatKRW(pivot.totals.extra_discount)}`}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {pivot.totals.variable_adjust === 0
                  ? '-'
                  : formatKRW(pivot.totals.variable_adjust)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-yellow-300">
                {formatKRW(pivot.totals.total_amount - pivot.totals.vat_amount)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                {pivot.totals.vat_amount === 0
                  ? '-'
                  : formatKRW(pivot.totals.vat_amount)}
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
