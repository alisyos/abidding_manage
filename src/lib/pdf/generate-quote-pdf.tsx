import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { ensureFontsRegistered } from './fonts';
import { QuotePdfDocument, type QuotePdfProps } from './quote-pdf';

/**
 * 견적서 PDF Buffer 생성.
 * 메일 첨부 또는 다운로드 응답에 그대로 사용.
 *
 * 평균 크기 100~250KB (단일 페이지 기준).
 * 평균 생성 시간: cold start 시 폰트 로드 포함 ~500ms, warm 시 ~200ms.
 */
export async function generateQuotePdfBuffer(props: QuotePdfProps): Promise<Buffer> {
  ensureFontsRegistered();
  return await renderToBuffer(<QuotePdfDocument {...props} />);
}
