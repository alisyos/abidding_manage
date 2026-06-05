'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { Send, FlaskConical, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';

interface Props {
  quoteId: string;
  initialTo: string;            // 줄바꿈 구분 문자열
  initialCc: string;
  initialSubject: string;
  initialBodyHtml: string;
  initialBodyText: string;
  loggedInUserEmail: string | null;
}

function parseAddresses(s: string): string[] {
  return s
    .split(/[,\n;]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

export function SendPageClient({
  quoteId,
  initialTo,
  initialCc,
  initialSubject,
  initialBodyHtml,
  initialBodyText,
  loggedInUserEmail,
}: Props) {
  const router = useRouter();
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState(initialCc);
  const [subject, setSubject] = useState(initialSubject);
  const [bodyHtml, setBodyHtml] = useState(initialBodyHtml);
  const [bodyText, setBodyText] = useState(initialBodyText);
  const [isTestSend, setIsTestSend] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const toList = parseAddresses(to);
    const ccList = parseAddresses(cc);

    if (!isTestSend && toList.length === 0) {
      toast.error('수신자를 1명 이상 지정해주세요');
      return;
    }

    // 이메일 형식 검증 (간단)
    const emailRe = /<\s*([^<>]+)\s*>/;
    const normalize = (list: string[]) =>
      list.map((x) => {
        const m = x.match(emailRe);
        return m ? m[1].trim() : x;
      });

    setSending(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to: normalize(toList),
          cc: normalize(ccList),
          subject,
          body_html: bodyHtml,
          body_text: bodyText,
          isTestSend,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(`발송 실패: ${json?.error ?? `HTTP ${res.status}`}`);
        return;
      }
      toast.success(
        isTestSend ? `테스트 메일 발송 완료 → ${loggedInUserEmail ?? '본인'}` : '메일 발송 완료',
      );
      router.push(`/quotes/${quoteId}`);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">메일 미리보기 / 편집</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/quotes/${quoteId}`}>
                <ArrowLeft className="h-4 w-4 mr-1" /> 견적으로 돌아가기
              </Link>
            </Button>
          </div>

          <div>
            <Label className="text-xs">받는사람 (To) {isTestSend && <span className="text-blue-600">— 테스트 모드: 본인에게만 발송됩니다</span>}</Label>
            <Textarea
              rows={2}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={isTestSend}
              placeholder="여러 명은 쉼표/줄바꿈으로 구분"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">참조 (CC)</Label>
            <Textarea
              rows={2}
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              disabled={isTestSend}
              placeholder="여러 명은 쉼표/줄바꿈으로 구분"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">제목</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">본문 (HTML)</Label>
            <Textarea
              rows={10}
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">본문 (텍스트)</Label>
            <Textarea
              rows={6}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* 발송 컨트롤 */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={isTestSend}
                onCheckedChange={(v) => setIsTestSend(!!v)}
              />
              <FlaskConical className="h-4 w-4 text-blue-600" />
              <span>
                테스트 발송 (본인에게만:{' '}
                <span className="font-mono text-blue-700">{loggedInUserEmail ?? '?'}</span>)
              </span>
            </label>
            <Button onClick={handleSend} disabled={sending} size="lg">
              <Send className="h-4 w-4 mr-1" />
              {sending ? '발송중...' : isTestSend ? '테스트 발송' : '실제 발송'}
            </Button>
          </div>
          {!isTestSend && (
            <p className="mt-3 text-xs text-gray-600">
              ⚠ 실제 발송 시 수신자에게 메일이 전송되며, 견적 상태가 자동으로 ‘발송’으로 변경됩니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
