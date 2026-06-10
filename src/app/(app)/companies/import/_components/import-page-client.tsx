'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { UploadCloud, FileCheck2, Loader2, Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { BulkDryResult, BulkApplyResult } from '@/lib/validation/company-bulk';

type Stage = 'idle' | 'parsing' | 'preview' | 'applying' | 'done';

export function ImportPageClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<BulkDryResult | null>(null);

  async function postFile(f: File, dry: boolean) {
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch(`/api/companies/import?dry=${dry}`, { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) return { ok: false as const, error: json?.error ?? `HTTP ${res.status}` };
    return { ok: true as const, data: json };
  }

  async function handleFileSelected(f: File) {
    setFile(f);
    setStage('parsing');
    const res = await postFile(f, true);
    if (!res.ok) {
      toast.error(`파싱 실패: ${res.error}`);
      setStage('idle');
      return;
    }
    setResult((res.data as { result: BulkDryResult }).result);
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
    const applied = (res.data as { applied: BulkApplyResult }).applied;
    setStage('done');
    toast.success(
      `완료 — 거래처 신규 ${applied.companies.inserted}·수정 ${applied.companies.updated} / ` +
        `세부 신규 ${applied.sub_companies.inserted}·수정 ${applied.sub_companies.updated} / ` +
        `연락처 신규 ${applied.contacts.inserted}·수정 ${applied.contacts.updated}`,
    );
    if (applied.warnings.length) {
      toast.warn(`경고 ${applied.warnings.length}건 (콘솔 확인)`);
      // eslint-disable-next-line no-console
      console.warn('대량 반영 경고:', applied.warnings);
    }
    setTimeout(() => router.push('/companies'), 1500);
  }

  const errorCount = result?.errors.length ?? 0;

  return (
    <div className="space-y-6">
      {/* 다운로드 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-emerald-50 p-3 text-emerald-600">
              <Download className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900">1단계 · 양식 다운로드</h3>
              <p className="mt-1 text-xs text-gray-500">
                기존 데이터를 받아 엑셀에서 수정하거나, 빈 양식에 신규 거래처를 작성하세요. 좌측{' '}
                <code>ID</code> 컬럼(숨김)이 있으면 수정, 비어 있으면 신규로 처리됩니다.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href="/api/companies/export" download>
                    <Download className="h-4 w-4 mr-1" /> 전체 데이터 다운로드
                  </a>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <a href="/api/companies/export?template=empty" download>
                    빈 양식 다운로드
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 업로드 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900">2단계 · 엑셀 업로드</h3>
              <p className="mt-1 text-xs text-gray-500">
                다운로드한 양식(<code>거래처</code> 시트)을 수정 후 업로드하세요.
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

      {/* 미리보기 */}
      {result && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">3단계 · 미리보기 & 검증</h3>
                <p className="mt-1 text-xs text-gray-500">오류가 있으면 확정이 비활성화됩니다.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <CountCard label="거래처" insert={result.counts.companies.insert} update={result.counts.companies.update} />
                <CountCard label="세부거래처" insert={result.counts.subCompanies.insert} update={result.counts.subCompanies.update} />
                <CountCard label="연락처" insert={result.counts.contacts.insert} update={result.counts.contacts.update} />
              </div>
            </div>

            {errorCount > 0 && (
              <div className="rounded border border-red-200 bg-red-50 p-3 mb-3">
                <p className="text-xs font-semibold text-red-700 mb-1">
                  오류 {errorCount}건 — 엑셀에서 수정 후 다시 업로드하세요.
                </p>
                <ul className="text-[11px] text-red-700 space-y-1 max-h-48 overflow-y-auto">
                  {result.errors.slice(0, 50).map((e, i) => (
                    <li key={i}>
                      <span className="font-mono mr-1">#{e.rowIndex}</span>
                      <span className="font-semibold">{e.message}</span>
                    </li>
                  ))}
                  {errorCount > 50 && <li className="italic">... 외 {errorCount - 50}건</li>}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto rounded border border-gray-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>구분</TableHead>
                    <TableHead>거래처명</TableHead>
                    <TableHead>세부거래처</TableHead>
                    <TableHead>역할</TableHead>
                    <TableHead>이메일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.preview.map((row, i) => {
                    const r = row as Record<string, unknown>;
                    const isNew = !r.company_id;
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <span
                            className={
                              isNew
                                ? 'text-[10px] font-semibold text-emerald-700'
                                : 'text-[10px] font-semibold text-blue-700'
                            }
                          >
                            {isNew ? '신규' : '수정'}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{cell(r.company_name)}</TableCell>
                        <TableCell>{cell(r.sub_company_name)}</TableCell>
                        <TableCell>
                          {r.role === 'cc' ? '참조' : r.role === 'primary' ? '받는사람' : '-'}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{cell(r.email)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              전체 {result.totalRows}행 중 유효 {result.validRows}행. 미리보기는 처음 30행만 표시.
            </p>

            <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                {errorCount === 0
                  ? '✓ 모든 행이 검증을 통과했습니다. 확정 가능합니다.'
                  : `✗ 총 ${errorCount}건의 오류가 있습니다.`}
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
                  disabled={errorCount > 0 || stage === 'applying' || stage === 'done'}
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
                    '확정 반영'
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function cell(v: unknown) {
  return v == null || v === '' ? <span className="text-gray-300">-</span> : String(v);
}

function CountCard({ label, insert, update }: { label: string; insert: number; update: number }) {
  return (
    <div className="rounded-md border border-gray-200 px-3 py-2 text-center">
      <p className="text-gray-500">{label}</p>
      <p className="mt-0.5">
        <span className="font-semibold text-emerald-700 tabular-nums">신규 {insert}</span>
        <span className="mx-1 text-gray-300">·</span>
        <span className="font-semibold text-blue-700 tabular-nums">수정 {update}</span>
      </p>
    </div>
  );
}
