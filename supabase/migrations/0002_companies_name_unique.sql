-- ════════════════════════════════════════════════════════════════════
-- 0002_companies_name_unique.sql
-- 에이비딩 관리 시스템 - 거래처명 UNIQUE 제약 추가
-- ════════════════════════════════════════════════════════════════════
--
-- 목적: 엑셀 임포트의 `upsert(onConflict='name')` 동작을 위해
--       companies.name 컬럼에 UNIQUE 제약을 부여한다.
--
-- 주의: 기존에 동명 거래처가 존재한다면 이 마이그레이션은 실패한다.
--       사전에 SELECT name, COUNT(*) FROM companies GROUP BY name HAVING COUNT(*) > 1;
--       으로 중복을 확인하고 정리한 뒤 실행.
--
-- ════════════════════════════════════════════════════════════════════

alter table companies
  add constraint companies_name_key unique (name);
