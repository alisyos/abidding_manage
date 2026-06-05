import { cn } from '@/lib/utils';

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-green-500' : 'bg-gray-400')} />
      {active ? '활성' : '비활성'}
    </span>
  );
}
