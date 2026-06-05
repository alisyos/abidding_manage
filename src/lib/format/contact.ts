/**
 * 견적서DB 시트의 메일 양식 컬럼처럼 `'[회사명]담당자명' <email>` 형식의
 * 사전 포맷된 수신자 문자열을 생성한다.
 *
 * - 회사명/담당자 중 빈 값은 brackets/이름을 생략
 * - 이메일 없으면 빈 문자열 반환
 */
export function generateFormattedAddress(args: {
  companyName: string | null | undefined;
  displayName: string | null | undefined;
  email: string | null | undefined;
}): string {
  const email = args.email?.trim();
  if (!email) return '';

  const company = args.companyName?.trim();
  const name = args.displayName?.trim();

  const label = [company ? `[${company}]` : '', name ?? ''].join('').trim();
  return label ? `'${label}' <${email}>` : `<${email}>`;
}
