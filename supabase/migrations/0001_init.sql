-- ════════════════════════════════════════════════════════════════════
-- 에이비딩 관리 시스템 - 초기 스키마
-- 0001_init.sql
-- ════════════════════════════════════════════════════════════════════

-- 필요 확장
create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────────
-- ENUM 정의
-- ────────────────────────────────────────────────────────────────────
do $$ begin
  create type account_type_enum as enum ('advertiser', 'agency');  -- 광고주 / 제휴사
exception when duplicate_object then null; end $$;

do $$ begin
  create type contact_role_enum as enum ('primary', 'cc');
exception when duplicate_object then null; end $$;

do $$ begin
  create type media_enum as enum ('K', 'S', 'M');  -- 네이버키워드 / 네이버쇼핑 / 카카오키워드
exception when duplicate_object then null; end $$;

do $$ begin
  create type tier_enum as enum ('unique', 'premium', 'basic', 'lite');
exception when duplicate_object then null; end $$;

do $$ begin
  create type quote_status_enum as enum ('draft', 'sent', 'won', 'paid');
  -- 임시저장 / 발송 / 수주 / 입금확인
exception when duplicate_object then null; end $$;

do $$ begin
  create type email_kind_enum as enum ('quote', 'adjustment', 'reminder');
exception when duplicate_object then null; end $$;

do $$ begin
  create type email_status_enum as enum ('queued', 'sent', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tax_invoice_type_enum as enum ('receipt', 'claim');  -- 영수 / 청구
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────────────
-- profiles
-- ────────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text,
  role          text not null default 'member' check (role in ('admin', 'member')),
  created_at    timestamptz not null default now()
);

-- 신규 사용자 가입 시 profiles 자동 생성 트리거
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ────────────────────────────────────────────────────────────────────
-- companies (거래처)
-- ────────────────────────────────────────────────────────────────────
create table if not exists companies (
  id                      uuid primary key default gen_random_uuid(),
  no                      int,
  name                    text not null,
  account_type            account_type_enum not null default 'agency',
  default_discount_rate   numeric(5,4) not null default 0,
  user_database           text,
  user_agency_id          text,
  url                     text,
  memo                    text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_companies_name        on companies (name);
create index if not exists idx_companies_active      on companies (is_active);
create index if not exists idx_companies_account     on companies (account_type);

-- ────────────────────────────────────────────────────────────────────
-- sub_companies (세부거래처)
-- ────────────────────────────────────────────────────────────────────
create table if not exists sub_companies (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  name            text not null,
  database_code   text,
  agency_id       text,
  memo            text,
  created_at      timestamptz not null default now(),
  unique (company_id, name)
);

create index if not exists idx_sub_companies_company on sub_companies (company_id);

-- ────────────────────────────────────────────────────────────────────
-- company_contacts (견적서DB)
-- ────────────────────────────────────────────────────────────────────
create table if not exists company_contacts (
  id                  uuid primary key default gen_random_uuid(),
  sub_company_id      uuid not null references sub_companies(id) on delete cascade,
  role                contact_role_enum not null default 'primary',
  display_name        text,
  email               text not null,
  phone               text,
  formatted_address   text,    -- "'[회사]담당' <email@x>" 미리 포맷된 문자열
  sort_order          int not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists idx_contacts_sub on company_contacts (sub_company_id, role, sort_order);

-- ────────────────────────────────────────────────────────────────────
-- products (단가표)
-- ────────────────────────────────────────────────────────────────────
create table if not exists products (
  id                  uuid primary key default gen_random_uuid(),
  media               media_enum not null,
  tier                tier_enum not null,
  unit_price          numeric(12,2) not null,
  monitoring_period   text,
  is_active           boolean not null default true,
  effective_from      date not null default current_date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (media, tier, effective_from)
);

create index if not exists idx_products_active on products (media, tier, is_active);

-- ────────────────────────────────────────────────────────────────────
-- quotes (견적서)
-- ────────────────────────────────────────────────────────────────────
create table if not exists quotes (
  id                  uuid primary key default gen_random_uuid(),
  quote_no            text unique,                 -- 'Q-YYYYMM-###' (앱에서 생성)
  company_id          uuid not null references companies(id),
  sub_company_id      uuid references sub_companies(id),
  status              quote_status_enum not null default 'draft',
  service_start       date not null,
  service_end         date not null,
  discount_rate       numeric(5,4) not null default 0,
  addon_fee           numeric(12,2) not null default 0,    -- 부가서비스
  variable_adjust     numeric(12,2) not null default 0,    -- 변동조정가
  fixed_adjust        numeric(12,2) not null default 0,    -- 고정조정가
  base_amount         numeric(14,2) not null default 0,    -- 기본가
  vat_amount          numeric(14,2) not null default 0,    -- 부가세 10%
  total_amount        numeric(14,2) not null default 0,    -- 견적가 (VAT 포함)
  sender_snapshot     jsonb not null default '{}'::jsonb,  -- 발신자 스냅샷
  bank_account        text,
  payment_method      text,
  tax_invoice_type    tax_invoice_type_enum,
  notes               text,
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  sent_at             timestamptz,
  won_at              timestamptz,
  paid_at             timestamptz
);

create index if not exists idx_quotes_status   on quotes (status);
create index if not exists idx_quotes_company  on quotes (company_id);
create index if not exists idx_quotes_period   on quotes (service_start desc, service_end);
create index if not exists idx_quotes_quote_no on quotes (quote_no);

-- ────────────────────────────────────────────────────────────────────
-- quote_items
-- ────────────────────────────────────────────────────────────────────
create table if not exists quote_items (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references quotes(id) on delete cascade,
  media           media_enum not null,
  tier            tier_enum not null,
  quantity        int not null default 0,
  unit_price      numeric(12,2) not null,
  line_total      numeric(14,2) not null,
  unique (quote_id, media, tier)
);

create index if not exists idx_quote_items_quote on quote_items (quote_id);

-- ────────────────────────────────────────────────────────────────────
-- quote_adjustments (조정)
-- ────────────────────────────────────────────────────────────────────
create table if not exists quote_adjustments (
  id                  uuid primary key default gen_random_uuid(),
  quote_id            uuid not null references quotes(id) on delete cascade,
  adjustment_date     date not null,
  account_type        account_type_enum,
  discount_rate       numeric(5,4),
  media               media_enum not null,
  delta_unique        int not null default 0,
  delta_premium       int not null default 0,
  delta_basic         int not null default 0,
  delta_lite          int not null default 0,
  pre_adjust_amount   numeric(14,2),               -- 선조정가
  reason              text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_adjustments_quote on quote_adjustments (quote_id, adjustment_date desc);

-- ────────────────────────────────────────────────────────────────────
-- quote_emails (발송 이력)
-- ────────────────────────────────────────────────────────────────────
create table if not exists quote_emails (
  id                  uuid primary key default gen_random_uuid(),
  quote_id            uuid not null references quotes(id) on delete cascade,
  kind                email_kind_enum not null default 'quote',
  to_addresses        text[] not null,
  cc_addresses        text[] not null default '{}',
  subject             text not null,
  body_html           text not null,
  body_text           text,
  status              email_status_enum not null default 'queued',
  smtp_message_id     text,
  error               text,
  sent_at             timestamptz,
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now()
);

create index if not exists idx_emails_quote on quote_emails (quote_id);
create index if not exists idx_emails_status on quote_emails (status);
create index if not exists idx_emails_sent_at on quote_emails (sent_at desc);

-- ────────────────────────────────────────────────────────────────────
-- sales_records (매출 — 수주 시 자동 생성)
-- ────────────────────────────────────────────────────────────────────
create table if not exists sales_records (
  id                       uuid primary key default gen_random_uuid(),
  quote_id                 uuid unique not null references quotes(id) on delete cascade,
  company_id               uuid not null references companies(id),
  sub_company_id           uuid references sub_companies(id),
  revenue_month            date not null,                -- 월 첫째날
  base_amount              numeric(14,2) not null,
  variable_adjust          numeric(14,2) not null default 0,
  total_amount             numeric(14,2) not null,
  payment_date             date,                          -- 입금일자
  tax_invoice_no           text,                          -- 세금계산서번호
  tax_invoice_issued_at    date,                          -- 계산서발행일
  created_at               timestamptz not null default now()
);

create index if not exists idx_sales_month   on sales_records (revenue_month);
create index if not exists idx_sales_company on sales_records (company_id, revenue_month);
create index if not exists idx_sales_payment on sales_records (payment_date);

-- ────────────────────────────────────────────────────────────────────
-- monthly_usage (raw 시트 — 과거 사용량 보관)
-- ────────────────────────────────────────────────────────────────────
create table if not exists monthly_usage (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references companies(id),
  sub_company_id  uuid references sub_companies(id),
  media           media_enum not null,
  tier            tier_enum not null,
  quantity        int not null,
  usage_start     date,
  usage_end       date,
  source          text not null default 'import',
  created_at      timestamptz not null default now()
);

create index if not exists idx_usage_company on monthly_usage (company_id, usage_start);

-- ────────────────────────────────────────────────────────────────────
-- sender_profile (발신자/회사 정보 - 단일 행)
-- ────────────────────────────────────────────────────────────────────
create table if not exists sender_profile (
  id            int primary key check (id = 1),
  company_name  text,
  contact_name  text,
  phone         text,
  email         text,
  address       text,
  bank_account  text,
  updated_at    timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────
-- email_templates
-- ────────────────────────────────────────────────────────────────────
create table if not exists email_templates (
  id            uuid primary key default gen_random_uuid(),
  key           text unique not null,
  name          text not null,
  subject       text not null,
  body_html     text not null,
  body_text     text,
  updated_at    timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════
-- RLS (Phase 1: 인증된 사용자 모두 read/write)
-- ════════════════════════════════════════════════════════════════════

-- 모든 테이블 RLS ON
alter table profiles            enable row level security;
alter table companies           enable row level security;
alter table sub_companies       enable row level security;
alter table company_contacts    enable row level security;
alter table products            enable row level security;
alter table quotes              enable row level security;
alter table quote_items         enable row level security;
alter table quote_adjustments   enable row level security;
alter table quote_emails        enable row level security;
alter table sales_records       enable row level security;
alter table monthly_usage       enable row level security;
alter table sender_profile      enable row level security;
alter table email_templates     enable row level security;

-- 인증된 사용자에게 모든 작업 허용 (Phase 1)
do $$
declare
  tbl text;
  tables text[] := array[
    'profiles', 'companies', 'sub_companies', 'company_contacts',
    'products', 'quotes', 'quote_items', 'quote_adjustments',
    'quote_emails', 'sales_records', 'monthly_usage', 'sender_profile',
    'email_templates'
  ];
begin
  foreach tbl in array tables loop
    execute format(
      'drop policy if exists "auth_all" on %I;', tbl
    );
    execute format(
      'create policy "auth_all" on %I for all to authenticated using (true) with check (true);', tbl
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- 시드 데이터
-- ════════════════════════════════════════════════════════════════════

-- 단가표 12종 (견적서 시트 기준)
insert into products (media, tier, unit_price, monitoring_period) values
  ('K', 'unique',  10000, '3~5 분'),
  ('K', 'premium',  5000, '5~10 분'),
  ('K', 'basic',    1000, '20~30 분'),
  ('K', 'lite',      400, '60~90 분'),
  ('S', 'unique',   5000, '3~5 분'),
  ('S', 'premium',  2500, '5~10 분'),
  ('S', 'basic',    1000, '20~30 분'),
  ('S', 'lite',      400, '60~90 분'),
  ('M', 'unique',  10000, '3~5 분'),
  ('M', 'premium',  5000, '5~10 분'),
  ('M', 'basic',    1000, '20~30 분'),
  ('M', 'lite',      400, '60~90 분')
on conflict (media, tier, effective_from) do nothing;

-- sender_profile 기본 행
insert into sender_profile (id, company_name, contact_name, phone, email, address, bank_account)
values (
  1,
  '주식회사 디엠피코리아',
  '김도형 사원',
  '02-2026-3195',
  'dh.kim@dmpkorea.co.kr',
  '서울특별시 금천구 가산디지털1로',
  '국민은행 421701-04-220...'
)
on conflict (id) do nothing;

-- 메일 템플릿 기본 시드 (견적서 시트의 메일 본문 기반)
insert into email_templates (key, name, subject, body_html, body_text) values
(
  'quote_default',
  '견적서 발송 기본 템플릿',
  '[DMP코리아] 에이비딩 자동입찰 솔루션 {{period_label}} 견적서 공유',
  '<p>안녕하세요. DMP코리아 {{sender.contact_name}}입니다.</p>
<p>에이비딩 자동입찰 솔루션 <strong>{{period_label}}</strong> 견적서를 공유드립니다.</p>
<p>상세 견적 내용은 첨부파일로 확인 부탁드리며, 에이비딩의 추가 문의사항이 있으시면 언제든지 연락 부탁드립니다.</p>
<p>감사합니다.</p>',
  '안녕하세요. DMP코리아 {{sender.contact_name}}입니다.

에이비딩 자동입찰 솔루션 {{period_label}} 견적서를 공유드립니다.

상세 견적 내용은 첨부파일로 확인 부탁드리며, 에이비딩의 추가 문의사항이 있으시면 언제든지 연락 부탁드립니다.

감사합니다.'
),
(
  'adjustment_default',
  '사용량 조정 안내 기본 템플릿',
  '[DMP코리아] 에이비딩 자동입찰 솔루션 {{period_label}} 사용량 조정 안내',
  '<p>안녕하세요. DMP코리아 {{sender.contact_name}}입니다.</p>
<p>요청 주신 사용량 조정 세팅이 완료되어 안내드립니다.</p>
<p>사용량 변동에 따른 일할 계산 금액은 다음달 견적서에 반영됩니다.</p>
<p>감사합니다.</p>',
  '안녕하세요. DMP코리아 {{sender.contact_name}}입니다.

요청 주신 사용량 조정 세팅이 완료되어 안내드립니다.
사용량 변동에 따른 일할 계산 금액은 다음달 견적서에 반영됩니다.

감사합니다.'
)
on conflict (key) do nothing;

-- ════════════════════════════════════════════════════════════════════
-- updated_at 자동 갱신 트리거
-- ════════════════════════════════════════════════════════════════════
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

do $$
declare
  tbl text;
  tables text[] := array[
    'companies', 'products', 'quotes', 'sender_profile', 'email_templates'
  ];
begin
  foreach tbl in array tables loop
    execute format('drop trigger if exists trg_set_updated_at on %I;', tbl);
    execute format(
      'create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at();',
      tbl
    );
  end loop;
end $$;
