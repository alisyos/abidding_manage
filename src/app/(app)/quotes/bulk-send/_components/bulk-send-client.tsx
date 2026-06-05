'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import Link from 'next/link';
import { Send, Loader2, Check, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatKRW } from '@/lib/format/currency';

export interface DraftRow {
  id: string;
  quote_no: string | null;
  company_name: string;
  sub_company_name: string | null;
  primary_contact: string | null;
  service_start: string;
  service_end: string;
  total_amount: number;
}

interface ProgressItem {
  index: number;
  quote_no: string;
  ok: boolean;
  error?: string;
}

interface SendSummary {
  success: number;
  failed: { id: string; quote_no: string; error: string }[];
}

type Stage = 'idle' | 'sending' | 'done';

export function BulkSendClient({ initialRows }: { initialRows: DraftRow[] }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('idle');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [summary, setSummary] = useState<SendSummary | null>(null);
  const [total, setTotal] = useState(0);

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selectedIds.size === initialRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(initialRows.map((r) => r.id)));
    }
  }

  async function handleStart() {
    if (selectedIds.size === 0) {
      toast.error('발송할 견적을 1건 이상 선택하세요');
      return;
    }
    if (
      !confirm(
        `${selectedIds.size}건의 견적을 실제 수신자에게 발송합니다.\n계속하시겠습니까?`,
      )
    )
      return;

    setStage('sending');
    setProgress([]);
    setSummary(null);
    setTotal(selectedIds.size);

    try {
      const res = await fetch('/api/quotes/bulk-send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok || !res.body) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE 이벤트는 "\n\n" 으로 구분
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          if (!block.trim()) continue;
          let event = '';
          let dataStr = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          let payload: unknown;
          try {
            payload = JSON.parse(dataStr);
          } catch {
            continue;
          }
          if (event === 'init') {
            const p = payload as { total: number };
            setTotal(p.total);
          } else if (event === 'done') {
            setSummary(payload as SendSummary);
            setStage('done');
          } else {
            // 진행 이벤트
            setProgress((prev) => [...prev, payload as ProgressItem]);
          }
        }
      }
    } catch (e) {
      toast.error(`발송 실패: ${(e as Error).message}`);
      setStage('idle');
    } finally {
      router.refresh();
    }
  }

  // 진행 중일 때 진행률 카운트
  const completedCount = progress.length;
  const successCount = progress.filter((p) => p.ok).length;
  const failedCount = progress.filter((p) => !p.ok).length;

  if (stage === 'sending' || stage === 'done') {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">
              {stage === 'sending' ? `발송 중... (${completedCount}/${total})` : '발송 완료'}
            </h2>

            {/* 진행률 바 */}
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${total > 0 ? (completedCount / total) * 100 : 0}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-md bg-gray-50 p-3">
                <p className="text-xs text-gray-500">총</p>
                <p className="text-2xl font-bold tabular-nums">{total}</p>
              </div>
              <div className="rounded-md bg-green-50 p-3">
                <p className="text-xs text-green-700">성공</p>
                <p className="text-2xl font-bold text-green-900 tabular-nums">{successCount}</p>
              </div>
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-xs text-red-700">실패</p>
                <p className="text-2xl font-bold text-red-900 tabular-nums">{failedCount}</p>
              </div>
            </div>

            <div className="rounded-md border border-gray-200 max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">결과</TableHead>
                    <TableHead>견적번호</TableHead>
                    <TableHead>오류</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {progress.map((p) => (
                    <TableRow key={p.index}>
                      <TableCell>
                        {p.ok ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <X className="h-4 w-4 text-red-600" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.quote_no}</TableCell>
                      <TableCell className="text-xs text-red-600">{p.error ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {stage === 'done' && summary && (
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <Button variant="ghost" asChild>
                  <Link href="/quotes/bulk-send">다시 보내기</Link>
                </Button>
                <Button onClick={() => router.push('/quotes?status=sent')}>발송 완료 목록으로</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // idle: 선택 UI
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            발송 대기 견적 ({selectedIds.size}/{initialRows.length} 선택)
          </h2>
          <Button onClick={handleStart} disabled={selectedIds.size === 0} size="lg">
            <Send className="h-4 w-4 mr-1" /> 발송 시작 ({selectedIds.size}건)
          </Button>
        </div>

        {initialRows.length === 0 ? (
          <p className="text-sm text-gray-400 py-12 text-center">
            발송 대기 (임시저장) 견적이 없습니다.
          </p>
        ) : (
          <div className="rounded-md border border-gray-200 max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={
                        selectedIds.size === initialRows.length
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
                  <TableHead>받는사람</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead className="text-right">견적가</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialRows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleId(r.id)}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(r.id)}
                        onCheckedChange={() => toggleId(r.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.quote_no ?? '-'}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.company_name}</div>
                      {r.sub_company_name && (
                        <div className="text-xs text-gray-500">{r.sub_company_name}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {r.primary_contact ?? <span className="text-red-500">(없음)</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.service_start} ~ {r.service_end}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatKRW(r.total_amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
