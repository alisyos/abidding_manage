'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Global error]', error);
  }, [error]);

  return (
    <html lang="ko">
      <body className="antialiased bg-gray-50">
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="mx-auto mb-4 rounded-full bg-red-50 p-3 w-fit text-red-600">
              <AlertOctagon className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">예상치 못한 오류가 발생했습니다</h1>
            <p className="mt-2 text-sm text-gray-500">
              잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 문의하세요.
            </p>
            {process.env.NODE_ENV !== 'production' && (
              <pre className="mt-4 text-left text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-3 overflow-x-auto">
                {error.message}
                {error.digest && `\n[digest: ${error.digest}]`}
              </pre>
            )}
            <div className="mt-6 flex gap-2 justify-center">
              <Button variant="outline" onClick={() => reset()}>
                다시 시도
              </Button>
              <Button asChild>
                <Link href="/">홈으로</Link>
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
