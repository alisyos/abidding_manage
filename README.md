# 에이비딩 관리 시스템

DMP코리아의 자동입찰 솔루션 **에이비딩**을 운영하는 팀을 위한 사무업무 자동화 웹 시스템.

- 거래처(광고주/제휴사) 마스터 관리 (대량 처리 포함)
- 견적서 생성 / 수정 / 임시저장 → 발송 → 수주 → 입금확인 상태 추적 (대량 처리 포함)
- 견적서 이메일 자동 발송 (단건 / 일괄)
- 수주된 견적의 매출 자동 반영 및 월별 피벗 분석

## 기술 스택

- Next.js 14 (App Router) + TypeScript + Tailwind CSS + Pretendard
- Supabase (Postgres + Auth)
- Nodemailer (SMTP 발송)
- 배포: Vercel

## 개발 명령어

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 프로덕션 빌드 검증
npm start
npm run lint
```

## 최초 1회 셋업

### 1. Supabase 프로젝트 생성

1. <https://supabase.com> 에서 새 프로젝트 생성
2. **Settings → API** 에서 다음 3개 값 복사
   - `Project URL`
   - `anon public` 키
   - `service_role` 키 (서버 전용)
3. **SQL Editor** 에서 `supabase/migrations/0001_init.sql` 의 내용을 실행
   - 12종 단가표, sender_profile, 메일 템플릿 2종이 자동 시드됩니다.
4. **Authentication → Users → "Add user"** 로 첫 사용자 등록 (Email + Password)

### 2. 환경 변수 설정

`.env.local.example` 을 `.env.local` 으로 복사하고 값을 채웁니다.

```bash
cp .env.local.example .env.local
```

필수 값:

| 변수 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 (서버 전용) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | 회사 메일 서버 정보 (Phase 3부터 사용) |

### 3. 개발 서버 실행 & 검증

```bash
npm run dev
```

- 접속 시 자동으로 `/login` 으로 리다이렉트
- 등록한 사용자로 로그인 → 사이드바와 placeholder 페이지들이 모두 표시되면 Phase 1 OK

## 폴더 구조

```
src/
├── app/
│   ├── (auth)/login/           로그인 페이지 (사이드바 없음)
│   ├── (auth)/logout/          로그아웃 POST 핸들러
│   ├── (app)/                  인증 필요 화면 (사이드바 마운트)
│   │   ├── page.tsx            대시보드
│   │   ├── companies/          거래처
│   │   ├── quotes/             견적서
│   │   ├── adjustments/        조정
│   │   ├── sales/              매출
│   │   └── settings/           단가표 / 발신자 / 메일 템플릿
│   └── layout.tsx              루트 (Providers 마운트)
├── components/
│   ├── ui/                     Radix 기반 커스텀 컴포넌트 (재사용)
│   ├── layout/sidebar.tsx      사이드바 메뉴
│   ├── providers.tsx           React Query + Toast
│   ├── page-header.tsx
│   └── empty-state.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts           브라우저 클라이언트
│   │   ├── server.ts           서버 클라이언트 (쿠키 세션)
│   │   ├── service.ts          service_role 클라이언트 (서버 전용)
│   │   └── types.ts            DB 타입 + 한글 라벨 매핑
│   └── utils.ts                cn()
└── middleware.ts               세션 갱신 + 인증 가드

supabase/
└── migrations/
    └── 0001_init.sql           전체 스키마 + 시드
```

## 단계별 구현 계획

| Phase | 범위 | 상태 |
|---|---|---|
| **1** | 기반 (Supabase, 인증, 사이드바, 마이그레이션) | ✅ 완료 |
| **2** | 거래처 + 단가표 CRUD, 엑셀 가져오기 (165개 거래처 검증) | ✅ 완료 |
| **3** | 견적서 CRUD, 단건 메일 발송, 수주 → 매출 자동 반영, KST 시간 표시 | ✅ 완료 |
| **4** | 일괄 생성 마법사, SSE 일괄 발송, 조정 모듈(일할 계산), 월매출 피벗 + xlsx 내보내기/임포트 | ✅ 완료 |
| **5** | PDF 메일 첨부, 대시보드 KPI, 에러 바운더리, Vercel 배포 | ✅ 완료 |

## 배포

Vercel 에 배포하는 절차와 환경변수 체크리스트는 [`DEPLOY.md`](./DEPLOY.md) 를 참조하세요. 요점:

- 리전: `icn1` (서울) — `vercel.json` 으로 고정
- 환경변수: Supabase 3종 + SMTP 6종 + APP_URL 총 10종
- 함수 timeout: 일괄 발송 60s, 단건/매출 30s
- Node 런타임 강제 (PDF/메일 라우트 모두 `runtime = 'nodejs'`)

## 데이터 모델 요점

- **매체 코드**: `K` = 네이버_키워드 / `S` = 네이버_쇼핑 / `M` = 카카오_키워드
- **등급**: `unique` / `premium` / `basic` / `lite` (각 단가 시드됨)
- **견적서 상태**: `draft`(임시저장) → `sent`(발송) → `won`(수주) → `paid`(입금확인)
- **금액 공식**: `(Σ(수량×단가) + 부가서비스) × (1 - 할인율) + 고정조정가 + 변동조정가 = 공급가액` → `× 1.1 = 견적가(VAT 포함)`
