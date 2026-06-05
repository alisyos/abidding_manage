import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="mx-auto mb-4 rounded-full bg-gray-100 p-3 w-fit text-gray-500">
          <FileQuestion className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          요청하신 페이지가 존재하지 않거나 이동/삭제되었을 수 있습니다.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link href="/">홈으로 이동</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
