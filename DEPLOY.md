# 배포 가이드 — Vercel

이 문서는 **에이비딩 관리 시스템**을 Vercel 에 배포하는 절차를 단계별로 안내합니다.

## 0. 사전 준비

- GitHub (또는 GitLab/Bitbucket) 저장소에 코드 푸시 완료
- Supabase 프로젝트 (URL/anon/service_role 키 확보, `0001_init.sql` + `0002_companies_name_unique.sql` 마이그레이션 적용 완료)
- 회사 SMTP 계정 (HOST/PORT/USER/PASS/FROM) — 로컬 dev에서 발송 검증 완료 권장

---

## 1. Vercel 프로젝트 임포트

1. <https://vercel.com> 접속 → **Add New** → **Project**
2. **Import Git Repository** → 에이비딩 저장소 선택
3. 설정 자동 인식 확인:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Install Command**: `npm install`
   - **Output Directory**: `.next` (자동)
4. 환경변수는 다음 단계에서 입력하므로 일단 **Deploy** 보류

---

## 2. 환경변수 등록

Settings → **Environment Variables** 에서 아래 10개를 모두 등록합니다.
환경 스코프는 **Production / Preview / Development** 모두 체크.

| 키 | 예시 / 비고 | 보안 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` 또는 JWT `eyJhbG...` | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` 또는 JWT | **Encrypted** |
| `SMTP_HOST` | `mail6.secuecloud.com` | |
| `SMTP_PORT` | `587` (또는 `465`) | |
| `SMTP_SECURE` | `false` (587/STARTTLS) 또는 `true` (465/SSL) | |
| `SMTP_USER` | `noreply@your-company.co.kr` | |
| `SMTP_PASS` | (메일 계정 비밀번호) | **Encrypted** |
| `SMTP_FROM` | `"DMP코리아 <noreply@your-company.co.kr>"` | |
| `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app` (배포 후 갱신) | Public |

---

## 3. 리전 / 함수 설정

`vercel.json` 으로 다음을 강제합니다:

```json
{
  "regions": ["icn1"],
  "functions": {
    "src/app/api/quotes/bulk-send/route.ts": { "maxDuration": 60 },
    "src/app/api/quotes/[id]/send/route.ts": { "maxDuration": 30 },
    "src/app/api/sales/export/route.ts":     { "maxDuration": 30 },
    "src/app/api/sales/import/route.ts":     { "maxDuration": 60 },
    "src/app/api/companies/import/route.ts": { "maxDuration": 60 },
    "src/app/api/adjustments/[id]/send/route.ts": { "maxDuration": 30 }
  }
}
```

- **리전**: `icn1` (서울) — 한국 사용자 응답속도 + Supabase ap-northeast-2와 동일 리전
- **maxDuration**: PDF 생성 + SMTP 전송이 1건당 ~2초 → 일괄 발송 60s, 단건 30s 권장

> ⚠ **Vercel Hobby 플랜**은 함수당 최대 60초입니다. 일괄 발송 대상이 ~30건을 초과하면 분할 발송 권장 (Pro 플랜은 최대 300초).

---

## 4. 첫 배포 후 검증 (6스텝)

1. **로그인**: `https://<도메인>/` 접속 → 자동으로 `/login` 리다이렉트 → Supabase Auth에 등록한 사용자로 로그인
2. **대시보드**: 4개 KPI 카드가 KRW/건수 포맷으로 표시 (DB 비어있으면 0원/0건)
3. **메일 발송 (테스트)**: 견적 1건의 발송 화면에서 **"테스트 발송"** 체크 → 본인 메일함에 **PDF 첨부된** 메일 수신 확인
   - PDF 한글이 ▢▢▢ 로 깨지지 않는지 확인 (깨지면 → 6.문제해결 §1 참조)
4. **함수 로그**: Vercel Dashboard → Deployments → 해당 배포 → Functions → `/api/quotes/[id]/send` 로그에서:
   - Region: `icn1` 확인
   - 첫 호출(cold): 2~4초, 이후(warm): 1~2초
5. **일괄 발송**: 2~5건 선택 → 일괄 발송 → SSE 진행률 토스트, 각 건마다 PDF 첨부 정상 발송
6. **404 / 에러**: `/no-such-page` 접속 시 not-found 페이지, 임의로 에러 던지면 error.tsx 화면

---

## 5. 도메인 연결 (선택)

배포가 안정되면:

1. Settings → **Domains** → "Add Domain" → 커스텀 도메인 입력
2. DNS A/CNAME 레코드 등록 (Vercel 안내 따름)
3. SSL 인증서 자동 발급 대기 (~5분)
4. `NEXT_PUBLIC_APP_URL` 환경변수를 새 도메인으로 갱신 후 재배포

---

## 6. 문제 해결

### 1) PDF 한글이 ▢▢▢ 로 표시
- **원인**: Pretendard 폰트가 함수 번들에 포함되지 않음
- **확인**: `.vercel/output/functions/api/quotes/...` 또는 빌드 로그에서 `public/fonts/*.ttf` 포함 여부
- **수정**: `next.config.mjs` 의 `experimental.outputFileTracingIncludes` 에 해당 라우트 경로 + `./public/fonts/**` 가 등록되어 있는지 확인. `public/fonts/Pretendard-{Regular,Medium,Bold}.ttf` 3개 파일이 저장소에 커밋되어 있는지 확인.

### 2) 빌드 시 `@react-pdf/renderer` 경고/오류
- `next.config.mjs` 의 `experimental.serverComponentsExternalPackages: ['@react-pdf/renderer']` 등록 확인

### 3) SMTP `535 Authentication unsuccessful`
- `SMTP_PASS` 가 메일 계정의 실제 비밀번호와 같은지 (앱 전용 비밀번호 필요 여부 확인)
- `SMTP_SECURE` 가 포트와 일치하는지 (587 → false, 465 → true)
- 호스팅 관리자에게 SMTP 외부 발신 활성화 요청 (일부 호스팅은 별도 토글)
- 로컬에서 `/api/smtp-test` 로 단독 검증

### 4) Function timeout
- 일괄 발송 대상이 30건 초과 → 분할 발송 권장
- Pro 플랜으로 업그레이드 시 maxDuration 을 300까지 늘릴 수 있음

### 5) Supabase RLS 에러
- 첫 배포 시 모든 테이블에 `authenticated` 정책이 적용된 상태
- 임포트/대량 발송 라우트는 `service_role` 키를 사용 (env 등록 필수)

### 6) Region 불일치 / 느린 응답
- `vercel.json` 의 `regions: ["icn1"]` 확인
- Hobby 플랜은 1개 리전만 지정 가능

---

## 7. 운영 체크리스트

- [ ] 첫 사용자 1명 이상 Supabase Authentication 에 등록
- [ ] `sender_profile` (id=1) 의 회사 정보 정확히 입력 (`/settings/sender`)
- [ ] `email_templates` 의 `quote_default` / `adjustment_default` 본문 검토 (`/settings/email-templates`)
- [ ] 단가표 12종 시드 값 확인 (`/settings/products`)
- [ ] 테스트 메일 1건 발송 → PDF 첨부 + 본문 정상 확인
- [ ] 거래처 엑셀 임포트 (`/companies/import`) 로 초기 데이터 적재

---

## 참고

- 로컬 개발: `npm run dev` (PowerShell 또는 WSL) — `.env.local` 사용
- 로컬 빌드 검증: `npm run build`
- Supabase 마이그레이션 SQL: `supabase/migrations/000{1,2}_*.sql`
