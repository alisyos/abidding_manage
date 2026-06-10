import { PageHeader } from '@/components/page-header';
import { ImportPageClient } from './_components/import-page-client';

export const metadata = { title: '거래처 가져오기 · 에이비딩 관리' };

export default function CompaniesImportPage() {
  return (
    <div>
      <PageHeader
        title="거래처 엑셀 대량 등록·수정"
        description="기존 데이터를 다운로드해 엑셀에서 수정하거나, 빈 양식에 신규 거래처를 작성해 업로드합니다. 행의 숨김 ID로 신규/수정을 자동 판별합니다. (거래처 · 세부거래처 · 연락처)"
      />
      <div className="p-8 max-w-6xl">
        <ImportPageClient />
      </div>
    </div>
  );
}
