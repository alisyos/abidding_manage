'use client';

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pagination } from './pagination';
import { BulkActionBar } from './bulk-action-bar';
import { cn } from '@/lib/utils';

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  /** Stable row id (default: index). 행 클릭/선택 식별에 사용 */
  getRowId?: (row: T, index: number) => string;
  enableRowSelection?: boolean;
  /** 행 클릭 시 콜백 (체크박스 클릭은 제외됨) */
  onRowClick?: (row: T) => void;
  /** 빈 상태 메시지 */
  emptyMessage?: string;
  /** 서버 페이지네이션 — 모두 제공해야 활성화 */
  serverPagination?: {
    pageIndex: number;
    pageSize: number;
    totalCount: number;
    onPageChange: (pageIndex: number) => void;
    onPageSizeChange?: (size: number) => void;
  };
  /** 선택된 ID로 호출되어 BulkActionBar 내 액션 노드 반환 */
  bulkActions?: (selectedIds: string[], clear: () => void) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  enableRowSelection,
  onRowClick,
  emptyMessage = '데이터가 없습니다.',
  serverPagination,
  bulkActions,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const stableGetRowId = useMemo(
    () => getRowId ?? ((_row: T, idx: number) => String(idx)),
    [getRowId],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection,
    getRowId: stableGetRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: !!serverPagination,
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const clearSelection = () => setRowSelection({});

  const pageCount = serverPagination
    ? Math.max(1, Math.ceil(serverPagination.totalCount / serverPagination.pageSize))
    : 1;

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize?.() }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-12 text-gray-500">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(
                    'hover:bg-gray-50',
                    onRowClick && 'cursor-pointer',
                    row.getIsSelected() && 'bg-gray-50',
                  )}
                  onClick={(e) => {
                    if (!onRowClick) return;
                    // 체크박스/링크/버튼 클릭은 행 클릭으로 인식하지 않음
                    const target = e.target as HTMLElement;
                    if (target.closest('button, a, input, [data-no-row-click]')) return;
                    onRowClick(row.original);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {serverPagination && (
          <Pagination
            pageIndex={serverPagination.pageIndex}
            pageCount={pageCount}
            pageSize={serverPagination.pageSize}
            totalCount={serverPagination.totalCount}
            onPageChange={serverPagination.onPageChange}
            onPageSizeChange={serverPagination.onPageSizeChange}
          />
        )}
      </div>

      {bulkActions && (
        <BulkActionBar count={selectedIds.length} onClear={clearSelection}>
          {bulkActions(selectedIds, clearSelection)}
        </BulkActionBar>
      )}
    </>
  );
}
