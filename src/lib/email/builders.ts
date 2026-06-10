import { renderEmailTemplate, type RenderedEmail } from './templates';
import { buildPeriodLabel } from '@/lib/quotes/period';
import { computeExtraDiscount } from '@/lib/quotes/calculator';
import { formatKRW } from '@/lib/format/currency';
import { generateFormattedAddress } from '@/lib/format/contact';
import { MEDIA_LABEL, MEDIA_SHORT_LABEL, TIER_LABEL, type Tier } from '@/lib/supabase/types';
import type {
  CompanyContact,
  EmailTemplate,
  Media,
  Quote,
  QuoteAdjustment,
  SenderProfile,
} from '@/lib/supabase/types';

interface QuoteItemLite {
  media: Media;
  tier: Tier;
  quantity: number;
  /** 견적에 적용된 단가 (할인 적용 시 할인가, 미적용 시 공시가) */
  unit_price: number;
  line_total: number;
  /** 신규 정책 표 표시용 — 현재 공시 단가. 없으면 절약액 = 0 처리 */
  list_price?: number;
}

interface BuildQuoteEmailArgs {
  quote: Quote;
  sender: SenderProfile | Partial<SenderProfile>; // sender_snapshot or current
  company: { name: string };
  subCompany?: { name: string } | null;
  contacts: CompanyContact[];
  /** 견적 품목. 메일 본문 견적 요약 표 생성에 사용. 비어 있으면 0/'-' 로 채워진 빈 표 출력 */
  items?: QuoteItemLite[];
  template: EmailTemplate;
}

export interface BuiltEmail extends RenderedEmail {
  to: string[];
  cc: string[];
}

/**
 * 견적서 메일 빌더.
 *  - to: contacts.role='primary'
 *  - cc: contacts.role='cc' (sort_order 오름차순)
 *  - 각 contact 의 formatted_address 우선, 없으면 자동 생성.
 *  - 템플릿 변수 채워서 mustache 렌더.
 */
export function buildQuoteEmail(args: BuildQuoteEmailArgs): BuiltEmail {
  const { quote, sender, company, contacts, template, items = [] } = args;

  const sortedContacts = [...contacts].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'primary' ? -1 : 1;
    return a.sort_order - b.sort_order;
  });

  const toContacts = sortedContacts.filter((c) => c.role === 'primary');
  const ccContacts = sortedContacts.filter((c) => c.role === 'cc');

  const to = toContacts.map((c) => contactAddress(c, company.name));
  const cc = ccContacts.map((c) => contactAddress(c, company.name));

  const periodLabel = buildPeriodLabel(quote.service_start, quote.service_end);
  const summaryLabel = `에이비딩 자동입찰 솔루션 ${periodLabel} 견적서 요약_${company.name}`;
  const itemsTableHtml = buildQuoteItemsTableHtml(items, quote);

  const rendered = renderEmailTemplate(template, {
    period_label: periodLabel,
    sender: {
      contact_name: sender.contact_name ?? '',
      company_name: sender.company_name ?? '',
      phone: sender.phone ?? '',
      email: sender.email ?? '',
      bank_account: sender.bank_account ?? '',
      address: sender.address ?? '',
    },
    company: {
      name: company.name,
    },
    quote: {
      quote_no: quote.quote_no ?? '',
      service_start: quote.service_start,
      service_end: quote.service_end,
      total_amount: formatKRW(Number(quote.total_amount ?? 0)),
      summary_label: summaryLabel,
      items_table_html: itemsTableHtml,
    },
  });

  return { to, cc, ...rendered };
}

// ───────────────────────────────────────────────────────────────
// 견적 요약 표 HTML 생성
// ───────────────────────────────────────────────────────────────
const TABLE_MEDIA_ORDER: { key: Media; label: string }[] = [
  { key: 'K', label: '네이버<br/>키워드' },
  { key: 'S', label: '네이버<br/>쇼핑' },
  { key: 'M', label: '카카오<br/>키워드' },
];
const TABLE_TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];

function fmtQty(n: number): string {
  return n > 0 ? n.toLocaleString('ko-KR') : '-';
}
function fmtAmt(n: number): string {
  return n !== 0 ? n.toLocaleString('ko-KR') : '-';
}

/**
 * PDF 예시와 동일한 견적 요약 표 HTML 생성.
 *  - 행: 매체 3개 (K/S/M)
 *  - 열: 등급4 + 부가기능 + 매체별 기본가/조정가 + 통합 이용료/견적가
 *  - 부가기능/이용료/견적가 셀은 rowspan=3 으로 첫 행에만 출력
 *  - 신규 정책에서 매체별 조정가 = 절약액 (할인 적용 시 매체별 Σ qty × (list-affiliate) × -1)
 *  - 이용료(rowspan) = adjusted = total_amount − vat_amount
 *  - 견적가(rowspan) = total_amount (VAT 포함)
 *  - 0/0원 셀은 '-' 표시
 *  - inline CSS (Gmail/Outlook 호환)
 */
export function buildQuoteItemsTableHtml(
  items: QuoteItemLite[],
  quote: Quote,
): string {
  // 매체×등급별 수량 매핑
  const qtyMap = new Map<string, number>();
  // 매체별 기본가 합계 (이미 적용된 단가 기준)
  const baseByMedia = new Map<Media, number>();
  // 매체별 절약액 (할인 적용 시 list - affiliate 차액의 합, 미적용 시 0)
  const savingsByMedia = new Map<Media, number>();
  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    qtyMap.set(`${it.media}__${it.tier}`, qty);
    baseByMedia.set(
      it.media,
      (baseByMedia.get(it.media) ?? 0) + (Number(it.line_total) || 0),
    );
    if (it.list_price != null) {
      const savings = (Number(it.list_price) - Number(it.unit_price)) * qty;
      if (savings > 0) {
        savingsByMedia.set(it.media, (savingsByMedia.get(it.media) ?? 0) + savings);
      }
    }
  }

  const addonFee = Number(quote.addon_fee) || 0;
  const totalAmount = Number(quote.total_amount) || 0;
  const vatAmount = Number(quote.vat_amount) || 0;
  const adjusted = totalAmount - vatAmount; // 이용료

  // 공통 셀 스타일
  const th = `style="background:#f3f4f6; padding:6px 8px; text-align:center; font-weight:600;"`;
  const tdC = `style="padding:6px 8px; text-align:center;"`;
  const tdR = `style="padding:6px 8px; text-align:right;"`;
  const tdRowspanAmt = `style="padding:6px 8px; text-align:right; background:#fef3e8; vertical-align:middle;"`;
  const tdRowspanCenter = `style="padding:6px 8px; text-align:center; background:#fef3e8; vertical-align:middle;"`;

  const headerRow = `
    <tr>
      <th ${th}></th>
      <th ${th}>유니크<br/>(개)</th>
      <th ${th}>프리미엄<br/>(개)</th>
      <th ${th}>베이직<br/>(개)</th>
      <th ${th}>라이트<br/>(개)</th>
      <th ${th}>부가기능<br/>(원)</th>
      <th ${th}>기본가<br/>(원)</th>
      <th ${th}>조정가<br/>(원)</th>
      <th ${th}>이용료<br/>(원)</th>
      <th ${th}>견적가<br/>(원)</th>
    </tr>`;

  const bodyRows = TABLE_MEDIA_ORDER.map((m, rowIdx) => {
    const qtyCells = TABLE_TIER_ORDER.map(
      (t) => `<td ${tdC}>${fmtQty(qtyMap.get(`${m.key}__${t}`) ?? 0)}</td>`,
    ).join('');

    const mediaBase = baseByMedia.get(m.key) ?? 0;
    const mediaAdjust = -(savingsByMedia.get(m.key) ?? 0);

    const rowspanCells =
      rowIdx === 0
        ? `<td ${tdRowspanCenter} rowspan="3">${fmtAmt(addonFee)}</td>`
        : '';
    const rowspanIyongryo =
      rowIdx === 0
        ? `<td ${tdRowspanAmt} rowspan="3">${fmtAmt(adjusted)}</td>`
        : '';
    const rowspanGyeoljeokga =
      rowIdx === 0
        ? `<td ${tdRowspanAmt} rowspan="3">${fmtAmt(totalAmount)}</td>`
        : '';

    return `
    <tr>
      <th ${th}>${m.label}</th>
      ${qtyCells}
      ${rowspanCells}
      <td ${tdR}>${fmtAmt(mediaBase)}</td>
      <td ${tdR}>${fmtAmt(mediaAdjust)}</td>
      ${rowspanIyongryo}
      ${rowspanGyeoljeokga}
    </tr>`;
  }).join('');

  // 추가 할인 행 (적용액이 0이면 생략)
  const extraDiscount = computeExtraDiscount(
    Number(quote.base_amount),
    Number(quote.extra_discount_rate ?? 0),
    Number(quote.extra_discount_amount ?? 0),
  );
  const extraNote = quote.extra_discount_note ? ` (${quote.extra_discount_note})` : '';
  const extraRow =
    extraDiscount > 0
      ? `
    <tr>
      <td colspan="8" style="padding:6px 8px; text-align:right; color:#be123c;">추가 할인${extraNote}</td>
      <td colspan="2" style="padding:6px 8px; text-align:right; color:#be123c;">−${extraDiscount.toLocaleString('ko-KR')}</td>
    </tr>`
      : '';

  const footerRow = `
    <tr>
      <td colspan="10" style="padding:6px 8px; text-align:right; color:#666; font-size:12px;">* 견적가 : VAT 포함 입금액</td>
    </tr>`;

  return `<table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid #d1d5db; font-size:13px; color:#171717;">
    <thead>${headerRow}</thead>
    <tbody>${bodyRows}${extraRow}${footerRow}</tbody>
  </table>`;
}

function contactAddress(c: CompanyContact, companyName: string): string {
  if (c.formatted_address && c.formatted_address.trim().length > 0) {
    return c.formatted_address.trim();
  }
  return generateFormattedAddress({
    companyName,
    displayName: c.display_name ?? '',
    email: c.email,
  });
}

// ───────────────────────────────────────────────────────────────
// 조정 안내 메일 빌더
// ───────────────────────────────────────────────────────────────
interface BuildAdjustmentEmailArgs {
  /** 같은 견적·조정일자의 매체별 조정 행 (다중 매체). 최소 1건. */
  adjustments: QuoteAdjustment[];
  quote: Quote;
  sender: SenderProfile | Partial<SenderProfile>;
  company: { name: string };
  contacts: CompanyContact[];
  template: EmailTemplate;
  /** 견적의 최초 수량(quote_items). 수정 전 수량 계산용. */
  quoteItems?: { media: Media; tier: Tier; quantity: number }[];
  /** 이번 조정일자 묶음 외의 모든 조정. baseline 누적용. */
  otherAdjustments?: QuoteAdjustment[];
}

const TIERS: Tier[] = ['unique', 'premium', 'basic', 'lite'];
const MEDIA_SEQ: Media[] = ['K', 'S', 'M'];

function deltaMap(a: QuoteAdjustment): Record<Tier, number> {
  return {
    unique: a.delta_unique,
    premium: a.delta_premium,
    basic: a.delta_basic,
    lite: a.delta_lite,
  };
}

/** 매체별 티어 수량 문자열: "프리미엄 530, 베이직 230" / 전부 0이면 "-". */
function tierQtyLabel(qty: Record<Tier, number>): string {
  const parts = TIERS.filter((t) => qty[t] > 0).map((t) => `${TIER_LABEL[t]} ${qty[t]}`);
  return parts.length ? parts.join(', ') : '-';
}

/** 변동 표기: "(프리미엄 +110, 베이직 -20)" / 변동 없으면 ''. */
function deltaLabel(delta: Record<Tier, number>): string {
  const parts = TIERS.filter((t) => delta[t] !== 0).map(
    (t) => `${TIER_LABEL[t]} ${delta[t] > 0 ? '+' : ''}${delta[t]}`,
  );
  return parts.length ? ` (${parts.join(', ')})` : '';
}

/**
 * 매체별 수정 전/후 표(HTML)와 평문을 생성.
 * 매체는 항상 3행(네이버/쇼핑/카카오). 수량 없으면 "-".
 */
function buildChangeTables(
  quoteItems: { media: Media; tier: Tier; quantity: number }[],
  otherAdjustments: QuoteAdjustment[],
  eventAdjustments: QuoteAdjustment[],
): { html: string; text: string } {
  // baseline[media][tier] = 최초수량 + Σ(이번 일자 외 조정 delta), 0 클램프
  const baseline: Record<Media, Record<Tier, number>> = {
    K: { unique: 0, premium: 0, basic: 0, lite: 0 },
    S: { unique: 0, premium: 0, basic: 0, lite: 0 },
    M: { unique: 0, premium: 0, basic: 0, lite: 0 },
  };
  for (const it of quoteItems) {
    if (baseline[it.media]) baseline[it.media][it.tier] += Number(it.quantity ?? 0);
  }
  for (const a of otherAdjustments) {
    const d = deltaMap(a);
    for (const t of TIERS) baseline[a.media][t] += Number(d[t] ?? 0);
  }
  for (const m of MEDIA_SEQ) for (const t of TIERS) baseline[m][t] = Math.max(0, baseline[m][t]);

  // 이번 묶음 delta (매체별 합산)
  const eventDelta: Record<Media, Record<Tier, number>> = {
    K: { unique: 0, premium: 0, basic: 0, lite: 0 },
    S: { unique: 0, premium: 0, basic: 0, lite: 0 },
    M: { unique: 0, premium: 0, basic: 0, lite: 0 },
  };
  for (const a of eventAdjustments) {
    const d = deltaMap(a);
    for (const t of TIERS) eventDelta[a.media][t] += Number(d[t] ?? 0);
  }

  // after = baseline + eventDelta, 0 클램프
  const after: Record<Media, Record<Tier, number>> = {
    K: { ...baseline.K },
    S: { ...baseline.S },
    M: { ...baseline.M },
  };
  for (const m of MEDIA_SEQ) for (const t of TIERS) after[m][t] = Math.max(0, after[m][t] + eventDelta[m][t]);

  const rowsHtml = MEDIA_SEQ.map((m) => {
    const before = tierQtyLabel(baseline[m]);
    const afterStr = tierQtyLabel(after[m]) + deltaLabel(eventDelta[m]);
    return `<tr><th style="text-align:left;padding:4px 10px;border:1px solid #e5e7eb;background:#f9fafb;white-space:nowrap;">${MEDIA_SHORT_LABEL[m]}</th><td style="padding:4px 10px;border:1px solid #e5e7eb;">${before}</td><td style="padding:4px 10px;border:1px solid #e5e7eb;">${afterStr}</td></tr>`;
  }).join('');

  const html =
    `<table style="border-collapse:collapse;font-size:13px;margin:8px 0;">` +
    `<thead><tr>` +
    `<th style="padding:4px 10px;border:1px solid #e5e7eb;background:#f3f4f6;">매체</th>` +
    `<th style="padding:4px 10px;border:1px solid #e5e7eb;background:#f3f4f6;">수정 전</th>` +
    `<th style="padding:4px 10px;border:1px solid #e5e7eb;background:#f3f4f6;">수정 후</th>` +
    `</tr></thead><tbody>${rowsHtml}</tbody></table>`;

  const textLines = ['[수정 전]'];
  for (const m of MEDIA_SEQ) textLines.push(`  ${MEDIA_SHORT_LABEL[m]} : ${tierQtyLabel(baseline[m])}`);
  textLines.push('[수정 후]');
  for (const m of MEDIA_SEQ)
    textLines.push(`  ${MEDIA_SHORT_LABEL[m]} : ${tierQtyLabel(after[m])}${deltaLabel(eventDelta[m])}`);

  return { html, text: textLines.join('\n') };
}

export function buildAdjustmentEmail(args: BuildAdjustmentEmailArgs): BuiltEmail {
  const { adjustments, quote, sender, company, contacts, template } = args;
  const adjustment = adjustments[0];
  const changes = buildChangeTables(
    args.quoteItems ?? [],
    args.otherAdjustments ?? [],
    adjustments,
  );

  const sortedContacts = [...contacts].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'primary' ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
  const toContacts = sortedContacts.filter((c) => c.role === 'primary');
  const ccContacts = sortedContacts.filter((c) => c.role === 'cc');

  const to = toContacts.map((c) => contactAddress(c, company.name));
  const cc = ccContacts.map((c) => contactAddress(c, company.name));

  const periodLabel = buildPeriodLabel(quote.service_start, quote.service_end);

  // 조정 항목 — 모든 매체 행의 0이 아닌 등급 (매체 라벨 포함)
  const items = adjustments.flatMap((adj) => {
    const deltaByTier: Record<Tier, number> = {
      unique: adj.delta_unique,
      premium: adj.delta_premium,
      basic: adj.delta_basic,
      lite: adj.delta_lite,
    };
    return TIERS.filter((t) => deltaByTier[t] !== 0).map((t) => ({
      tier_label: `${MEDIA_LABEL[adj.media as Media]} ${TIER_LABEL[t]}`,
      delta: deltaByTier[t],
    }));
  });

  // 변동 매체 라벨 목록
  const mediaLabel = Array.from(new Set(adjustments.map((a) => MEDIA_LABEL[a.media as Media]))).join(
    ', ',
  );
  // 총 정산액 (전 매체 합산)
  const preAdjustAmount = adjustments.reduce((s, a) => s + Number(a.pre_adjust_amount ?? 0), 0);
  const reason = adjustments.find((a) => a.reason)?.reason ?? '';

  const rendered = renderEmailTemplate(template, {
    period_label: periodLabel,
    sender: {
      contact_name: sender.contact_name ?? '',
      company_name: sender.company_name ?? '',
      phone: sender.phone ?? '',
      email: sender.email ?? '',
      bank_account: sender.bank_account ?? '',
      address: sender.address ?? '',
    },
    company: { name: company.name },
    quote: {
      quote_no: quote.quote_no ?? '',
      service_start: quote.service_start,
      service_end: quote.service_end,
      total_amount: formatKRW(Number(quote.total_amount ?? 0)),
      summary_label: '',
      items_table_html: '',
    },
    adjustment: {
      adjustment_date: adjustment.adjustment_date,
      media_label: mediaLabel,
      items,
      pre_adjust_amount: formatKRW(preAdjustAmount),
      pre_adjust_amount_raw: preAdjustAmount,
      pre_adjust_amount_abs: formatKRW(Math.abs(preAdjustAmount)),
      amount_change_word: preAdjustAmount < 0 ? '감액' : '추가',
      changes_html: changes.html,
      changes_text: changes.text,
      reason,
    },
  });

  return { to, cc, ...rendered };
}
