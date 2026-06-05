import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { TemplatesEditor } from './_components/templates-editor';
import type { EmailTemplate } from '@/lib/supabase/types';

export const metadata = { title: '메일 템플릿 · 설정' };

export default async function EmailTemplatesSettingsPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .order('key', { ascending: true });

  if (error) {
    return (
      <div>
        <PageHeader title="메일 템플릿" />
        <div className="p-8 text-red-600">템플릿 로드 실패: {error.message}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="메일 템플릿"
        description="견적서 발송용·조정 안내용 기본 메일 본문을 관리합니다. Mustache 변수를 사용해 동적으로 치환됩니다."
      />
      <div className="p-8 max-w-5xl">
        <TemplatesEditor templates={(data ?? []) as EmailTemplate[]} />
      </div>
    </div>
  );
}
