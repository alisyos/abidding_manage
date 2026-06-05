'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { UploadCloud, FileCheck2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatKRW } from '@/lib/format/currency';
import type {
  SalesImportDryResult,
  SalesImportApplyResult,
} from '@/lib/validation/sales-import';

type Stage = 'idle' | 'parsing' | 'preview' | 'applying' | 'done';

export function SalesImportClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<SalesImportDryResult | null>(null);
  const [apply, setApply] = useState<SalesImportApplyResult | null>(null);

  async function postFile(
    f: File,
    dry: boolean,
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch(`/api/sales/import?dry=${dry}`, {
      method: 'POST',
      body: fd,
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    return { ok: true, data: json };
  }

  async function handleFileSelected(f: File) {
    setFile(f);
    setStage('parsing');
    const res = await postFile(f, true);
    if (!res.ok || !res.data) {
      toast.error(`파싱 실패: ${res.error}`);
      setStage('idle');
      return;
    }
    const data = res.data as { ok: boolean; result: SalesImportDryResult };
    setResult(data.result);
    setStage('preview');
  }

  async function handleConfirm() {
    if (!file) return;
    setStage('applying');
    const res = await postFile(file, false);
    if (!res.ok) {
      toast.error(`적용 실패: ${res.error}`);
      setStage('preview');
      return;
    }
    const data = res.data as { applied: SalesImportApplyResult };
    setApply(data.applied);
    setStage('done');
    toast.success(
      `적용 ${data.applied.applied}건${data.applied.alreadyPaid ? ` · 재발행 ${data.applied.alreadyPaid}건` : ''}${data.applied.notFound.length ? ` · 미매칭 ${data.applied.notFound.length}건` : ''}`,
    );
    setTimeout(() => router.push('/sales'), 1500);
  }

  const totalErrors = result?.errors.length ?? 0;
  const matchedCount =
    result?.preview.filter((p) => p.match.ok).length ?? 0;
  const notFoundCount =
    result?.preview.filter((p) => !p.match.ok).length ?? 0;

  return (
    <div className="space-y-6">
      {/* 1단계 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900">1단계 · 엑셀 파일 선택</h3>
              <p className="mt-1 text-xs text-gray-500">
                필수 컬럼: <code>견적번호 (quote_no)</code>, <code>입금일자 (payment_date, YYYY-MM-DD)</code>
                <br />선택 컬럼: <code>세금계산서번호 (tax_invoice_no)</code>, <code>계산서발행일 (tax_invoice_issued_at)</code>
              </p>
              <label className="mt-3 inline-flex">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xlsm,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) handleFileSelected(f);
                  }}
                />
                <span className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50">
                  {stage === 'parsing' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UploadCloud className="h-4 w-4" />
                  )}
                  {file ? file.name : '파일 선택'}
                </span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2단계 미리보기 */}
      {result && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-semibold text-gray-900">2단계 · 매칭 미리보기</h3>
              <div className="text-xs space-y-0.5 text-right">
                <div>전체: <span className="font-semibold tabular-nums">{result.total}</span></div>
                <div>검증통과: <span className="font-semibold tabular-nums text-green-700">{result.valid}</span></div>
                <div>매칭됨: <span className="font-semibold tabular-nums text-green-700">{matchedCount}</span></div>
                {notFoundCount > 0 && (
                  <div>미매칭: <span className="font-semibold tabular-nums text-amber-700">{notFoundCount}</span></div>
                )}
                {totalErrors > 0 && (
                  <div>오류: <span className="font-semibold tabular-nums text-red-700">{totalErrors}</span></div>
                )}
              </div>
            </div>

            {totalErrors > 0 && (
              <div className="rounded border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-semibold text-red-700 mb-1">검증 오류 (엑셀 수정 후 재시도)</p>
                <ul className="text-[11px] text-red-700 space-y-0.5 max-h-32 overflow-y-auto">
                  {result.errors.slice(0, 30).map((e, i) => (
                    <li key={i}>
                      행 {e.rowIndex}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded border border-gray-200 max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>견적번호</TableHead>
                    <TableHead>회사</TableHead>
                    <TableHead className="text-right">견적가</TableHead>
                    <TableHead>입금일자</TableHead>
                    <TableHead>세계번호</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.preview.slice(0, 100).map((p) => (
                    <TableRow key={p.rowIndex}>
                      <TableCell className="text-xs text-gray-500">{p.rowIndex}</TableCell>
                      <TableCell className="font-mono text-xs">{p.raw.quote_no}</TableCell>
                      <TableCell>
                        {p.match.ok ? p.match.company_name : <span className="text-red-500">{p.match.reason}</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.match.ok ? formatKRW(p.match.total_amount) : '-'}
                      </TableCell>
                      <TableCell className="text-xs">{p.raw.payment_date}</TableCell>
                      <TableCell className="text-xs">{p.raw.tax_invoice_no || '-'}</TableCell>
                      <TableCell>
                        {p.match.ok ? (
                          p.match.already_paid ? (
                            <span className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
                              재발행
                            </span>
                          ) : (
                            <span className="inline-flex rounded bg-green-50 px-1.5 py-0.5 text-[11px] text-green-700">
                              매칭
                            </span>
                          )
                        ) : (
                          <span className="inline-flex rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
                            미매칭
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between gap-3 pt-4 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                {totalErrors === 0
                  ? matchedCount > 0
                    ? `✓ ${matchedCount}건 적용 준비됨${notFoundCount ? ` (미매칭 ${notFoundCount}건은 건너뜀)` : ''}`
                    : '매칭된 견적이 없습니다'
                  : `✗ 총 ${totalErrors}건의 검증 오류가 있습니다`}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFile(null);
                    setResult(null);
                    setStage('idle');
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                >
                  다른 파일 선택
                </Button>
                <Button
                  disabled={totalErrors > 0 || matchedCount === 0 || stage === 'applying' || stage === 'done'}
                  onClick={handleConfirm}
                >
                  {stage === 'applying' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" /> 적용중...
                    </>
                  ) : stage === 'done' ? (
                    <>
                      <FileCheck2 className="h-4 w-4 mr-1" /> 완료
                    </>
                  ) : (
                    '확정 적용'
                  )}
                </Button>
              </div>
            </div>

            {apply && (
              <div className="rounded-md bg-green-50 border border-green-200 p-4 text-sm space-y-1">
                <div>적용: <span className="font-semibold">{apply.applied}건</span></div>
                {apply.alreadyPaid > 0 && (
                  <div>재발행: <span className="font-semibold">{apply.alreadyPaid}건</span></div>
                )}
                {apply.notFound.length > 0 && (
                  <div className="text-amber-700">미매칭: {apply.notFound.length}건</div>
                )}
                {apply.failed.length > 0 && (
                  <div className="text-red-600">
                    실패 {apply.failed.length}건:{' '}
                    <span className="font-mono text-[11px]">
                      {apply.failed.slice(0, 3).map((f) => f.quote_no).join(', ')}
                      {apply.failed.length > 3 ? ' ...' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
