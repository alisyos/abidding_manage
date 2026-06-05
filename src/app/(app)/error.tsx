'use client';

import { useEffect } from 'react';
import { AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[App error]', error);
  }, [error]);

  return (
    <div>
      <PageHeader title="오류 발생" description="이 화면을 표시하는 중에 문제가 발생했습니다." />
      <div className="p-8">
        <div className="max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-red-100 p-2 text-red-700">
              <AlertOctagon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-red-900">
                예상치 못한 오류가 발생했습니다
              </h2>
              <p className="mt-1 text-xs text-red-700">
                잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 문의하세요.
              </p>
              {process.env.NODE_ENV !== 'production' && (
                <pre className="mt-3 text-[11px] text-red-800 bg-white border border-red-200 rounded p-3 overflow-x-auto">
                  {error.message}
                  {error.digest && `\n[digest: ${error.digest}]`}
                </pre>
              )}
              <div className="mt-4">
                <Button size="sm" onClick={() => reset()}>
                  다시 시도
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
