import { Suspense } from 'react';
import { LoginForm } from './_components/login-form';

export const metadata = {
  title: '로그인 · 에이비딩 관리',
};

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">에이비딩 관리 시스템</h1>
        <p className="mt-2 text-sm text-gray-500">로그인하여 계속 진행하세요</p>
      </div>
      <Suspense fallback={<div className="h-48" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
