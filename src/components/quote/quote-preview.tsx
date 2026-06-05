import { formatKRW } from '@/lib/format/currency';
import { todayKstISO } from '@/lib/format/date';
import { buildPeriodLabel } from '@/lib/quotes/period';
import {
  MEDIA_LABEL,
  TIER_LABEL,
  TAX_INVOICE_LABEL,
  type Media,
  type Tier,
  type Quote,
  type SenderProfile,
} from '@/lib/supabase/types';

const MEDIA_ORDER: Media[] = ['K', 'S', 'M'];
const TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];

interface QuoteItemSlim {
  media: Media;
  tier: Tier;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Props {
  quote: Quote;
  sender: SenderProfile | Partial<SenderProfile>;
  company: { name: string };
  subCompany?: { name: string } | null;
  primaryContact?: { display_name: string | null; email: string; phone: string | null } | null;
  items: QuoteItemSlim[];
}

/**
 * A4 인쇄용 견적서. 엑셀 시트 레이아웃 모사.
 */
export function QuotePreview({ quote, sender, company, subCompany, primaryContact, items }: Props) {
  const periodLabel = buildPeriodLabel(quote.service_start, quote.service_end);
  const itemMap = new Map<string, QuoteItemSlim>();
  items.forEach((i) => itemMap.set(`${i.media}__${i.tier}`, i));

  return (
    <div className="print-area mx-auto max-w-[210mm] bg-white text-black p-10 text-[12px] leading-relaxed">
      {/* 제목 */}
      <div className="border-b-2 border-black pb-3 mb-6">
        <h1 className="text-2xl font-bold text-center">
          {(sender.company_name ?? '').replace(/^주식회사\s*/, '')} 에이비딩 견적서
        </h1>
        <div className="text-right mt-1 text-[11px] text-gray-600">
          작성일: {todayKstISO()} · 견적번호: {quote.quote_no ?? '-'}
        </div>
      </div>

      {/* 발신처 / 수신처 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Block title="발신처">
          <Row label="회사명" value={sender.company_name ?? '-'} />
          <Row label="담당자" value={sender.contact_name ?? '-'} />
          <Row label="연락처" value={sender.phone ?? '-'} />
          <Row label="이메일" value={sender.email ?? '-'} />
        </Block>
        <Block title="수신처">
          <Row label="회사명" value={company.name} />
          {subCompany && <Row label="세부거래처" value={subCompany.name} />}
          <Row label="담당자" value={primaryContact?.display_name ?? '-'} />
          <Row label="연락처" value={primaryContact?.phone ?? '-'} />
          <Row label="이메일" value={primaryContact?.email ?? '-'} />
        </Block>
      </div>

      {/* 일반사항 */}
      <h2 className="font-bold border-b border-black/40 pb-1 mb-2">일반사항</h2>
      <table className="w-full mb-6 border-collapse">
        <tbody>
          <tr>
            <Cell label className="w-[140px]">서비스 내용</Cell>
            <Cell colSpan={3}>에이비딩</Cell>
          </tr>
          <tr>
            <Cell label>서비스 사용기간</Cell>
            <Cell colSpan={3}>
              {quote.service_start} ~ {quote.service_end} ({periodLabel})
            </Cell>
          </tr>
        </tbody>
      </table>

      {/* 서비스 구성 */}
      <h2 className="font-bold border-b border-black/40 pb-1 mb-2">서비스 구성</h2>
      <table className="w-full mb-6 border-collapse text-[11px]">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 px-2 py-1">매체</th>
            <th className="border border-gray-400 px-2 py-1">등급</th>
            <th className="border border-gray-400 px-2 py-1">수량</th>
            <th className="border border-gray-400 px-2 py-1">단가</th>
            <th className="border border-gray-400 px-2 py-1">금액 (VAT 미포함)</th>
          </tr>
        </thead>
        <tbody>
          {MEDIA_ORDER.flatMap((media) =>
            TIER_ORDER.map((tier) => {
              const it = itemMap.get(`${media}__${tier}`);
              if (!it || it.quantity <= 0) return null;
              return (
                <tr key={`${media}-${tier}`}>
                  <td className="border border-gray-400 px-2 py-1">{MEDIA_LABEL[media]}</td>
                  <td className="border border-gray-400 px-2 py-1">{TIER_LABEL[tier]}</td>
                  <td className="border border-gray-400 px-2 py-1 text-right tabular-nums">
                    {it.quantity}
                  </td>
                  <td className="border border-gray-400 px-2 py-1 text-right tabular-nums">
                    {formatKRW(it.unit_price)}
                  </td>
                  <td className="border border-gray-400 px-2 py-1 text-right tabular-nums">
                    {formatKRW(it.line_total)}
                  </td>
                </tr>
              );
            }),
          ).filter(Boolean)}
        </tbody>
      </table>

      {/* 합계 */}
      <table className="w-full mb-6 border-collapse text-[12px]">
        <tbody>
          {Number(quote.addon_fee) > 0 && (
            <tr>
              <Cell label className="w-[200px]">부가서비스</Cell>
              <Cell className="text-right">{formatKRW(quote.addon_fee)}</Cell>
            </tr>
          )}
          {Number(quote.fixed_adjust) !== 0 && (
            <tr>
              <Cell label>고정 조정가</Cell>
              <Cell className="text-right">{formatKRW(quote.fixed_adjust)}</Cell>
            </tr>
          )}
          {Number(quote.variable_adjust) !== 0 && (
            <tr>
              <Cell label>변동 조정가</Cell>
              <Cell className="text-right">{formatKRW(quote.variable_adjust)}</Cell>
            </tr>
          )}
          {(() => {
            const extra =
              Math.round(Number(quote.base_amount) * Number(quote.extra_discount_rate ?? 0)) +
              Number(quote.extra_discount_amount ?? 0);
            return extra > 0 ? (
              <tr>
                <Cell label>추가 할인{quote.extra_discount_note ? ` (${quote.extra_discount_note})` : ''}</Cell>
                <Cell className="text-right text-rose-600">−{formatKRW(extra)}</Cell>
              </tr>
            ) : null;
          })()}
          <tr>
            <Cell label>기본가 (VAT 미포함)</Cell>
            <Cell className="text-right">{formatKRW(quote.base_amount)}</Cell>
          </tr>
          <tr>
            <Cell label>VAT (10%)</Cell>
            <Cell className="text-right">{formatKRW(quote.vat_amount)}</Cell>
          </tr>
          <tr className="bg-gray-100">
            <Cell label className="font-bold text-base">견적가 (VAT 포함)</Cell>
            <Cell className="text-right font-bold text-base tabular-nums">
              {formatKRW(quote.total_amount)}
            </Cell>
          </tr>
        </tbody>
      </table>

      {/* 입금 안내 */}
      <h2 className="font-bold border-b border-black/40 pb-1 mb-2">입금 안내</h2>
      <table className="w-full mb-6 border-collapse">
        <tbody>
          <tr>
            <Cell label className="w-[140px]">입금통장</Cell>
            <Cell colSpan={3}>
              {quote.bank_account ?? sender.bank_account ?? '-'}
            </Cell>
          </tr>
          {quote.payment_method && (
            <tr>
              <Cell label>입금방식</Cell>
              <Cell colSpan={3}>{quote.payment_method}</Cell>
            </tr>
          )}
          {quote.tax_invoice_type && (
            <tr>
              <Cell label>세금계산서</Cell>
              <Cell colSpan={3}>{TAX_INVOICE_LABEL[quote.tax_invoice_type]} 발행</Cell>
            </tr>
          )}
        </tbody>
      </table>

      {/* 공급회사 */}
      <div className="border-t-2 border-black pt-4 text-[11px] text-gray-700">
        <div className="font-bold text-sm text-black">공급회사</div>
        <div className="mt-1">{sender.company_name ?? '-'}</div>
        <div>{sender.address ?? ''}</div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-300 p-3">
      <div className="font-bold border-b border-gray-300 pb-1 mb-1">{title}</div>
      <table className="w-full">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <td className="text-[11px] text-gray-500 align-top pr-2 py-0.5 w-[70px]">{label}</td>
      <td className="py-0.5">{value || '-'}</td>
    </tr>
  );
}

function Cell({
  children,
  label,
  className,
  colSpan,
}: {
  children: React.ReactNode;
  label?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border border-gray-300 px-2 py-1 ${label ? 'bg-gray-50 font-medium' : ''} ${className ?? ''}`}
    >
      {children}
    </td>
  );
}
