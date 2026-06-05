import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil, Printer, Send, ExternalLink } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createClient } from '@/lib/supabase/server';
import { QuoteStatusBadge } from '@/components/quote/quote-status-badge';
import { StatusChangeMenu } from '../_components/status-change-menu';
import { formatKRW } from '@/lib/format/currency';
import { formatKstDate, formatKstDateTime } from '@/lib/format/date';
import { buildPeriodLabel } from '@/lib/quotes/period';
import {
  MEDIA_LABEL,
  TIER_LABEL,
  TAX_INVOICE_LABEL,
  type Media,
  type Tier,
  type QuoteStatus,
  type EmailStatus,
  type EmailKind,
} from '@/lib/supabase/types';

interface PageProps {
  params: { id: string };
}

const MEDIA_ORDER: Media[] = ['K', 'S', 'M'];
const TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];
const EMAIL_KIND_LABEL: Record<EmailKind, string> = {
  quote: '견적서',
  adjustment: '조정 안내',
  reminder: '리마인드',
};
const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  queued: '대기',
  sent: '발송 완료',
  failed: '실패',
};

export default async function QuoteDetailPage({ params }: PageProps) {
  const supabase = createClient();

  type QuoteRow = {
    id: string;
    quote_no: string | null;
    status: QuoteStatus;
    service_start: string;
    service_end: string;
    addon_fee: number;
    fixed_adjust: number;
    variable_adjust: number;
    extra_discount_rate: number;
    extra_discount_amount: number;
    extra_discount_note: string | null;
    base_amount: number;
    vat_amount: number;
    total_amount: number;
    bank_account: string | null;
    payment_method: string | null;
    tax_invoice_type: 'receipt' | 'claim' | null;
    notes: string | null;
    sent_at: string | null;
    won_at: string | null;
    paid_at: string | null;
    companies: { id: string; name: string };
    sub_companies: { id: string; name: string } | null;
  };
  const { data: qRaw, error: qErr } = await supabase
    .from('quotes')
    .select(
      `id, quote_no, status, service_start, service_end, addon_fee,
       fixed_adjust, variable_adjust,
       extra_discount_rate, extra_discount_amount, extra_discount_note,
       base_amount, vat_amount, total_amount,
       bank_account, payment_method, tax_invoice_type, notes,
       sent_at, won_at, paid_at,
       companies(id, name), sub_companies(id, name)`,
    )
    .eq('id', params.id)
    .single();

  if (qErr || !qRaw) notFound();
  const q = qRaw as unknown as QuoteRow;

  type ItemRow = { media: Media; tier: Tier; quantity: number; unit_price: number; line_total: number };
  const { data: itemsRaw } = await supabase
    .from('quote_items')
    .select('media, tier, quantity, unit_price, line_total')
    .eq('quote_id', params.id);
  const items = (itemsRaw ?? []) as unknown as ItemRow[];

  type EmailRow = {
    id: string;
    kind: EmailKind;
    to_addresses: string[];
    cc_addresses: string[];
    subject: string;
    status: EmailStatus;
    error: string | null;
    sent_at: string | null;
    created_at: string;
  };
  const { data: emailsRaw } = await supabase
    .from('quote_emails')
    .select('id, kind, to_addresses, cc_addresses, subject, status, error, sent_at, created_at')
    .eq('quote_id', params.id)
    .order('created_at', { ascending: false })
    .limit(20);
  const emails = (emailsRaw ?? []) as unknown as EmailRow[];

  const periodLabel = buildPeriodLabel(q.service_start, q.service_end);

  // 12행 정렬용 인덱싱
  const itemMap = new Map<string, ItemRow>();
  items.forEach((i) => itemMap.set(`${i.media}__${i.tier}`, i));

  return (
    <div>
      <PageHeader
        title={`견적 ${q.quote_no ?? ''}`}
        description={`${q.companies.name}${q.sub_companies ? ` · ${q.sub_companies.name}` : ''} · ${periodLabel}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/quotes/${params.id}/edit`}>
                <Pencil className="h-4 w-4 mr-1" /> 편집
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/quotes/${params.id}/preview`} target="_blank">
                <Printer className="h-4 w-4 mr-1" /> 미리보기
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/quotes/${params.id}/send`}>
                <Send className="h-4 w-4 mr-1" /> 발송
              </Link>
            </Button>
          </>
        }
      />

      <div className="p-8 max-w-6xl space-y-6">
        {/* 기본 정보 + 상태 */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <QuoteStatusBadge status={q.status} />
                <span className="text-xs text-gray-500">
                  {q.sent_at && <>발송: {formatKstDate(q.sent_at)}</>}
                  {q.won_at && <span className="ml-3">수주: {formatKstDate(q.won_at)}</span>}
                  {q.paid_at && <span className="ml-3">입금: {formatKstDate(q.paid_at)}</span>}
                </span>
              </div>
              <StatusChangeMenu quoteId={params.id} current={q.status} />
            </div>

            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
              <InfoRow label="견적번호" value={<span className="font-mono">{q.quote_no ?? '-'}</span>} />
              <InfoRow
                label="거래처"
                value={
                  <Link href={`/companies/${q.companies.id}`} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                    {q.companies.name}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                }
              />
              <InfoRow label="세부거래처" value={q.sub_companies?.name ?? '-'} />
              <InfoRow label="기간" value={`${q.service_start} ~ ${q.service_end}`} />
              <InfoRow label="입금통장" value={q.bank_account ?? '-'} />
              <InfoRow label="입금방식" value={q.payment_method ?? '-'} />
              <InfoRow
                label="세금계산서"
                value={q.tax_invoice_type ? TAX_INVOICE_LABEL[q.tax_invoice_type] : '-'}
              />
              {q.notes && (
                <div className="col-span-full">
                  <dt className="text-xs text-gray-500">메모</dt>
                  <dd className="mt-1 text-gray-700 whitespace-pre-wrap">{q.notes}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* 금액 요약 */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">금액 요약</h2>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              <InfoRow label="기본가" value={formatKRW(q.base_amount)} mono />
              <InfoRow label="부가서비스" value={formatKRW(q.addon_fee)} mono />
              <InfoRow label="고정 조정가" value={formatKRW(q.fixed_adjust)} mono />
              <InfoRow label="변동 조정가" value={formatKRW(q.variable_adjust)} mono />
              {(Number(q.extra_discount_rate) > 0 || Number(q.extra_discount_amount) > 0) && (
                <InfoRow
                  label="추가 할인"
                  value={
                    <span className="text-rose-600">
                      −{formatKRW(
                        Math.round(Number(q.base_amount) * Number(q.extra_discount_rate)) +
                          Number(q.extra_discount_amount),
                      )}
                      {Number(q.extra_discount_rate) > 0 &&
                        ` (${(Number(q.extra_discount_rate) * 100).toFixed(1)}%${
                          Number(q.extra_discount_amount) > 0
                            ? ` + ${formatKRW(q.extra_discount_amount)}`
                            : ''
                        })`}
                    </span>
                  }
                />
              )}
              <InfoRow label="VAT (10%)" value={formatKRW(q.vat_amount)} mono />
              {q.extra_discount_note && (
                <div className="col-span-full">
                  <dt className="text-xs text-gray-500">추가 할인 사유</dt>
                  <dd className="mt-1 text-sm text-gray-700">{q.extra_discount_note}</dd>
                </div>
              )}
              <div className="col-span-full pt-3 border-t border-gray-100">
                <dt className="text-xs text-gray-500">견적가 (VAT 포함)</dt>
                <dd className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
                  {formatKRW(q.total_amount)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* 품목 */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">견적 항목</h2>
            {items.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">품목이 없습니다.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>매체</TableHead>
                    <TableHead>등급</TableHead>
                    <TableHead className="text-right">수량</TableHead>
                    <TableHead className="text-right">단가</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MEDIA_ORDER.flatMap((media) =>
                    TIER_ORDER.map((tier) => {
                      const it = itemMap.get(`${media}__${tier}`);
                      if (!it || it.quantity <= 0) return null;
                      return (
                        <TableRow key={`${media}-${tier}`}>
                          <TableCell>{MEDIA_LABEL[media]}</TableCell>
                          <TableCell>{TIER_LABEL[tier]}</TableCell>
                          <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatKRW(it.unit_price)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {formatKRW(it.line_total)}
                          </TableCell>
                        </TableRow>
                      );
                    }),
                  ).filter(Boolean)}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 발송 이력 */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">발송 이력</h2>
            {emails.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">발송 이력이 없습니다.</p>
            ) : (
              <ul className="space-y-3">
                {emails.map((e) => (
                  <li
                    key={e.id}
                    className="border-l-2 border-gray-200 pl-4 py-1 text-sm"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={
                          e.status === 'sent'
                            ? 'inline-flex rounded bg-green-50 px-1.5 py-0.5 text-[11px] text-green-700'
                            : e.status === 'failed'
                              ? 'inline-flex rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700'
                              : 'inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600'
                        }
                      >
                        {EMAIL_STATUS_LABEL[e.status]}
                      </span>
                      <span className="text-[11px] text-gray-500">{EMAIL_KIND_LABEL[e.kind]}</span>
                      <span className="text-[11px] text-gray-400 ml-auto">
                        {formatKstDateTime(e.sent_at ?? e.created_at)}
                      </span>
                    </div>
                    <div className="font-medium text-gray-900">{e.subject}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      받는사람: {e.to_addresses.slice(0, 2).join(', ')}
                      {e.to_addresses.length > 2 && ` 외 ${e.to_addresses.length - 2}명`}
                      {e.cc_addresses.length > 0 && (
                        <>
                          {' '}
                          / 참조 {e.cc_addresses.length}명
                        </>
                      )}
                    </div>
                    {e.error && (
                      <div className="mt-1 text-xs text-red-600 font-mono">{e.error}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`mt-0.5 text-gray-900 ${mono ? 'tabular-nums' : ''}`}>{value}</dd>
    </div>
  );
}
