-- ════════════════════════════════════════════════════════════════════
-- 0006: 매출 부가세 스냅샷 (sales_records.vat_amount)
--   - 조정(adjustment)이 견적서 문서를 더 이상 수정하지 않고 매출에만 반영되도록
--     "견적/매출 분리" 모델 전환.
--   - 분리 후 매출 총액이 견적과 달라질 수 있으므로 매출 화면의 공급가액/부가세
--     분리는 견적이 아닌 sales_records 자체 스냅샷에 기반해야 함.
--   - 기존 행은 견적의 vat_amount 로 백필.
-- ════════════════════════════════════════════════════════════════════

alter table sales_records
  add column if not exists vat_amount numeric(14,2) not null default 0;

update sales_records s
  set vat_amount = q.vat_amount
  from quotes q
  where q.id = s.quote_id;
