import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { ProductsGrid } from './_components/products-grid';
import type { Product } from '@/lib/supabase/types';

export const metadata = { title: '단가표 · 설정' };

export default async function ProductsSettingsPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('media', { ascending: true })
    .order('tier', { ascending: true });

  if (error) {
    return (
      <div>
        <PageHeader title="단가표 관리" />
        <div className="p-8 text-red-600">단가표 로드 실패: {error.message}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="단가표 관리"
        description="매체(네이버 키워드/쇼핑, 카카오 키워드) × 등급(유니크/프리미엄/베이직/라이트) 12개 단가를 관리합니다. 변경 즉시 적용됩니다."
      />
      <div className="p-8 space-y-4">
        <ProductsGrid initialRows={(data ?? []) as Product[]} />
        <p className="text-xs text-gray-500">
          * 단가는 부가세(VAT) 미포함 기준입니다. 모니터링 주기는 견적서에 표기되는 문구입니다 (예: 3~5 분).
        </p>
      </div>
    </div>
  );
}
