'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { UploadCloud, FileCheck2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ImportDryResult } from '@/lib/validation/import';

type Stage = 'idle' | 'parsing' | 'preview' | 'applying' | 'done';

export function ImportPageClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportDryResult | null>(null);
  const [activeTab, setActiveTab] = useState<keyof ImportDryResult>('master');

  async function postFile(
    f: File,
    dry: boolean,
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch(`/api/companies/import?dry=${dry}`, {
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
    const data = res.data as { ok: boolean; result: ImportDryResult };
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
    const data = res.data as {
      applied: { companies: { upserted: number }; sub_companies: { upserted: number }; contacts: { inserted: number }; usage: { inserted: number }; warnings: string[] };
    };
    setStage('done');
    toast.success(
      `가져오기 완료: 거래처 ${data.applied.companies.upserted} · 세부거래처 ${data.applied.sub_companies.upserted} · 연락처 ${data.applied.contacts.inserted} · 사용량 ${data.applied.usage.inserted}`,
    );
    setTimeout(() => router.push('/companies'), 1500);
  }

  const totalErrors = result
    ? result.master.errors.length +
      result.subCompanies.errors.length +
      result.usage.errors.length +
      result.contacts.errors.length +
      result.draft.errors.length
    : 0;

  return (
    <div className="space-y-6">
      {/* 1단계: 업로드 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900">1단계 · 엑셀 파일 선택</h3>
              <p className="mt-1 text-xs text-gray-500">
                필수 시트: <code>raw</code> · <code>견적서DB</code> · <code>초안</code>
              </p>
              <label className="mt-3 inline-flex">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xlsm,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    // 같은 파일을 다시 선택할 수 있도록 value 리셋
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

      {/* 2단계: 미리보기 */}
      {result && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">2단계 · 미리보기 & 검증</h3>
                <p className="mt-1 text-xs text-gray-500">
                  오류가 있으면 확정 가져오기가 비활성화됩니다.
                </p>
              </div>
              <div className="text-right space-y-1 text-xs">
                <SectionSummary
                  label="거래처 마스터"
                  total={result.master.total}
                  errors={result.master.errors.length}
                />
                <SectionSummary
                  label="세부거래처"
                  total={result.subCompanies.total}
                  errors={result.subCompanies.errors.length}
                />
                <SectionSummary
                  label="연락처"
                  total={result.contacts.total}
                  errors={result.contacts.errors.length}
                />
                <SectionSummary
                  label="월별 사용량"
                  total={result.usage.total}
                  errors={result.usage.errors.length}
                />
                <SectionSummary
                  label="초안(계정/할인율)"
                  total={result.draft.total}
                  errors={result.draft.errors.length}
                />
              </div>
            </div>

            {/* 탭 */}
            <div className="flex gap-1 border-b border-gray-200 mb-3">
              {(
                [
                  ['master', '거래처 마스터'],
                  ['subCompanies', '세부거래처'],
                  ['contacts', '연락처'],
                  ['usage', '월별 사용량'],
                  ['draft', '계정/할인율'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={
                    activeTab === key
                      ? 'px-3 py-2 text-xs font-semibold text-gray-900 border-b-2 border-gray-900 -mb-px'
                      : 'px-3 py-2 text-xs text-gray-500 hover:text-gray-900'
                  }
                >
                  {label} ({result[key].total})
                </button>
              ))}
            </div>

            <SectionPreview section={result[activeTab]} kind={activeTab} />

            <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                {totalErrors === 0
                  ? '✓ 모든 행이 검증을 통과했습니다. 확정 가능합니다.'
                  : `✗ 총 ${totalErrors}건의 오류가 있습니다. 엑셀에서 수정 후 다시 시도하세요.`}
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
                  disabled={totalErrors > 0 || stage === 'applying' || stage === 'done'}
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
                    '확정 가져오기'
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

function SectionSummary({ label, total, errors }: { label: string; total: number; errors: number }) {
  return (
    <div className="text-gray-500">
      {label}:{' '}
      <span className="font-semibold text-gray-900 tabular-nums">{total}</span>
      {errors > 0 && (
        <span className="ml-1 text-red-600 font-semibold">(오류 {errors})</span>
      )}
    </div>
  );
}

function SectionPreview({
  section,
  kind,
}: {
  section: { preview: unknown[]; errors: { rowIndex: number; message: string; raw: unknown }[] };
  kind: 'master' | 'subCompanies' | 'usage' | 'contacts' | 'draft';
}) {
  if (section.errors.length === 0 && section.preview.length === 0) {
    return <p className="text-xs text-gray-400 py-6 text-center">데이터가 없습니다.</p>;
  }

  return (
    <div className="space-y-3">
      {section.errors.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-700 mb-1">
            오류 {section.errors.length}건 — 엑셀에서 해당 셀을 수정 후 다시 업로드하세요.
          </p>
          <ul className="text-[11px] text-red-700 space-y-1 max-h-48 overflow-y-auto">
            {section.errors.slice(0, 50).map((e, i) => (
              <li key={i} className="border-b border-red-100 pb-1 last:border-b-0">
                <div>
                  <span className="font-mono mr-1">#{e.rowIndex}</span>
                  <span className="font-semibold">{e.message}</span>
                </div>
                <div className="text-[10px] text-red-800/80 mt-0.5 font-mono">
                  {renderErrorContext(kind, e.raw)}
                </div>
              </li>
            ))}
            {section.errors.length > 50 && (
              <li className="italic">... 외 {section.errors.length - 50}건</li>
            )}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded border border-gray-200">
        <Table>
          {renderTableHead(kind)}
          <TableBody>
            {section.preview.slice(0, 20).map((row, i) => renderTableRow(kind, row, i))}
          </TableBody>
        </Table>
      </div>
      {section.preview.length > 20 && (
        <p className="text-[11px] text-gray-400 text-center">
          미리보기는 처음 20행만 표시됩니다 (전체 {section.preview.length}행).
        </p>
      )}
    </div>
  );
}

function renderErrorContext(
  kind: 'master' | 'subCompanies' | 'usage' | 'contacts' | 'draft',
  raw: unknown,
): string {
  if (!raw || typeof raw !== 'object') return '';
  const r = raw as Record<string, unknown>;
  const v = (k: string) => (r[k] == null || r[k] === '' ? '∅' : String(r[k]));
  switch (kind) {
    case 'master':
      return `업체명="${v('name')}" / no=${v('no')} / url=${v('url')}`;
    case 'subCompanies':
      return `거래처="${v('company_name')}" / 세부거래처="${v('name')}"`;
    case 'usage':
      return `${v('company_name')} / ${v('sub_company_name')} / ${v('media')}-${v('tier')} × ${v('quantity')}`;
    case 'contacts':
      return `${v('company_name')} / ${v('sub_company_name')} / [${v('role')}] ${v('display_name')} → 이메일="${v('email')}"`;
    case 'draft':
      return `거래처="${v('name')}" / 계정유형=${v('account_type')}`;
  }
}

function renderTableHead(kind: 'master' | 'subCompanies' | 'usage' | 'contacts' | 'draft') {
  switch (kind) {
    case 'master':
      return (
        <TableHeader>
          <TableRow>
            <TableHead>No</TableHead>
            <TableHead>거래처명</TableHead>
            <TableHead>userDatabase</TableHead>
            <TableHead>userAgencyId</TableHead>
            <TableHead>URL</TableHead>
          </TableRow>
        </TableHeader>
      );
    case 'subCompanies':
      return (
        <TableHeader>
          <TableRow>
            <TableHead>거래처</TableHead>
            <TableHead>세부거래처</TableHead>
            <TableHead>database</TableHead>
            <TableHead>agencyId</TableHead>
          </TableRow>
        </TableHeader>
      );
    case 'usage':
      return (
        <TableHeader>
          <TableRow>
            <TableHead>거래처</TableHead>
            <TableHead>세부거래처</TableHead>
            <TableHead>매체</TableHead>
            <TableHead>등급</TableHead>
            <TableHead>개수</TableHead>
            <TableHead>시작</TableHead>
            <TableHead>종료</TableHead>
          </TableRow>
        </TableHeader>
      );
    case 'contacts':
      return (
        <TableHeader>
          <TableRow>
            <TableHead>거래처</TableHead>
            <TableHead>세부거래처</TableHead>
            <TableHead>역할</TableHead>
            <TableHead>담당자</TableHead>
            <TableHead>이메일</TableHead>
          </TableRow>
        </TableHeader>
      );
    case 'draft':
      return (
        <TableHeader>
          <TableRow>
            <TableHead>거래처</TableHead>
            <TableHead>계정유형</TableHead>
          </TableRow>
        </TableHeader>
      );
  }
}

function renderTableRow(
  kind: 'master' | 'subCompanies' | 'usage' | 'contacts' | 'draft',
  row: unknown,
  i: number,
) {
  const r = row as Record<string, unknown>;
  const cell = (v: unknown) => (v == null || v === '' ? <span className="text-gray-300">-</span> : String(v));
  switch (kind) {
    case 'master':
      return (
        <TableRow key={i}>
          <TableCell>{cell(r.no)}</TableCell>
          <TableCell className="font-medium">{cell(r.name)}</TableCell>
          <TableCell>{cell(r.user_database)}</TableCell>
          <TableCell>{cell(r.user_agency_id)}</TableCell>
          <TableCell className="text-xs truncate max-w-xs">{cell(r.url)}</TableCell>
        </TableRow>
      );
    case 'subCompanies':
      return (
        <TableRow key={i}>
          <TableCell>{cell(r.company_name)}</TableCell>
          <TableCell className="font-medium">{cell(r.name)}</TableCell>
          <TableCell>{cell(r.database_code)}</TableCell>
          <TableCell>{cell(r.agency_id)}</TableCell>
        </TableRow>
      );
    case 'usage':
      return (
        <TableRow key={i}>
          <TableCell>{cell(r.company_name)}</TableCell>
          <TableCell>{cell(r.sub_company_name)}</TableCell>
          <TableCell>{cell(r.media)}</TableCell>
          <TableCell>{cell(r.tier)}</TableCell>
          <TableCell className="tabular-nums">{cell(r.quantity)}</TableCell>
          <TableCell className="text-xs">{cell(r.usage_start)}</TableCell>
          <TableCell className="text-xs">{cell(r.usage_end)}</TableCell>
        </TableRow>
      );
    case 'contacts':
      return (
        <TableRow key={i}>
          <TableCell>{cell(r.company_name)}</TableCell>
          <TableCell>{cell(r.sub_company_name)}</TableCell>
          <TableCell>{r.role === 'primary' ? '받는사람' : '참조'}</TableCell>
          <TableCell>{cell(r.display_name)}</TableCell>
          <TableCell className="text-xs font-mono">{cell(r.email)}</TableCell>
        </TableRow>
      );
    case 'draft':
      return (
        <TableRow key={i}>
          <TableCell className="font-medium">{cell(r.name)}</TableCell>
          <TableCell>{r.account_type === 'advertiser' ? '광고주' : r.account_type === 'agency' ? '제휴사' : '-'}</TableCell>
        </TableRow>
      );
  }
}
