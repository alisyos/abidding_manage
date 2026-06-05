'use client';

import { useState, useTransition } from 'react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import type { EmailTemplate } from '@/lib/supabase/types';
import { updateEmailTemplate } from '../../../quotes/actions';

interface Props {
  templates: EmailTemplate[];
}

interface DraftState {
  subject: string;
  body_html: string;
  body_text: string;
}

const VARIABLE_HINTS = [
  ['{{period_label}}', '서비스 기간 라벨 (예: 2026.06)'],
  ['{{sender.contact_name}}', '발신자 담당자'],
  ['{{sender.company_name}}', '발신자 회사명'],
  ['{{sender.phone}}', '발신자 연락처'],
  ['{{sender.email}}', '발신자 이메일'],
  ['{{sender.address}}', '발신자 주소'],
  ['{{sender.bank_account}}', '발신자 입금통장'],
  ['{{company.name}}', '수신 거래처명'],
  ['{{quote.quote_no}}', '견적번호'],
  ['{{quote.service_start}}', '서비스 시작일'],
  ['{{quote.service_end}}', '서비스 종료일'],
  ['{{quote.total_amount}}', '견적가 (formatKRW 적용)'],
  ['{{quote.summary_label}}', '견적 요약 라벨 (예: 에이비딩 자동입찰 솔루션 2026.06 견적서 요약_거래처명)'],
  ['{{{quote.items_table_html}}}', '★ 견적 요약 표 HTML (반드시 중괄호 3개! 이스케이프 회피)'],
] as const;

export function TemplatesEditor({ templates }: Props) {
  return (
    <div className="space-y-6">
      {/* 변수 안내 */}
      <Card className="bg-blue-50/40 border-blue-200">
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">사용 가능한 변수</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1 text-xs">
            {VARIABLE_HINTS.map(([token, desc]) => (
              <div key={token} className="flex gap-2">
                <code className="font-mono bg-white px-1.5 py-0.5 rounded text-blue-700">{token}</code>
                <span className="text-gray-600">{desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-gray-400">
            등록된 메일 템플릿이 없습니다. 마이그레이션 시드(0001)에 정의된 quote_default /
            adjustment_default 가 자동 등록되어야 합니다.
          </CardContent>
        </Card>
      ) : (
        templates.map((t) => <TemplateCard key={t.id} template={t} />)
      )}
    </div>
  );
}

function TemplateCard({ template }: { template: EmailTemplate }) {
  const [draft, setDraft] = useState<DraftState>({
    subject: template.subject,
    body_html: template.body_html,
    body_text: template.body_text ?? '',
  });
  const [isPending, startTransition] = useTransition();

  const dirty =
    draft.subject !== template.subject ||
    draft.body_html !== template.body_html ||
    (draft.body_text ?? '') !== (template.body_text ?? '');

  function handleSave() {
    startTransition(async () => {
      const res = await updateEmailTemplate(template.key, {
        subject: draft.subject,
        body_html: draft.body_html,
        body_text: draft.body_text || null,
      });
      if (res.ok) {
        toast.success(`템플릿 [${template.name}] 저장됨`);
      } else {
        toast.error(`저장 실패: ${res.error}`);
      }
    });
  }

  function handleReset() {
    setDraft({
      subject: template.subject,
      body_html: template.body_html,
      body_text: template.body_text ?? '',
    });
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{template.name}</h3>
            <p className="text-[11px] text-gray-500 font-mono mt-0.5">key: {template.key}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={!dirty || isPending}>
              되돌리기
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || isPending}>
              {isPending ? '저장중...' : '저장'}
            </Button>
          </div>
        </div>

        <div>
          <Label className="text-xs">제목 (subject)</Label>
          <Input
            value={draft.subject}
            onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
          />
        </div>
        <div>
          <Label className="text-xs">본문 (HTML)</Label>
          <Textarea
            rows={10}
            className="font-mono text-xs"
            value={draft.body_html}
            onChange={(e) => setDraft((d) => ({ ...d, body_html: e.target.value }))}
          />
        </div>
        <div>
          <Label className="text-xs">본문 (텍스트 폴백)</Label>
          <Textarea
            rows={6}
            className="font-mono text-xs"
            value={draft.body_text}
            onChange={(e) => setDraft((d) => ({ ...d, body_text: e.target.value }))}
          />
        </div>
      </CardContent>
    </Card>
  );
}
