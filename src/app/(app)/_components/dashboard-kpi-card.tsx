import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: string;
  href: string;
  accent?: string;
  icon?: React.ReactNode;
}

export function DashboardKpiCard({ label, value, href, accent, icon }: Props) {
  return (
    <Link href={href}>
      <Card className="transition-all hover:shadow-md hover:border-gray-300 cursor-pointer h-full">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{label}</p>
            {icon && <div className="text-gray-400">{icon}</div>}
          </div>
          <p
            className={cn(
              'mt-2 text-2xl font-bold tabular-nums',
              accent ?? 'text-gray-900',
            )}
          >
            {value}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
