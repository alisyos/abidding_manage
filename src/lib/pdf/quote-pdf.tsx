import 'server-only';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

import { formatKRW } from '@/lib/format/currency';
import { buildPeriodLabel } from '@/lib/quotes/period';
import { todayKstISO } from '@/lib/format/date';
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

interface QuoteItem {
  media: Media;
  tier: Tier;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface QuotePdfProps {
  quote: Quote;
  sender: Partial<SenderProfile>;
  company: { name: string };
  subCompany?: { name: string } | null;
  primaryContact?: {
    display_name: string | null;
    email: string;
    phone: string | null;
  } | null;
  items: QuoteItem[];
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 28,
    fontFamily: 'Pretendard',
    fontSize: 10,
    color: '#171717',
  },
  // 제목 영역
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 8,
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    textAlign: 'center',
  },
  headerMeta: {
    fontSize: 9,
    color: '#666',
    textAlign: 'right',
    marginTop: 4,
  },
  // 발신처 / 수신처
  twoCol: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  block: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cccccc',
    padding: 8,
  },
  blockTitle: {
    fontWeight: 700,
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
    paddingBottom: 3,
    marginBottom: 3,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 1.5,
  },
  rowLabel: {
    width: 60,
    fontSize: 9,
    color: '#666',
  },
  rowValue: {
    flex: 1,
    fontSize: 10,
  },
  // 섹션 헤더
  sectionH2: {
    fontWeight: 700,
    fontSize: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#999999',
    paddingBottom: 3,
    marginBottom: 5,
  },
  // 일반 표 (1열 라벨 + 1열 값)
  infoTable: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  infoRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
  },
  infoRowLast: {
    flexDirection: 'row',
  },
  infoLabel: {
    width: 100,
    backgroundColor: '#f5f5f5',
    fontWeight: 500,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: '#cccccc',
  },
  infoValue: {
    flex: 1,
    padding: 4,
  },
  // 항목 표 (헤더 + 데이터)
  itemsTable: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#999999',
  },
  itemsHeader: {
    flexDirection: 'row',
    backgroundColor: '#e8e8e8',
    fontWeight: 700,
    fontSize: 9,
  },
  itemsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#cccccc',
    fontSize: 9,
  },
  th: {
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: '#999999',
    textAlign: 'center',
  },
  td: {
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: '#cccccc',
  },
  thLast: { padding: 4, textAlign: 'center' },
  tdLast: { padding: 4 },
  // 합계 표 (라벨 + 우측 정렬 값)
  totalsTable: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  totalsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
  },
  totalsRowEmphasis: {
    flexDirection: 'row',
    backgroundColor: '#e8e8e8',
  },
  totalsLabel: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 4,
    fontWeight: 500,
    borderRightWidth: 1,
    borderRightColor: '#cccccc',
  },
  totalsLabelEmphasis: {
    flex: 1,
    backgroundColor: '#e8e8e8',
    padding: 5,
    fontWeight: 700,
    fontSize: 12,
    borderRightWidth: 1,
    borderRightColor: '#cccccc',
  },
  totalsValue: {
    width: 140,
    padding: 4,
    textAlign: 'right',
  },
  totalsValueEmphasis: {
    width: 140,
    padding: 5,
    textAlign: 'right',
    fontWeight: 700,
    fontSize: 12,
  },
  // 공급회사 푸터
  footer: {
    borderTopWidth: 2,
    borderTopColor: '#000',
    paddingTop: 10,
    fontSize: 9,
    color: '#444',
  },
  footerTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#000',
    marginBottom: 3,
  },
});

export function QuotePdfDocument(props: QuotePdfProps) {
  const { quote, sender, company, subCompany, primaryContact, items } = props;
  const periodLabel = buildPeriodLabel(quote.service_start, quote.service_end);

  const itemMap = new Map<string, QuoteItem>();
  items.forEach((i) => itemMap.set(`${i.media}__${i.tier}`, i));
  const visibleRows = MEDIA_ORDER.flatMap((media) =>
    TIER_ORDER.map((tier) => {
      const it = itemMap.get(`${media}__${tier}`);
      return it && it.quantity > 0 ? it : null;
    }).filter((x): x is QuoteItem => x !== null),
  );

  const senderCompanyShort = (sender.company_name ?? '').replace(/^주식회사\s*/, '');

  return (
    <Document
      title={`견적서 ${quote.quote_no ?? ''}`}
      author={sender.company_name ?? ''}
      subject={`에이비딩 자동입찰 솔루션 ${periodLabel} 견적서`}
    >
      <Page size="A4" style={styles.page}>
        {/* 제목 */}
        <View style={styles.header}>
          <Text style={styles.title}>{senderCompanyShort} 에이비딩 견적서</Text>
          <Text style={styles.headerMeta}>
            작성일: {todayKstISO()} · 견적번호: {quote.quote_no ?? '-'}
          </Text>
        </View>

        {/* 발신처 / 수신처 */}
        <View style={styles.twoCol}>
          <View style={styles.block}>
            <Text style={styles.blockTitle}>발신처</Text>
            <RowKV label="회사명" value={sender.company_name ?? '-'} />
            <RowKV label="담당자" value={sender.contact_name ?? '-'} />
            <RowKV label="연락처" value={sender.phone ?? '-'} />
            <RowKV label="이메일" value={sender.email ?? '-'} />
          </View>
          <View style={styles.block}>
            <Text style={styles.blockTitle}>수신처</Text>
            <RowKV label="회사명" value={company.name} />
            {subCompany && <RowKV label="세부거래처" value={subCompany.name} />}
            <RowKV label="담당자" value={primaryContact?.display_name ?? '-'} />
            <RowKV label="연락처" value={primaryContact?.phone ?? '-'} />
            <RowKV label="이메일" value={primaryContact?.email ?? '-'} />
          </View>
        </View>

        {/* 일반사항 */}
        <Text style={styles.sectionH2}>일반사항</Text>
        <View style={styles.infoTable}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>서비스 내용</Text>
            <Text style={styles.infoValue}>에이비딩</Text>
          </View>
          <View style={styles.infoRowLast}>
            <Text style={styles.infoLabel}>서비스 사용기간</Text>
            <Text style={styles.infoValue}>
              {quote.service_start} ~ {quote.service_end} ({periodLabel})
            </Text>
          </View>
        </View>

        {/* 서비스 구성 */}
        <Text style={styles.sectionH2}>서비스 구성</Text>
        <View style={styles.itemsTable}>
          <View style={styles.itemsHeader}>
            <Text style={[styles.th, { width: 80 }]}>매체</Text>
            <Text style={[styles.th, { width: 70 }]}>등급</Text>
            <Text style={[styles.th, { width: 60 }]}>수량</Text>
            <Text style={[styles.th, { width: 100 }]}>단가</Text>
            <Text style={[styles.thLast, { flex: 1 }]}>금액 (VAT 미포함)</Text>
          </View>
          {visibleRows.length === 0 ? (
            <View style={styles.itemsRow}>
              <Text style={[styles.tdLast, { flex: 1, textAlign: 'center', color: '#999' }]}>
                품목 없음
              </Text>
            </View>
          ) : (
            visibleRows.map((it, idx) => (
              <View key={`${it.media}-${it.tier}-${idx}`} style={styles.itemsRow}>
                <Text style={[styles.td, { width: 80 }]}>{MEDIA_LABEL[it.media]}</Text>
                <Text style={[styles.td, { width: 70 }]}>{TIER_LABEL[it.tier]}</Text>
                <Text style={[styles.td, { width: 60, textAlign: 'right' }]}>{it.quantity}</Text>
                <Text style={[styles.td, { width: 100, textAlign: 'right' }]}>
                  {formatKRW(it.unit_price)}
                </Text>
                <Text style={[styles.tdLast, { flex: 1, textAlign: 'right' }]}>
                  {formatKRW(it.line_total)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* 합계 */}
        <View style={styles.totalsTable}>
          {Number(quote.addon_fee) > 0 && (
            <TotalRow label="부가서비스" value={formatKRW(quote.addon_fee)} />
          )}
          {Number(quote.fixed_adjust) !== 0 && (
            <TotalRow label="고정 조정가" value={formatKRW(quote.fixed_adjust)} />
          )}
          {Number(quote.variable_adjust) !== 0 && (
            <TotalRow label="변동 조정가" value={formatKRW(quote.variable_adjust)} />
          )}
          <TotalRow label="기본가 (VAT 미포함)" value={formatKRW(quote.base_amount)} />
          <TotalRow label="VAT (10%)" value={formatKRW(quote.vat_amount)} />
          <View style={styles.totalsRowEmphasis}>
            <Text style={styles.totalsLabelEmphasis}>견적가 (VAT 포함)</Text>
            <Text style={styles.totalsValueEmphasis}>{formatKRW(quote.total_amount)}</Text>
          </View>
        </View>

        {/* 입금 안내 */}
        <Text style={styles.sectionH2}>입금 안내</Text>
        <View style={styles.infoTable}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>입금통장</Text>
            <Text style={styles.infoValue}>
              {quote.bank_account ?? sender.bank_account ?? '-'}
            </Text>
          </View>
          {quote.payment_method && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>입금방식</Text>
              <Text style={styles.infoValue}>{quote.payment_method}</Text>
            </View>
          )}
          {quote.tax_invoice_type && (
            <View style={styles.infoRowLast}>
              <Text style={styles.infoLabel}>세금계산서</Text>
              <Text style={styles.infoValue}>
                {TAX_INVOICE_LABEL[quote.tax_invoice_type]} 발행
              </Text>
            </View>
          )}
          {!quote.payment_method && !quote.tax_invoice_type && (
            // 마지막 행 보더 처리 위한 빈 placeholder
            <View style={{ height: 0 }} />
          )}
        </View>

        {/* 공급회사 */}
        <View style={styles.footer}>
          <Text style={styles.footerTitle}>공급회사</Text>
          <Text>{sender.company_name ?? '-'}</Text>
          {sender.address && <Text>{sender.address}</Text>}
        </View>
      </Page>
    </Document>
  );
}

function RowKV({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || '-'}</Text>
    </View>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalsRow}>
      <Text style={styles.totalsLabel}>{label}</Text>
      <Text style={styles.totalsValue}>{value}</Text>
    </View>
  );
}
