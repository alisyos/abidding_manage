-- ════════════════════════════════════════════════════════════════════
-- 0005: 견적별 추가 할인 (extra_discount)
--   - 표준 할인(공시→할인 임계값 정책) 외에 운영팀이 거래처 관계/이용기간/협상으로
--     견적별로 부여하는 추가 할인을 정식 모델화.
--   - 비율(0~1)과 금액(원) 두 입력 모두 지원 (합산 적용).
--   - 설명 텍스트 컬럼으로 할인 사유 기록.
--   - 계산 위치: VAT 전, fixed/variable_adjust 와 동그룹.
-- ════════════════════════════════════════════════════════════════════

alter table quotes
  add column if not exists extra_discount_rate numeric(5,4) not null default 0
    check (extra_discount_rate >= 0 and extra_discount_rate <= 1),
  add column if not exists extra_discount_amount numeric not null default 0,
  add column if not exists extra_discount_note text;
