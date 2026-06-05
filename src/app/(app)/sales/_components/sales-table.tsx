'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink } from 'lucide-react';

import { DataTable } from '@/components/data-table';
import { ColumnHeader } from '@/components/data-table/column-header';
import { QuoteStatusBadge } from '@/components/quote/quote-status-badge';
import { formatKRW } from '@/lib/format/currency';
import type { QuoteStatus } from '@/lib/supabase/types';

export interface SalesRow {
  id: string;
  revenue_month: string; // YYYY-MM-DD (월 1일)
  quote_id: string;
  quote_no: string | null;
  quote_status: QuoteStatus;
  company_name: string;
  sub_company_name: string | null;
  base_amount: number;
  variable_adjust: number;
  total_amount: number;
  payment_date: string | null;
  tax_invoice_no: string | null;
}

export function SalesTable({ rows }: { rows: SalesRow[] }) {
  const router = useRouter();

  const columns = useMemo<ColumnDef<SalesRow>[]>(
    () => [
      {
        accessorKey: 'revenue_month',
        header: ({ column }) => <ColumnHeader column={column} label="매출월" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-gray-700">
            {row.original.revenue_month.slice(0, 7).replace('-', '.')}
          </span>
        ),
        size: 90,
      },
      {
        accessorKey: 'quote_no',
        header: () => <span className="text-xs font-semibold text-gray-600">견적</span>,
        cell: ({ row }) => (
          <Link
            href={`/quotes/${row.original.quote_id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline"
            data-no-row-click
          >
            {row.original.quote_no ?? '-'}
            <ExternalLink className="h-3 w-3" />
          </Link>
        ),
        size: 140,
      },
      {
        accessorKey: 'company_name',
        header: ({ column }) => <ColumnHeader column={column} label="거래처" />,
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-gray-900">{row.original.company_name}</div>
            {row.original.sub_company_name && (
              <div className="text-xs text-gray-500">{row.original.sub_company_name}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'base_amount',
        header: ({ column }) => <ColumnHeader column={column} label="기본가" />,
        cell: ({ row }) => (
          <span className="tabular-nums text-gray-700">{formatKRW(row.original.base_amount)}</span>
        ),
        size: 120,
      },
      {
        accessorKey: 'variable_adjust',
        header: () => <span className="text-xs font-semibold text-gray-600">변동조정</span>,
        cell: ({ row }) => (
          <span
            className={`tabular-nums text-xs ${row.original.variable_adjust < 0 ? 'text-red-600' : 'text-gray-500'}`}
          >
            {row.original.variable_adjust === 0 ? '-' : formatKRW(row.original.variable_adjust)}
          </span>
        ),
        enableSorting: false,
        size: 110,
      },
      {
        accessorKey: 'total_amount',
        header: ({ column }) => <ColumnHeader column={column} label="견적가" />,
        cell: ({ row }) => (
          <span className="tabular-nums font-semibold text-gray-900">
            {formatKRW(row.original.total_amount)}
          </span>
        ),
        size: 140,
      },
      {
        accessorKey: 'payment_date',
        header: () => <span className="text-xs font-semibold text-gray-600">입금일</span>,
        cell: ({ row }) => (
          <span className="text-xs text-gray-700">{row.original.payment_date ?? '-'}</span>
        ),
        enableSorting: false,
        size: 110,
      },
      {
        accessorKey: 'quote_status',
        header: () => <span className="text-xs font-semibold text-gray-600">상태</span>,
        cell: ({ row }) => <QuoteStatusBadge status={row.original.quote_status} />,
        enableSorting: false,
        size: 90,
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      onRowClick={(r) => router.push(`/quotes/${r.quote_id}`)}
      emptyMessage="아직 수주(won)로 전환된 견적이 없습니다. 견적 상세에서 상태를 ‘수주’로 변경하면 자동으로 표시됩니다."
    />
  );
}
