import { PageHeader } from '@/components/page-header';
import { CompanyForm } from '../_components/company-form';
import type { CompanyInput } from '@/lib/validation/company';

export const metadata = { title: '거래처 신규 등록 · 에이비딩 관리' };

export default function NewCompanyPage() {
  const defaults: CompanyInput = {
    name: '',
    account_type: 'agency',
    user_database: '',
    user_agency_id: '',
    url: '',
    memo: '',
    is_active: true,
    no: null,
    sub_companies: [],
  };

  return (
    <div>
      <PageHeader
        title="거래처 신규 등록"
        description="거래처 기본 정보 → 세부거래처 → 연락처 순으로 입력합니다."
      />
      <div className="p-8 max-w-5xl">
        <CompanyForm mode="create" defaultValues={defaults} />
      </div>
    </div>
  );
}
