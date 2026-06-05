-- ════════════════════════════════════════════════════════════════════
-- 0003: email_templates.quote_default 본문을 PDF 예시 디자인으로 교체
--   - 인사말 + 견적 요약 표(코드 자동 생성) + 안내 + 서명 구조
--   - 표는 빌더 코드가 {{{quote.items_table_html}}} 로 사전 렌더된 HTML 주입
--   - 사용자가 본문/안내/서명 텍스트만 편집하면 됨 (표 마크업은 자동 일관성 보장)
-- ════════════════════════════════════════════════════════════════════

update email_templates set
  subject = '[DMP코리아] 에이비딩 자동입찰 솔루션 {{period_label}} 견적서 공유',
  body_html = $html$<div style="font-family: Pretendard, '맑은 고딕', 'Malgun Gothic', sans-serif; font-size: 14px; line-height: 1.65; color: #171717;">
  <p>안녕하세요. {{sender.company_name}} {{sender.contact_name}}입니다.</p>
  <p>에이비딩 자동입찰 솔루션 <strong>{{period_label}}</strong> 견적서 공유 드립니다.</p>

  <p style="margin-top: 24px;"><strong>[{{quote.summary_label}}]</strong></p>

  {{{quote.items_table_html}}}

  <p style="margin-top: 24px;">상세 견적 내용은 첨부파일로 확인 부탁드리며, 에이비딩의 경우 먼저 회신을 주시지 않을 경우 자동으로 연장 되는점 참고 부탁드립니다.</p>
  <p>사용량 변동 및 기타 이슈가 있으실 경우 회신 주시길 바랍니다.</p>

  <p style="margin-top: 24px;">감사합니다.</p>

  <hr style="border: none; border-top: 1px solid #ddd; margin: 32px 0 16px;" />

  <p style="font-size: 13px; color: #444; margin: 4px 0;"><strong>{{sender.contact_name}}</strong> ｜ 전략기획팀</p>
  <p style="font-size: 13px; color: #444; margin: 4px 0;">{{sender.company_name}} {{sender.address}}</p>
  <p style="font-size: 13px; color: #444; margin: 4px 0;">Tel  {{sender.phone}}</p>
  <p style="font-size: 13px; color: #444; margin: 4px 0;">E-mail {{sender.email}}</p>
</div>$html$,
  body_text = $text$안녕하세요. {{sender.company_name}} {{sender.contact_name}}입니다.
에이비딩 자동입찰 솔루션 {{period_label}} 견적서 공유 드립니다.

[{{quote.summary_label}}]
(상세 표는 HTML 본문 또는 첨부 PDF로 확인 부탁드립니다.)

상세 견적 내용은 첨부파일로 확인 부탁드리며, 에이비딩의 경우 먼저 회신을 주시지 않을 경우 자동으로 연장 되는점 참고 부탁드립니다.
사용량 변동 및 기타 이슈가 있으실 경우 회신 주시길 바랍니다.

감사합니다.

---
{{sender.contact_name}} | 전략기획팀
{{sender.company_name}} {{sender.address}}
Tel  {{sender.phone}}
E-mail {{sender.email}}$text$
where key = 'quote_default';
