/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // @react-pdf/renderer 는 node:fs/path 의존성 + 동적 require 가 있어
    // webpack 번들링에서 제외하고 서버 런타임이 외부 모듈로 로드하게 함.
    serverComponentsExternalPackages: ['@react-pdf/renderer'],

    // Pretendard 폰트(public/fonts/*.ttf)를 PDF 생성 시 동적 fs.read 로 로드.
    // Next.js 정적 분석으로는 함수 번들에 trace 되지 않으므로 명시적 포함.
    // (Next 14.x: experimental 하위 key, 라우트 키는 page route 기준)
    outputFileTracingIncludes: {
      '/api/quotes/[id]/send': ['./public/fonts/**'],
      '/api/quotes/bulk-send': ['./public/fonts/**'],
    },
  },
};

export default nextConfig;
