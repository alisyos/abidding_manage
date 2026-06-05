import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { SenderForm } from './_components/sender-form';
import type { SenderInput } from '@/lib/validation/sender';

export const metadata = { title: '발신자 정보 · 설정' };

export default async function SenderSettingsPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('sender_profile')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    return (
      <div>
        <PageHeader title="발신자 / 회사 정보" />
        <div className="p-8 text-red-600">
          발신자 정보 로드 실패: {error?.message ?? '데이터 없음'}
        </div>
      </div>
    );
  }

  const defaults: SenderInput = {
    company_name: data.company_name ?? '',
    contact_name: data.contact_name ?? '',
    phone: data.phone ?? '',
    email: data.email ?? '',
    address: data.address ?? '',
    bank_account: data.bank_account ?? '',
  };

  return (
    <div>
      <PageHeader
        title="발신자 / 회사 정보"
        description="견적서 및 메일에 자동 표기되는 발신처 기본 정보입니다."
      />
      <div className="p-8 max-w-3xl">
        <SenderForm defaultValues={defaults} />
      </div>
    </div>
  );
}
