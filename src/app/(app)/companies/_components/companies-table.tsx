'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { toast } from 'react-toastify';
import type { ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/data-table';
import { ColumnHeader } from '@/components/data-table/column-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from './status-badge';
import { ACCOUNT_TYPE_LABEL } from '@/lib/supabase/types';
import { bulkActivate, bulkDeactivate, bulkSoftDelete } from '../actions';

export interface CompaniesRow {
  id: string;
  no: number | null;
  name: string;
  account_type: 'advertiser' | 'agency';
  is_active: boolean;
  sub_count: number;
  contact_count: number;
}

interface Props {
  rows: CompaniesRow[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  onPageChange: (i: number) => void;
  onPageSizeChange: (s: number) => void;
}

export function CompaniesTable({
  rows,
  totalCount,
  pageIndex,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const columns = useMemo<ColumnDef<CompaniesRow>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
        size: 40,
      },
      {
        accessorKey: 'no',
        header: ({ column }) => <ColumnHeader column={column} label="No" />,
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">{row.original.no ?? '-'}</span>
        ),
        size: 60,
      },
      {
        accessorKey: 'name',
        header: ({ column }) => <ColumnHeader column={column} label="거래처명" />,
        cell: ({ row }) => (
          <span className="font-medium text-gray-900">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'account_type',
        header: ({ column }) => <ColumnHeader column={column} label="유형" />,
        cell: ({ row }) => (
          <span className="text-sm text-gray-700">
            {ACCOUNT_TYPE_LABEL[row.original.account_type]}
          </span>
        ),
        size: 80,
      },
      {
        accessorKey: 'sub_count',
        header: () => <span className="text-xs font-semibold text-gray-600">세부거래처</span>,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-gray-700">{row.original.sub_count}</span>
        ),
        enableSorting: false,
        size: 90,
      },
      {
        accessorKey: 'contact_count',
        header: () => <span className="text-xs font-semibold text-gray-600">연락처</span>,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-gray-700">{row.original.contact_count}</span>
        ),
        enableSorting: false,
        size: 80,
      },
      {
        accessorKey: 'is_active',
        header: () => <span className="text-xs font-semibold text-gray-600">상태</span>,
        cell: ({ row }) => <StatusBadge active={row.original.is_active} />,
        enableSorting: false,
        size: 80,
      },
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }) => (
          <Link
            href={`/companies/${row.original.id}/edit`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center text-gray-400 hover:text-gray-900"
            data-no-row-click
          >
            <Pencil className="h-4 w-4" />
          </Link>
        ),
        enableSorting: false,
        size: 40,
      },
    ],
    [],
  );

  const [busy, setBusy] = useState<string | null>(null);

  function runBulk(
    label: string,
    fn: (ids: string[]) => Promise<{ ok: boolean; error?: string }>,
    selectedIds: string[],
    clear: () => void,
  ) {
    setBusy(label);
    startTransition(async () => {
      const res = await fn(selectedIds);
      setBusy(null);
      if (res.ok) {
        toast.success(`${selectedIds.length}개 ${label} 완료`);
        clear();
        router.refresh();
      } else {
        toast.error(`${label} 실패: ${res.error ?? ''}`);
      }
    });
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      enableRowSelection
      onRowClick={(r) => router.push(`/companies/${r.id}`)}
      emptyMessage="거래처가 없습니다. 우측 상단의 ‘신규 등록’ 또는 ‘엑셀 가져오기’로 시작하세요."
      serverPagination={{
        pageIndex,
        pageSize,
        totalCount,
        onPageChange,
        onPageSizeChange,
      }}
      bulkActions={(selectedIds, clear) => (
        <>
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() => runBulk('활성화', bulkActivate, selectedIds, clear)}
          >
            {busy === '활성화' ? '처리중...' : '활성화'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() => runBulk('비활성화', bulkDeactivate, selectedIds, clear)}
          >
            {busy === '비활성화' ? '처리중...' : '비활성화'}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              if (
                !confirm(
                  `${selectedIds.length}개 거래처를 삭제하시겠습니까?\n(소프트 삭제: 비활성화되며 데이터는 보존됩니다)`,
                )
              )
                return;
              runBulk('삭제', bulkSoftDelete, selectedIds, clear);
            }}
          >
            {busy === '삭제' ? '처리중...' : '삭제'}
          </Button>
        </>
      )}
    />
  );
}
