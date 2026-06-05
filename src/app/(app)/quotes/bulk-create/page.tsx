import { PageHeader } from '@/components/page-header';
import { BulkCreateWizard } from './_components/bulk-create-wizard';

export const metadata = { title: '일괄 견적 생성 · 에이비딩 관리' };

export default function BulkCreatePage() {
  return (
    <div>
      <PageHeader
        title="일괄 견적 생성"
        description="기준월 견적을 선택해 다음 달로 복제합니다. 단가는 현재 단가표 기준으로 자동 재적용되며, 신규 견적번호가 발급됩니다."
      />
      <div className="p-8 max-w-5xl">
        <BulkCreateWizard />
      </div>
    </div>
  );
}
