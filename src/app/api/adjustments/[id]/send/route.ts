import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getMailFrom, getTransporter } from '@/lib/email/smtp';
import { sendAdjustmentEmailSchema } from '@/lib/validation/adjustment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 조정 안내 메일 발송. 견적 상태는 변경하지 않는다.
 * quote_emails 에 kind='adjustment' 이력만 추가.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '인증되지 않은 사용자' }, { status: 401 });
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 JSON' }, { status: 400 });
  }

  const parsed = sendAdjustmentEmailSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '검증 실패' },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // 조정 → quote_id 조회 (이력 quote_id 채움용)
  const { data: adj, error: aErr } = await supabase
    .from('quote_adjustments')
    .select('id, quote_id')
    .eq('id', params.id)
    .single();
  if (aErr || !adj) {
    return NextResponse.json({ error: '조정 내역을 찾을 수 없습니다' }, { status: 404 });
  }

  // 테스트 발송이면 본인에게만
  let toAddresses = input.to;
  let ccAddresses = input.cc;
  if (input.isTestSend) {
    if (!user.email) {
      return NextResponse.json({ error: '로그인 사용자에 이메일이 없습니다' }, { status: 400 });
    }
    toAddresses = [user.email];
    ccAddresses = [];
  }

  let smtpMessageId: string | null = null;
  let sendError: string | null = null;
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: getMailFrom(),
      to: toAddresses,
      cc: ccAddresses,
      subject: input.subject + (input.isTestSend ? ' [테스트]' : ''),
      html: input.body_html,
      text: input.body_text ?? undefined,
    });
    smtpMessageId = info.messageId ?? null;
  } catch (e) {
    const err = e as Error & { code?: string; response?: string };
    sendError = [
      err.message,
      err.code ? `[code: ${err.code}]` : null,
      err.response ? ` SMTP 응답: ${err.response}` : null,
    ]
      .filter(Boolean)
      .join(' ');
  }

  // 발송 이력 (kind='adjustment')
  await supabase.from('quote_emails').insert({
    quote_id: adj.quote_id,
    kind: 'adjustment',
    to_addresses: toAddresses,
    cc_addresses: ccAddresses,
    subject: input.subject + (input.isTestSend ? ' [테스트]' : ''),
    body_html: input.body_html,
    body_text: input.body_text ?? null,
    status: sendError ? 'failed' : 'sent',
    smtp_message_id: smtpMessageId,
    error: sendError,
    sent_at: sendError ? null : new Date().toISOString(),
    created_by: user.id,
  });

  if (sendError) {
    return NextResponse.json({ error: `발송 실패: ${sendError}` }, { status: 500 });
  }

  revalidatePath(`/quotes/${adj.quote_id}`);
  revalidatePath('/adjustments');

  return NextResponse.json({ ok: true, isTestSend: input.isTestSend });
}
