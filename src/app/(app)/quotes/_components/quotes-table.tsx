'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Send, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';

import { DataTable } from '@/components/data-table';
import { ColumnHeader } from '@/components/data-table/column-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QuoteStatusBadge } from '@/components/quote/quote-status-badge';
import { formatKRW } from '@/lib/format/currency';
import { QUOTE_STATUS_LABEL, type QuoteStatus } from '@/lib/supabase/types';
import { bulkChangeStatus, deleteQuote, bulkDeleteQuotes } from '../actions';

export interface QuotesRow {
  id: string;
  quote_no: string | null;
  status: QuoteStatus;
  service_start: string;
  service_end: string;
  total_amount: number;
  company_name: string;
  sub_company_name: string | null;
}

interface Props {
  rows: QuotesRow[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  onPageChange: (i: number) => void;
  onPageSizeChange: (s: number) => void;
}

const BULK_OPTIONS: QuoteStatus[] = ['draft', 'sent', 'won'];

export function QuotesTable({
  rows,
  totalCount,
  pageIndex,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [bulkTarget, setBulkTarget] = useState<QuoteStatus | ''>('');

  const columns = useMemo<ColumnDef<QuotesRow>[]>(
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
        accessorKey: 'quote_no',
        header: ({ column }) => <ColumnHeader column={column} label="견적번호" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-gray-900">
            {row.original.quote_no ?? '-'}
          </span>
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
        accessorKey: 'service_start',
        header: ({ column }) => <ColumnHeader column={column} label="기간" />,
        cell: ({ row }) => (
          <span className="text-xs text-gray-700">
            {row.original.service_start} ~ {row.original.service_end}
          </span>
        ),
        size: 200,
      },
      {
        accessorKey: 'total_amount',
        header: ({ column }) => <ColumnHeader column={column} label="견적가" />,
        cell: ({ row }) => (
          <span className="tabular-nums font-medium text-gray-900">
            {formatKRW(row.original.total_amount)}
          </span>
        ),
        size: 140,
      },
      {
        accessorKey: 'status',
        header: () => <span className="text-xs font-semibold text-gray-600">상태</span>,
        cell: ({ row }) => <QuoteStatusBadge status={row.original.status} />,
        enableSorting: false,
        size: 90,
      },
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }) => (
          <div className="flex items-center gap-1" data-no-row-click>
            <Link
              href={`/quotes/${row.original.id}/edit`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center text-gray-400 hover:text-gray-900"
              title="편집"
            >
              <Pencil className="h-4 w-4" />
            </Link>
            <Link
              href={`/quotes/${row.original.id}/send`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center text-gray-400 hover:text-gray-900"
              title="발송"
            >
              <Send className="h-4 w-4" />
            </Link>
            {(row.original.status === 'draft' || row.original.status === 'sent') && (
              <QuoteDeleteButton id={row.original.id} quoteNo={row.original.quote_no} />
            )}
          </div>
        ),
        enableSorting: false,
        size: 80,
      },
    ],
    [],
  );

  function runBulk(selectedIds: string[], clear: () => void) {
    if (!bulkTarget) {
      toast.error('변경할 상태를 선택해주세요');
      return;
    }
    if (
      !confirm(
        `${selectedIds.length}개 견적의 상태를 [${QUOTE_STATUS_LABEL[bulkTarget]}] 로 일괄 변경하시겠습니까?\n` +
          '입금확인(paid)은 개별 입금일자가 필요해 일괄 변경 불가합니다.',
      )
    )
      return;

    startTransition(async () => {
      const res = await bulkChangeStatus(selectedIds, bulkTarget);
      if (res.ok && res.data) {
        toast.success(
          `${res.data.success}건 변경 완료${res.data.failed.length ? ` (실패 ${res.data.failed.length}건)` : ''}`,
        );
        clear();
        setBulkTarget('');
        router.refresh();
      } else {
        toast.error(`변경 실패: ${res.error}`);
      }
    });
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      enableRowSelection
      onRowClick={(r) => router.push(`/quotes/${r.id}`)}
      emptyMessage="견적이 없습니다. 우측 상단의 ‘신규 견적’ 버튼으로 시작하세요."
      serverPagination={{
        pageIndex,
        pageSize,
        totalCount,
        onPageChange,
        onPageSizeChange,
      }}
      bulkActions={(selectedIds, clear) => (
        <>
          <Select value={bulkTarget} onValueChange={(v) => setBulkTarget(v as QuoteStatus)}>
            <SelectTrigger className="h-8 w-[120px] bg-white text-gray-900">
              <SelectValue placeholder="상태 선택" />
            </SelectTrigger>
            <SelectContent>
              {BULK_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {QUOTE_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={isPending || !bulkTarget}
            onClick={() => runBulk(selectedIds, clear)}
          >
            {isPending ? '처리중...' : '일괄 변경'}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() => runBulkDelete(selectedIds, clear)}
          >
            삭제
          </Button>
        </>
      )}
    />
  );

  function runBulkDelete(selectedIds: string[], clear: () => void) {
    if (
      !confirm(
        `${selectedIds.length}개 견적을 삭제하시겠습니까?\n` +
          '임시저장/발송 견적만 삭제되며(수주/입금 제외), 되돌릴 수 없습니다.',
      )
    )
      return;
    startTransition(async () => {
      const res = await bulkDeleteQuotes(selectedIds);
      if (res.ok && res.data) {
        toast.success(
          `${res.data.success}건 삭제 완료${res.data.failed.length ? ` (제외/실패 ${res.data.failed.length}건)` : ''}`,
        );
        clear();
        router.refresh();
      } else {
        toast.error(`삭제 실패: ${res.error}`);
      }
    });
  }
}

function QuoteDeleteButton({ id, quoteNo }: { id: string; quoteNo: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`견적 ${quoteNo ?? ''}을(를) 삭제하시겠습니까?\n되돌릴 수 없습니다.`)) return;
    startTransition(async () => {
      const res = await deleteQuote(id);
      if (res.ok) {
        toast.success('견적이 삭제되었습니다');
        router.refresh();
      } else {
        toast.error(`삭제 실패: ${res.error}`);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={isPending}
      className="inline-flex items-center text-gray-400 hover:text-red-600 disabled:opacity-50"
      title="삭제"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
