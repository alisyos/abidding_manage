'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-toastify';
import { ChevronLeft, ChevronRight, Check, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatKRW } from '@/lib/format/currency';
import { firstDayOfMonth } from '@/lib/quotes/period';
import { bulkCreateQuotes } from '../../actions';
import type { BulkCreateQuotesResult } from '@/lib/validation/bulk';

interface SourceQuote {
  id: string;
  quote_no: string | null;
  company_name: string;
  sub_company_name: string | null;
  service_start: string;
  service_end: string;
  total_amount: number;
}

type Step = 1 | 2 | 3 | 4 | 5;

export function BulkCreateWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  // Step1: 기준월
  const todayMonth = new Date().toISOString().slice(0, 7);
  const [sourceMonth, setSourceMonth] = useState<string>(todayMonth);

  // Step1 -> Step2 진입 시 소스 견적 로드
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceQuotes, setSourceQuotes] = useState<SourceQuote[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  async function loadSources(month: string) {
    setLoadingSources(true);
    try {
      const params = new URLSearchParams({
        month,
        size: '200',
      });
      const res = await fetch(`/api/quotes/list?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setSourceQuotes(json.quotes);
      setSelectedIds(new Set());
    } catch (e) {
      toast.error(`소스 견적 로드 실패: ${(e as Error).message}`);
      setSourceQuotes([]);
    } finally {
      setLoadingSources(false);
    }
  }

  // Step3: target 기간 (기본값: 다음 달 1일 ~ 말일)
  const defaultTarget = useMemo(() => {
    if (!/^\d{4}-\d{2}$/.test(sourceMonth)) {
      return { start: '', end: '' };
    }
    const [yStr, mStr] = sourceMonth.split('-');
    let y = Number(yStr);
    let m = Number(mStr) + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
    const last = new Date(y, m, 0).getDate();
    const endStr = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { start: startStr, end: endStr };
  }, [sourceMonth]);
  const [targetStart, setTargetStart] = useState<string>('');
  const [targetEnd, setTargetEnd] = useState<string>('');

  // sourceMonth가 변경되면 target 기본값 자동 적용
  useEffect(() => {
    setTargetStart(defaultTarget.start);
    setTargetEnd(defaultTarget.end);
  }, [defaultTarget.start, defaultTarget.end]);

  // Step5: 진행
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkCreateQuotesResult | null>(null);

  async function handleConfirm() {
    if (selectedIds.size === 0) {
      toast.error('견적을 1건 이상 선택하세요');
      return;
    }
    setSubmitting(true);
    setStep(5);
    try {
      const res = await bulkCreateQuotes({
        source_month: sourceMonth,
        source_quote_ids: Array.from(selectedIds),
        target_service_start: targetStart,
        target_service_end: targetEnd,
      });
      if (res.ok && res.data) {
        setResult(res.data);
        toast.success(
          `생성 ${res.data.created.length}건${res.data.skipped.length > 0 ? ` · 건너뜀 ${res.data.skipped.length}건` : ''}`,
        );
      } else {
        toast.error(`생성 실패: ${res.error}`);
        setStep(4);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selectedIds.size === sourceQuotes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sourceQuotes.map((q) => q.id)));
    }
  }

  return (
    <div className="space-y-4">
      {/* 스텝 표시 */}
      <div className="flex items-center gap-2 px-2">
        {([1, 2, 3, 4, 5] as Step[]).map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={
                s <= step
                  ? 'w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-semibold'
                  : 'w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs'
              }
            >
              {s < step ? <Check className="h-4 w-4" /> : s}
            </div>
            <span className="ml-2 mr-4 text-xs text-gray-600">
              {s === 1 ? '기준월' : s === 2 ? '소스 선택' : s === 3 ? '대상 기간' : s === 4 ? '미리보기' : '완료'}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: 기준월 */}
      {step === 1 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">1단계 · 기준월 선택</h2>
            <p className="text-xs text-gray-500">
              복제할 견적이 있는 월을 선택하세요. 해당 월의 service_start 가 속한 견적을 모두 불러옵니다.
            </p>
            <div className="max-w-[240px]">
              <Label className="text-xs">기준월</Label>
              <Input
                type="month"
                value={sourceMonth}
                onChange={(e) => setSourceMonth(e.target.value)}
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button
                onClick={async () => {
                  await loadSources(sourceMonth);
                  setStep(2);
                }}
                disabled={!sourceMonth || loadingSources}
              >
                {loadingSources ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                다음 <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: 소스 견적 선택 */}
      {step === 2 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">
              2단계 · 복제할 견적 선택 ({selectedIds.size}/{sourceQuotes.length})
            </h2>
            {sourceQuotes.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                {sourceMonth} 의 견적이 없습니다.
              </p>
            ) : (
              <div className="rounded-md border border-gray-200 max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={
                            selectedIds.size === sourceQuotes.length
                              ? true
                              : selectedIds.size > 0
                              ? 'indeterminate'
                              : false
                          }
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>견적번호</TableHead>
                      <TableHead>거래처</TableHead>
                      <TableHead>기간</TableHead>
                      <TableHead className="text-right">견적가</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sourceQuotes.map((q) => (
                      <TableRow
                        key={q.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => toggleId(q.id)}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(q.id)}
                            onCheckedChange={() => toggleId(q.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{q.quote_no ?? '-'}</TableCell>
                        <TableCell>
                          <div className="font-medium">{q.company_name}</div>
                          {q.sub_company_name && (
                            <div className="text-xs text-gray-500">{q.sub_company_name}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {q.service_start} ~ {q.service_end}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatKRW(q.total_amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> 이전
              </Button>
              <Button onClick={() => setStep(3)} disabled={selectedIds.size === 0}>
                다음 <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: 대상 기간 */}
      {step === 3 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">3단계 · 대상 기간 설정</h2>
            <p className="text-xs text-gray-500">
              새로 생성될 견적의 서비스 시작/종료일. 기본값은 기준월의 다음 달 1일 ~ 말일입니다.
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <div>
                <Label className="text-xs">서비스 시작일 *</Label>
                <Input
                  type="date"
                  value={targetStart}
                  onChange={(e) => setTargetStart(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">서비스 종료일 *</Label>
                <Input
                  type="date"
                  value={targetEnd}
                  onChange={(e) => setTargetEnd(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              단가는 현재 단가표(/settings/products) 기준으로 자동 적용됩니다. 발신자 정보도 현재 값으로 새 스냅샷 캡처.
            </p>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> 이전
              </Button>
              <Button onClick={() => setStep(4)} disabled={!targetStart || !targetEnd}>
                다음 <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: 미리보기 + 확정 */}
      {step === 4 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">4단계 · 확정 미리보기</h2>
            <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-xs space-y-1">
              <div>기준월: <span className="font-semibold">{sourceMonth}</span></div>
              <div>대상 기간: <span className="font-semibold">{targetStart} ~ {targetEnd}</span></div>
              <div>선택 견적: <span className="font-semibold">{selectedIds.size}건</span></div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>원본 견적번호</TableHead>
                  <TableHead>거래처</TableHead>
                  <TableHead className="text-right">기존 견적가</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceQuotes
                  .filter((q) => selectedIds.has(q.id))
                  .map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-mono text-xs">{q.quote_no ?? '-'}</TableCell>
                      <TableCell>
                        {q.company_name}
                        {q.sub_company_name ? ` / ${q.sub_company_name}` : ''}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatKRW(q.total_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            <p className="text-[11px] text-gray-500">
              ⚠ 신규 견적번호는 생성 시점에 자동 발급됩니다. 같은 (거래처, 세부거래처, 시작일) 조합의 견적이 이미 존재하면 해당 건은 건너뜁니다.
            </p>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(3)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> 이전
              </Button>
              <Button onClick={handleConfirm} disabled={submitting} size="lg">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" /> 생성중...
                  </>
                ) : (
                  <>확정 생성 ({selectedIds.size}건)</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: 결과 */}
      {step === 5 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">
              {submitting ? '진행 중...' : '5단계 · 완료'}
            </h2>
            {submitting && (
              <div className="text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> 견적 생성 중...
              </div>
            )}
            {result && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-green-50 border border-green-200 p-4">
                    <p className="text-xs text-green-700">생성됨</p>
                    <p className="text-2xl font-bold text-green-900 tabular-nums">
                      {result.created.length}건
                    </p>
                  </div>
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-4">
                    <p className="text-xs text-amber-700">건너뜀</p>
                    <p className="text-2xl font-bold text-amber-900 tabular-nums">
                      {result.skipped.length}건
                    </p>
                  </div>
                </div>

                {result.created.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">생성된 견적</p>
                    <ul className="text-xs text-gray-600 space-y-0.5 max-h-40 overflow-y-auto">
                      {result.created.map((c, i) => (
                        <li key={i}>
                          <span className="font-mono mr-2">{c.quote_no}</span>
                          {c.company_name} ·{' '}
                          <span className="tabular-nums">{formatKRW(c.total_amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.skipped.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-700 mb-1">건너뜀 사유</p>
                    <ul className="text-xs text-amber-700 space-y-0.5 max-h-40 overflow-y-auto">
                      {result.skipped.map((s, i) => (
                        <li key={i}>
                          <span className="font-mono mr-2">{s.source_quote_no}</span>
                          {s.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                  <Button variant="ghost" asChild>
                    <Link href="/quotes/bulk-create">다시 시작</Link>
                  </Button>
                  <Button onClick={() => router.push('/quotes')}>견적 목록으로</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
