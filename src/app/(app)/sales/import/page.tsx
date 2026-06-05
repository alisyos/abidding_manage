import { PageHeader } from '@/components/page-header';
import { SalesImportClient } from './_components/sales-import-client';

export const metadata = { title: '입금 가져오기 · 에이비딩 관리' };

export default function SalesImportPage() {
  return (
    <div>
      <PageHeader
        title="입금 일괄 가져오기"
        description="견적번호(quote_no) 기준으로 입금일자/세금계산서를 일괄 갱신합니다. 매칭된 견적은 자동으로 '입금확인(paid)' 상태로 전환됩니다."
      />
      <div className="p-8 max-w-5xl">
        <SalesImportClient />
      </div>
    </div>
  );
}
