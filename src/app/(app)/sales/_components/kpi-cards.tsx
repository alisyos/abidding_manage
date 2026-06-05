import { Card, CardContent } from '@/components/ui/card';
import { formatKRW } from '@/lib/format/currency';

interface Props {
  monthLabel: string;
  total: number;
  unpaid: number;
  paid: number;
  count: number;
}

export function KpiCards({ monthLabel, total, unpaid, paid, count }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      <KpiCard label={`${monthLabel} 매출`} value={formatKRW(total)} accent="text-gray-900" />
      <KpiCard label="미입금 합계" value={formatKRW(unpaid)} accent="text-amber-700" />
      <KpiCard label="입금완료 합계" value={formatKRW(paid)} accent="text-green-700" />
      <KpiCard label="견적 건수" value={`${count.toLocaleString()}건`} accent="text-blue-700" />
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`mt-1 text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
