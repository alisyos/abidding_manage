# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 작업할 때 참고할 가이드입니다.

## 언어 설정
**중요**: 이 프로젝트의 모든 답변/커밋 메시지/UI 문구는 한국어로 작성합니다.

## 프로젝트 개요

**에이비딩 관리 시스템** — DMP코리아의 자동입찰 솔루션을 운영하는 팀이 사용하는 사무업무 자동화 웹 앱.

- 4대 도메인: **거래처 관리 / 견적서 / 조정 / 매출** (모두 대량 처리 포함)
- 견적 상태머신: 임시저장 → 발송 → 수주 → 입금확인 (수주 시 매출 자동 반영)
- 기존 한 개의 xlsm 파일(`Existing form.xlsm`) 운영을 대체

## 기술 스택

- **Core**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **DB + Auth**: Supabase (`@supabase/ssr` + `@supabase/supabase-js`)
- **Email**: Nodemailer (회사 SMTP)
- **UI**: 기존 Radix UI 기반 커스텀 컴포넌트 (`src/components/ui/*`)
- **폼**: React Hook Form + Zod
- **서버 상태**: TanStack Query
- **테이블**: TanStack Table (헤드리스) + 기존 Table UI 래핑
- **엑셀**: SheetJS (xlsx)
- **메일 본문 템플릿**: mustache
- **알림**: react-toastify
- **폰트**: Pretendard

## 디렉토리 구조

```
src/
├── app/
│   ├── (auth)/login/           로그인 (사이드바 없음)
│   ├── (auth)/logout/          로그아웃 POST 핸들러
│   ├── (app)/                  인증 필요 화면 (사이드바)
│   │   ├── page.tsx            대시보드
│   │   ├── companies/          거래처
│   │   ├── quotes/             견적서
│   │   ├── adjustments/        조정
│   │   ├── sales/              매출
│   │   └── settings/           단가표/발신자/메일 템플릿
│   ├── api/                    메일 발송/엑셀 임포트 (Node 런타임)
│   └── layout.tsx              루트 (Providers)
├── components/
│   ├── ui/                     Radix 기반 커스텀 (수정 자제)
│   ├── layout/sidebar.tsx
│   ├── providers.tsx
│   ├── page-header.tsx
│   └── empty-state.tsx
├── lib/
│   ├── supabase/{client,server,service,types}.ts
│   └── utils.ts                cn()
└── middleware.ts               세션 갱신 + /login 가드

supabase/migrations/0001_init.sql   전체 스키마 + 시드
```

## 핵심 가이드라인

### Supabase 클라이언트 사용 규칙

- **브라우저 컴포넌트**: `import { createClient } from '@/lib/supabase/client'`
- **서버 컴포넌트/액션/Route Handler**: `import { createClient } from '@/lib/supabase/server'`
- **service_role (서버 전용)**: `import { createServiceClient } from '@/lib/supabase/service'` — 대량 임포트 등 시스템 작업에만 사용. `'server-only'` 모듈이라 클라이언트에 import 시 빌드 에러.

### 메일 발송 라우트
이메일/엑셀을 다루는 API 라우트는 반드시 `export const runtime = 'nodejs'` 를 명시.

### 데이터 모델 상수
- **Media**: `'K' | 'S' | 'M'` (네이버키워드/네이버쇼핑/카카오키워드)
- **Tier**: `'unique' | 'premium' | 'basic' | 'lite'`
- **QuoteStatus**: `'draft' | 'sent' | 'won' | 'paid'`
- 한글 라벨 매핑은 `src/lib/supabase/types.ts` 의 `MEDIA_LABEL`, `TIER_LABEL`, `QUOTE_STATUS_LABEL` 등을 사용.

### UI 컨벤션
- `src/components/ui/*` 의 기존 컴포넌트를 그대로 재사용. shadcn/ui 추가 금지.
- 새 페이지는 `<PageHeader>` + 본문 패턴. 빈 상태는 `<EmptyState>`.
- 사이드바는 230px 고정, `<main className="ml-[230px]">` 유지.
- 한국어 UI 텍스트.

### 폼 / 검증
- 모든 폼: React Hook Form + Zod (`@hookform/resolvers/zod`).
- 공용 스키마는 `src/lib/validation/schemas.ts` (Phase 2+ 에서 추가).

### 빌드 검증
구현 완료 후 반드시 `npm run build` 통과 확인. WSL/NTFS 심볼릭 링크 이슈가 있는 경우 `node node_modules/next/dist/bin/next build` 로 직접 호출.

## 단계별 구현

| Phase | 범위 | 상태 |
|---|---|---|
| **1** | 기반 (Supabase 클라이언트, 인증, 사이드바, 마이그레이션, placeholder 페이지) | ✅ 완료 |
| **2** | 거래처 + 단가표 CRUD, 엑셀 가져오기 | 대기 |
| **3** | 견적서 CRUD, 단건 메일 발송, 수주 → 매출 자동 반영 | 대기 |
| **4** | 대량 처리 (일괄 생성/발송), 조정 모듈, 월매출 피벗/내보내기 | 대기 |
| **5** | RLS 강화, PDF 출력, 안정화 | 대기 |

상세 플랜: `/home/asc/.claude/plans/federated-hugging-grove.md`
