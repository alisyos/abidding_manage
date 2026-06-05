import { PageHeader } from '@/components/page-header';
import { ImportPageClient } from './_components/import-page-client';

export const metadata = { title: '거래처 가져오기 · 에이비딩 관리' };

export default function CompaniesImportPage() {
  return (
    <div>
      <PageHeader
        title="거래처 엑셀 가져오기"
        description="레거시 xlsm 양식(raw / 견적서DB / 초안 시트)을 그대로 업로드하여 일괄 등록합니다. 이름 기준 upsert — 기존 거래처는 업데이트, 신규는 추가."
      />
      <div className="p-8 max-w-6xl">
        <ImportPageClient />
      </div>
    </div>
  );
}
