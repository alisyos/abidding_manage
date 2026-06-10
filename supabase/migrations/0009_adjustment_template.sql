-- ════════════════════════════════════════════════════════════════════
-- 0009 사용량 조정 안내 기본 템플릿 개편
--   매체별 "수정 전 / 수정 후" 표 + 일할 금액 안내 구조로 교체.
--   표/금액은 빌더(buildAdjustmentEmail)가 채우는 변수:
--     {{{adjustment.changes_html}}} / {{adjustment.changes_text}}
--     {{adjustment.pre_adjust_amount_abs}} / {{adjustment.amount_change_word}}
-- ════════════════════════════════════════════════════════════════════

UPDATE email_templates SET
  body_html = '<p>안녕하세요. DMP코리아 {{sender.contact_name}}입니다.</p>
<p>요청 주신 사용량 조정 세팅 내역 공유 드립니다.</p>
<p><b>[사용량 조정 내역_{{company.name}}]</b></p>
{{{adjustment.changes_html}}}
<p>이용료는 일할 계산되어 {{adjustment.pre_adjust_amount_abs}}(VAT 별도)이 {{adjustment.amount_change_word}}되며,<br/>해당 금액은 익월 견적서에 반영하도록 하겠습니다.</p>
<p>감사합니다.</p>',
  body_text = '안녕하세요. DMP코리아 {{sender.contact_name}}입니다.

요청 주신 사용량 조정 세팅 내역 공유 드립니다.

[사용량 조정 내역_{{company.name}}]
{{adjustment.changes_text}}

이용료는 일할 계산되어 {{adjustment.pre_adjust_amount_abs}}(VAT 별도)이 {{adjustment.amount_change_word}}되며,
해당 금액은 익월 견적서에 반영하도록 하겠습니다.

감사합니다.'
WHERE key = 'adjustment_default';
