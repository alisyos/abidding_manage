import { Loader2 } from 'lucide-react';

export default function AppLoading() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        로딩 중...
      </div>
    </div>
  );
}
