// ────────────────────────────────────────────────────────────
// 에이비딩 관리 시스템 - Supabase 타입 정의
// Phase 1 단계에서 수동 정의. 추후 `supabase gen types` 로 자동화 가능.
// ────────────────────────────────────────────────────────────

export type AccountType = 'advertiser' | 'agency';
export type ContactRole = 'primary' | 'cc';
export type Media = 'K' | 'S' | 'M';
export type Tier = 'unique' | 'premium' | 'basic' | 'lite';
export type QuoteStatus = 'draft' | 'sent' | 'won' | 'paid';
export type EmailKind = 'quote' | 'adjustment' | 'reminder';
export type EmailStatus = 'queued' | 'sent' | 'failed';
export type TaxInvoiceType = 'receipt' | 'claim';

// 한글 라벨 매핑
export const MEDIA_LABEL: Record<Media, string> = {
  K: '네이버_키워드',
  S: '네이버_쇼핑',
  M: '카카오_키워드',
};

export const TIER_LABEL: Record<Tier, string> = {
  unique: '유니크',
  premium: '프리미엄',
  basic: '베이직',
  lite: '라이트',
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  advertiser: '광고주',
  agency: '제휴사',
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: '임시저장',
  sent: '발송',
  won: '수주',
  paid: '입금확인',
};

export const TAX_INVOICE_LABEL: Record<TaxInvoiceType, string> = {
  receipt: '영수',
  claim: '청구',
};

// ────────────────────────────────────────────────────────────
// DB 테이블 인터페이스
// ────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: 'admin' | 'member';
  created_at: string;
}

export interface Company {
  id: string;
  no: number | null;
  name: string;
  account_type: AccountType;
  default_discount_rate: number;
  user_database: string | null;
  user_agency_id: string | null;
  url: string | null;
  memo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubCompany {
  id: string;
  company_id: string;
  name: string;
  database_code: string | null;
  agency_id: string | null;
  memo: string | null;
  created_at: string;
}

export interface CompanyContact {
  id: string;
  sub_company_id: string;
  role: ContactRole;
  display_name: string | null;
  email: string;
  phone: string | null;
  formatted_address: string | null;
  sort_order: number;
  created_at: string;
}

export interface Product {
  id: string;
  media: Media;
  tier: Tier;
  unit_price: number;
  monitoring_period: string | null;
  is_active: boolean;
  effective_from: string;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  quote_no: string | null;
  company_id: string;
  sub_company_id: string | null;
  status: QuoteStatus;
  service_start: string;
  service_end: string;
  discount_rate: number;
  addon_fee: number;
  variable_adjust: number;
  fixed_adjust: number;
  base_amount: number;
  vat_amount: number;
  total_amount: number;
  sender_snapshot: Record<string, unknown>;
  bank_account: string | null;
  payment_method: string | null;
  tax_invoice_type: TaxInvoiceType | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  won_at: string | null;
  paid_at: string | null;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  media: Media;
  tier: Tier;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface QuoteAdjustment {
  id: string;
  quote_id: string;
  adjustment_date: string;
  account_type: AccountType | null;
  discount_rate: number | null;
  media: Media;
  delta_unique: number;
  delta_premium: number;
  delta_basic: number;
  delta_lite: number;
  pre_adjust_amount: number | null;
  reason: string | null;
  created_at: string;
}

export interface QuoteEmail {
  id: string;
  quote_id: string;
  kind: EmailKind;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string;
  body_html: string;
  body_text: string | null;
  status: EmailStatus;
  smtp_message_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SalesRecord {
  id: string;
  quote_id: string;
  company_id: string;
  sub_company_id: string | null;
  revenue_month: string;
  base_amount: number;
  variable_adjust: number;
  total_amount: number;
  payment_date: string | null;
  tax_invoice_no: string | null;
  tax_invoice_issued_at: string | null;
  created_at: string;
}

export interface SenderProfile {
  id: 1;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  bank_account: string | null;
  updated_at: string;
}

export interface EmailTemplate {
  id: string;
  key: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  updated_at: string;
}

// ────────────────────────────────────────────────────────────
// Supabase Database 타입 (간소화)
// Note: Insert/Update는 Partial<Row>로 단순화. 런타임 검증은 Zod로 분리.
//       정교한 required-key 검증은 supabase generic 추론을 망가뜨려 'never' 오류 유발하므로 회피.
// ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TableDef<T> = {
  Row: T;
  // Insert/Update는 supabase-js의 generic constraint(Record<string, unknown>)를 만족시키기 위해
  // any 사용. 런타임 검증은 Zod로 책임진다.
  Insert: any;
  Update: any;
  Relationships: [];
};

export interface MonthlyUsage {
  id: string;
  company_id: string | null;
  sub_company_id: string | null;
  media: Media;
  tier: Tier;
  quantity: number;
  usage_start: string | null;
  usage_end: string | null;
  source: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile>;
      companies: TableDef<Company>;
      sub_companies: TableDef<SubCompany>;
      company_contacts: TableDef<CompanyContact>;
      products: TableDef<Product>;
      quotes: TableDef<Quote>;
      quote_items: TableDef<QuoteItem>;
      quote_adjustments: TableDef<QuoteAdjustment>;
      quote_emails: TableDef<QuoteEmail>;
      sales_records: TableDef<SalesRecord>;
      monthly_usage: TableDef<MonthlyUsage>;
      sender_profile: TableDef<SenderProfile>;
      email_templates: TableDef<EmailTemplate>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
