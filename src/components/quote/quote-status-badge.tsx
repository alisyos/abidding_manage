import { cn } from '@/lib/utils';
import { QUOTE_STATUS_LABEL, type QuoteStatus } from '@/lib/supabase/types';

const STYLE: Record<QuoteStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  won: 'bg-green-100 text-green-700',
  paid: 'bg-violet-100 text-violet-700',
};

const DOT: Record<QuoteStatus, string> = {
  draft: 'bg-gray-400',
  sent: 'bg-blue-500',
  won: 'bg-green-500',
  paid: 'bg-violet-500',
};

export function QuoteStatusBadge({ status, className }: { status: QuoteStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        STYLE[status],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT[status])} />
      {QUOTE_STATUS_LABEL[status]}
    </span>
  );
}
