import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { BulkCreateWizard, type GroupOption } from './_components/bulk-create-wizard';

export const metadata = { title: '일괄 견적 생성 · 에이비딩 관리' };

export default async function BulkCreatePage() {
  const supabase = createClient();
  const { data: groupData } = await supabase
    .from('company_groups')
    .select('id, name')
    .order('name', { ascending: true });
  const groups: GroupOption[] = (groupData ?? []) as GroupOption[];

  return (
    <div>
      <PageHeader
        title="일괄 견적 생성"
        description="기준월 견적을 선택해 다음 달로 복제합니다. 단가는 현재 단가표 기준으로 자동 재적용되며, 신규 견적번호가 발급됩니다."
      />
      <div className="p-8 max-w-5xl">
        <BulkCreateWizard groups={groups} />
      </div>
    </div>
  );
}
