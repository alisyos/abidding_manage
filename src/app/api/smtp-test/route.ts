import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTransporter } from '@/lib/email/smtp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SMTP 인증만 격리 테스트하는 진단용 엔드포인트.
 * 메일 발송 없이 transporter.verify() 만 호출 → EHLO + AUTH 까지만 시도.
 * 브라우저에서 GET /api/smtp-test 호출.
 */
export async function GET() {
  // 인증된 사용자만 접근 가능
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  try {
    const transporter = getTransporter();
    await transporter.verify();
    return NextResponse.json({
      ok: true,
      message: 'SMTP 인증 성공 — 자격증명/포트/TLS 모두 정상',
      env: {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE,
        user: process.env.SMTP_USER,
        from: process.env.SMTP_FROM,
      },
    });
  } catch (e) {
    const err = e as Error & {
      code?: string;
      command?: string;
      response?: string;
      responseCode?: number;
    };
    return NextResponse.json(
      {
        ok: false,
        message: err.message,
        code: err.code,
        command: err.command,
        response: err.response,
        responseCode: err.responseCode,
        env: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          secure: process.env.SMTP_SECURE,
          user: process.env.SMTP_USER,
          // 비밀번호는 길이만 출력
          passLength: process.env.SMTP_PASS?.length ?? 0,
          from: process.env.SMTP_FROM,
        },
      },
      { status: 500 },
    );
  }
}
