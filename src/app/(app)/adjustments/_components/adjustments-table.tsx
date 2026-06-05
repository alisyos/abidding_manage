'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink, Send } from 'lucide-react';

import { DataTable } from '@/components/data-table';
import { ColumnHeader } from '@/components/data-table/column-header';
import { formatKRW } from '@/lib/format/currency';
import { MEDIA_LABEL, TIER_LABEL, type Media, type Tier } from '@/lib/supabase/types';

export interface AdjustmentRow {
  id: string;
  adjustment_date: string;
  quote_id: string;
  quote_no: string | null;
  company_name: string;
  media: Media;
  delta_unique: number;
  delta_premium: number;
  delta_basic: number;
  delta_lite: number;
  pre_adjust_amount: number;
  reason: string | null;
}

const TIERS: Tier[] = ['unique', 'premium', 'basic', 'lite'];
const TIER_INITIAL: Record<Tier, string> = {
  unique: 'U',
  premium: 'P',
  basic: 'B',
  lite: 'L',
};

function formatDeltaSummary(row: AdjustmentRow): string {
  const parts: string[] = [];
  for (const t of TIERS) {
    const d =
      t === 'unique'
        ? row.delta_unique
        : t === 'premium'
        ? row.delta_premium
        : t === 'basic'
        ? row.delta_basic
        : row.delta_lite;
    if (d !== 0) parts.push(`${TIER_INITIAL[t]}:${d > 0 ? '+' : ''}${d}`);
  }
  return parts.length ? parts.join(' ') : '-';
}

export function AdjustmentsTable({ rows }: { rows: AdjustmentRow[] }) {
  const router = useRouter();

  const columns = useMemo<ColumnDef<AdjustmentRow>[]>(
    () => [
      {
        accessorKey: 'adjustment_date',
        header: ({ column }) => <ColumnHeader column={column} label="조정일자" />,
        cell: ({ row }) => (
          <span className="text-xs text-gray-700">{row.original.adjustment_date}</span>
        ),
        size: 110,
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
          <span className="font-medium text-gray-900">{row.original.company_name}</span>
        ),
      },
      {
        accessorKey: 'media',
        header: () => <span className="text-xs font-semibold text-gray-600">매체</span>,
        cell: ({ row }) => (
          <span className="text-sm text-gray-700">{MEDIA_LABEL[row.original.media]}</span>
        ),
        size: 110,
      },
      {
        id: 'delta',
        header: () => <span className="text-xs font-semibold text-gray-600">변동(U/P/B/L)</span>,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-gray-700">{formatDeltaSummary(row.original)}</span>
        ),
        enableSorting: false,
        size: 150,
      },
      {
        accessorKey: 'pre_adjust_amount',
        header: ({ column }) => <ColumnHeader column={column} label="선조정가" />,
        cell: ({ row }) => (
          <span
            className={`tabular-nums font-medium ${
              row.original.pre_adjust_amount < 0 ? 'text-red-600' : 'text-gray-900'
            }`}
          >
            {formatKRW(row.original.pre_adjust_amount)}
          </span>
        ),
        size: 140,
      },
      {
        accessorKey: 'reason',
        header: () => <span className="text-xs font-semibold text-gray-600">사유</span>,
        cell: ({ row }) => (
          <span className="text-xs text-gray-500 line-clamp-1">
            {row.original.reason || '-'}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }) => (
          <Link
            href={`/adjustments/${row.original.id}/send`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center text-gray-400 hover:text-gray-900"
            title="메일 재발송"
            data-no-row-click
          >
            <Send className="h-4 w-4" />
          </Link>
        ),
        enableSorting: false,
        size: 40,
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
      emptyMessage="조정 내역이 없습니다. 우측 상단의 '조정 등록'으로 시작하세요."
    />
  );
}
