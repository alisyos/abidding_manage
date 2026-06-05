-- ════════════════════════════════════════════════════════════════════
-- 0004: 가격 정책 임계값 기반 전환
--   - products.list_price (공시가) 신규 + 시드 (PDF 소개서 기준)
--   - quotes.discount_rate / companies.default_discount_rate 완전 제거
--   - 신규 정책: 공시가 기준 line_total 합계 ≥ 100,000원이면 할인가 적용
-- ════════════════════════════════════════════════════════════════════

-- 1) products.list_price (공시가) 추가
alter table products add column if not exists list_price numeric;

-- 시드 (PDF '가격 정책' 챕터 기준)
-- 키워드 광고 (K, M) — 네이버/카카오 동일 가격
update products set list_price = 12000 where media in ('K','M') and tier = 'unique';
update products set list_price =  6000 where media in ('K','M') and tier = 'premium';
update products set list_price =  1500 where media in ('K','M') and tier = 'basic';
update products set list_price =   600 where media in ('K','M') and tier = 'lite';

-- 쇼핑 광고 (S)
update products set list_price =  6000 where media = 'S' and tier = 'unique';
update products set list_price =  3000 where media = 'S' and tier = 'premium';
update products set list_price =  1500 where media = 'S' and tier = 'basic';
update products set list_price =   600 where media = 'S' and tier = 'lite';

alter table products alter column list_price set not null;

-- 2) discount_rate 컬럼 완전 제거 (신규 정책에서는 자동 결정)
alter table quotes drop column if exists discount_rate;
alter table companies drop column if exists default_discount_rate;

-- 3) quote_adjustments 의 discount_rate 도 제거 (조정 안내 메일에서 노출되지 않음)
alter table quote_adjustments drop column if exists discount_rate;
