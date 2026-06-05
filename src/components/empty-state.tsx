import { cn } from '@/lib/utils';
import { Construction } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-16 px-6',
        className,
      )}
    >
      <div className="mb-4 rounded-full bg-gray-100 p-4 text-gray-400">
        {icon ?? <Construction className="h-8 w-8" />}
      </div>
      <p className="text-base font-semibold text-gray-700">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-500 max-w-md">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
