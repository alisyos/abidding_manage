import Mustache from 'mustache';

/**
 * 메일 템플릿 변수.
 *  - period_label: '2026.06' 또는 '2026.06~2026.07'
 *  - sender.*: 발신자 스냅샷
 *  - company.*: 거래처 정보
 *  - quote.*: 견적 요약 (total_amount는 미리 formatKRW로 가공)
 */
export interface RenderVars {
  period_label: string;
  sender: {
    contact_name: string;
    company_name: string;
    phone: string;
    email: string;
    bank_account: string;
  };
  company: {
    name: string;
  };
  quote: {
    quote_no: string;
    service_start: string;
    service_end: string;
    total_amount: string;
  };
  /**
   * 조정 안내 메일에만 채워짐. mustache 의 `{{#adjustment}}...{{/adjustment}}`
   * 섹션으로 활용. 단순 quote_default 템플릿에서는 무시됨.
   */
  adjustment?: {
    adjustment_date: string;
    media_label: string;
    items: { tier_label: string; delta: number }[];
    pre_adjust_amount: string;       // formatKRW 가공 결과
    pre_adjust_amount_raw: number;   // 부호 비교용 원시값
    reason: string;
  };
}

export interface RenderedEmail {
  subject: string;
  body_html: string;
  body_text: string;
}

/**
 * Mustache 기반 템플릿 렌더링. 모든 필드를 렌더한다.
 */
export function renderEmailTemplate(
  tmpl: { subject: string; body_html: string; body_text: string | null },
  vars: RenderVars,
): RenderedEmail {
  return {
    subject: Mustache.render(tmpl.subject ?? '', vars),
    body_html: Mustache.render(tmpl.body_html ?? '', vars),
    body_text: Mustache.render(tmpl.body_text ?? '', vars),
  };
}
