import Link from 'next/link';
import { formatKRW } from '@/lib/format/currency';
import { MEDIA_LABEL, TIER_LABEL } from '@/lib/supabase/types';
import { QuoteStatusBadge } from '@/components/quote/quote-status-badge';
import {
  CELL_KEYS,
  MEDIA_ORDER,
  TIER_ORDER,
  type PivotResult,
} from '@/lib/sales/pivot';
import { cn } from '@/lib/utils';

export function SalesPivotTable({ pivot }: { pivot: PivotResult }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50">
          {/* 1행: 그룹 헤더 (매체 merge) */}
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 border-b border-gray-200" rowSpan={2}>
              거래처
            </th>
            <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b border-gray-200" rowSpan={2}>
              견적번호
            </th>
            <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b border-gray-200" rowSpan={2}>
              상태
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
            <th className="px-3 py-2 text-right font-semibold text-gray-600 border-b border-l border-gray-200" rowSpan={2}>
              기본가액
            </th>
            <th className="px-3 py-2 text-right font-semibold text-gray-600 border-b border-gray-200" rowSpan={2}>
              변동조정
            </th>
            <th className="px-3 py-2 text-right font-semibold text-gray-600 border-b border-gray-200" rowSpan={2}>
              합계
            </th>
            <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b border-gray-200" rowSpan={2}>
              입금일
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
          {pivot.rows.length === 0 ? (
            <tr>
              <td
                colSpan={3 + 12 + 4}
                className="text-center text-gray-400 py-12"
              >
                해당 월의 매출 데이터가 없습니다. 견적 상태를 ‘수주’로 변경하면 자동으로 표시됩니다.
              </td>
            </tr>
          ) : (
            pivot.rows.map((r) => (
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
                    r.variable_adjust < 0 && 'text-red-600',
                  )}
                >
                  {r.variable_adjust === 0 ? '-' : formatKRW(r.variable_adjust)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                  {formatKRW(r.total_amount)}
                </td>
                <td className="px-3 py-1.5 text-gray-700">{r.payment_date ?? '-'}</td>
              </tr>
            ))
          )}
        </tbody>
        {pivot.rows.length > 0 && (
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
                {pivot.totals.variable_adjust === 0
                  ? '-'
                  : formatKRW(pivot.totals.variable_adjust)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-yellow-300">
                {formatKRW(pivot.totals.total_amount)}
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
