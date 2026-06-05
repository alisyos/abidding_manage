import { renderEmailTemplate, type RenderedEmail } from './templates';
import { buildPeriodLabel } from '@/lib/quotes/period';
import { formatKRW } from '@/lib/format/currency';
import { generateFormattedAddress } from '@/lib/format/contact';
import { MEDIA_LABEL, TIER_LABEL, type Tier } from '@/lib/supabase/types';
import type {
  CompanyContact,
  EmailTemplate,
  Media,
  Quote,
  QuoteAdjustment,
  SenderProfile,
} from '@/lib/supabase/types';

interface BuildQuoteEmailArgs {
  quote: Quote;
  sender: SenderProfile | Partial<SenderProfile>; // sender_snapshot or current
  company: { name: string };
  subCompany?: { name: string } | null;
  contacts: CompanyContact[];
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
  const { quote, sender, company, contacts, template } = args;

  const sortedContacts = [...contacts].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'primary' ? -1 : 1;
    return a.sort_order - b.sort_order;
  });

  const toContacts = sortedContacts.filter((c) => c.role === 'primary');
  const ccContacts = sortedContacts.filter((c) => c.role === 'cc');

  const to = toContacts.map((c) => contactAddress(c, company.name));
  const cc = ccContacts.map((c) => contactAddress(c, company.name));

  const periodLabel = buildPeriodLabel(quote.service_start, quote.service_end);

  const rendered = renderEmailTemplate(template, {
    period_label: periodLabel,
    sender: {
      contact_name: sender.contact_name ?? '',
      company_name: sender.company_name ?? '',
      phone: sender.phone ?? '',
      email: sender.email ?? '',
      bank_account: sender.bank_account ?? '',
    },
    company: {
      name: company.name,
    },
    quote: {
      quote_no: quote.quote_no ?? '',
      service_start: quote.service_start,
      service_end: quote.service_end,
      total_amount: formatKRW(Number(quote.total_amount ?? 0)),
    },
  });

  return { to, cc, ...rendered };
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
  adjustment: QuoteAdjustment;
  quote: Quote;
  sender: SenderProfile | Partial<SenderProfile>;
  company: { name: string };
  contacts: CompanyContact[];
  template: EmailTemplate;
}

const TIERS: Tier[] = ['unique', 'premium', 'basic', 'lite'];

export function buildAdjustmentEmail(args: BuildAdjustmentEmailArgs): BuiltEmail {
  const { adjustment, quote, sender, company, contacts, template } = args;

  const sortedContacts = [...contacts].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'primary' ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
  const toContacts = sortedContacts.filter((c) => c.role === 'primary');
  const ccContacts = sortedContacts.filter((c) => c.role === 'cc');

  const to = toContacts.map((c) => contactAddress(c, company.name));
  const cc = ccContacts.map((c) => contactAddress(c, company.name));

  const periodLabel = buildPeriodLabel(quote.service_start, quote.service_end);

  // 조정 항목 — 0이 아닌 등급만
  const deltaByTier: Record<Tier, number> = {
    unique: adjustment.delta_unique,
    premium: adjustment.delta_premium,
    basic: adjustment.delta_basic,
    lite: adjustment.delta_lite,
  };
  const items = TIERS.filter((t) => deltaByTier[t] !== 0).map((t) => ({
    tier_label: TIER_LABEL[t],
    delta: deltaByTier[t],
  }));

  const preAdjustAmount = Number(adjustment.pre_adjust_amount ?? 0);

  const rendered = renderEmailTemplate(template, {
    period_label: periodLabel,
    sender: {
      contact_name: sender.contact_name ?? '',
      company_name: sender.company_name ?? '',
      phone: sender.phone ?? '',
      email: sender.email ?? '',
      bank_account: sender.bank_account ?? '',
    },
    company: { name: company.name },
    quote: {
      quote_no: quote.quote_no ?? '',
      service_start: quote.service_start,
      service_end: quote.service_end,
      total_amount: formatKRW(Number(quote.total_amount ?? 0)),
    },
    adjustment: {
      adjustment_date: adjustment.adjustment_date,
      media_label: MEDIA_LABEL[adjustment.media as Media],
      items,
      pre_adjust_amount: formatKRW(preAdjustAmount),
      pre_adjust_amount_raw: preAdjustAmount,
      reason: adjustment.reason ?? '',
    },
  });

  return { to, cc, ...rendered };
}
