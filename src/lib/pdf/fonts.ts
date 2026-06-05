import 'server-only';
import path from 'node:path';
import { Font } from '@react-pdf/renderer';

let registered = false;

/**
 * Pretendard 한글 폰트를 @react-pdf/renderer 에 등록.
 * 모듈 첫 호출 시 단 1회 실행 (가드).
 *
 * Vercel 호환성:
 *  - public/fonts/*.ttf 는 Next.js 정적 분석으로 자동 trace 되지 않으므로
 *    next.config.mjs 의 outputFileTracingIncludes 에 명시적 포함 필수
 *  - process.cwd() 는 Vercel serverless 환경에서 /var/task 의 함수 루트
 *  - 폰트 미등록 시 React-PDF가 Helvetica로 fallback → 한글 깨짐
 */
export function ensureFontsRegistered(): void {
  if (registered) return;

  const fontDir = path.join(process.cwd(), 'public', 'fonts');

  Font.register({
    family: 'Pretendard',
    fonts: [
      { src: path.join(fontDir, 'Pretendard-Regular.ttf'), fontWeight: 400 },
      { src: path.join(fontDir, 'Pretendard-Medium.ttf'), fontWeight: 500 },
      { src: path.join(fontDir, 'Pretendard-Bold.ttf'), fontWeight: 700 },
    ],
  });

  // 한글 단어가 임의로 분리되지 않도록 hyphenation 비활성화
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
