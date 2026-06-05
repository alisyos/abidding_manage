import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

let cached: Transporter | null = null;

/**
 * Nodemailer transporter 싱글톤. Vercel 콜드 스타트 영향 최소화를 위해
 * pool 옵션 활성.
 */
export function getTransporter(): Transporter {
  if (cached) return cached;

  // trim 으로 .env 줄 끝 공백/CRLF 등 흔한 입력 실수 방지
  const host = process.env.SMTP_HOST?.trim();
  const portStr = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const secure = process.env.SMTP_SECURE?.trim() === 'true';

  if (!host || !portStr || !user || !pass) {
    throw new Error(
      'SMTP 환경변수가 누락되었습니다. .env.local 의 SMTP_HOST/PORT/USER/PASS 를 확인하세요.',
    );
  }

  const isDev = process.env.NODE_ENV !== 'production';

  cached = nodemailer.createTransport({
    host,
    port: Number(portStr),
    secure,
    auth: { user, pass },
    // 일부 회사 SMTP(특히 Korean 호스팅)는 AUTH PLAIN을 거부 → LOGIN 강제
    authMethod: 'LOGIN',
    pool: true,
    maxConnections: 3,
    // 개발 환경에서만 SMTP 핸드셰이크 로그 노출 (PowerShell dev 콘솔)
    logger: isDev,
    debug: isDev,
    // 회사 SMTP 인증서/구버전 TLS 호환을 위한 진단용 보강 옵션
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1',
    },
  });

  return cached;
}

/** SMTP_FROM 환경변수 (기본값 보정). */
export function getMailFrom(): string {
  return process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@example.com';
}
