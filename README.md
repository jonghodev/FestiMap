# FestiMap 🗺️

서울 및 수도권의 축제, 플리마켓, 야시장을 지도 기반으로 탐색하는 모바일 우선 웹 서비스입니다.

## 기술 스택

- **Framework**: Next.js 15 (App Router)
- **Database**: PostgreSQL on AWS RDS (Prisma ORM)
- **Map**: Kakao Map JavaScript SDK
- **Auth**: bcrypt + JWT (30일 유효)
- **UI**: TailwindCSS + shadcn/ui
- **Deploy**: Vercel (Free tier, `icn1` Seoul 리전)

## 로컬 개발 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.local` 파일을 생성하고 아래 내용을 채워넣으세요:

```bash
# Kakao Map JavaScript SDK App Key
# https://developers.kakao.com > 내 애플리케이션 > 앱 키 > JavaScript 키
NEXT_PUBLIC_KAKAO_MAP_APP_KEY=your_kakao_javascript_app_key

# 로컬 개발용 SQLite
DATABASE_URL=file:./dev.db

# JWT 시크릿 (최소 32자)
JWT_SECRET=dev-secret-change-in-production-min-32-chars

# 앱 URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. 데이터베이스 초기화

```bash
# SQLite 마이그레이션 (로컬 개발)
npm run db:migrate

# 시드 데이터 삽입 (50+ 서울 이벤트)
npm run db:seed
```

### 4. 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.

## Vercel 배포 설정

### Vercel 프로젝트 정보

- **프로젝트명**: `festimap`
- **GitHub 연동**: `jonghodev/FestiMap`
- **배포 리전**: `icn1` (서울)
- **URL**: https://festimap.vercel.app

### 필수 환경 변수 (Vercel Dashboard에서 설정 필요)

Vercel Dashboard → Settings → Environment Variables에서 아래 변수를 실제 값으로 업데이트하세요.

| 변수명 | 설명 | 환경 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 (RDS) | Production |
| `JWT_SECRET` | JWT 서명 시크릿 (32자 이상, 자동 생성됨) | All |
| `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` | 카카오 JavaScript API 키 | All |
| `KAKAO_REST_API_KEY` | 카카오 REST API 키 (데이터 수집용) | Production |
| `ANTHROPIC_API_KEY` | Claude Haiku API 키 | Production |
| `NEXT_PUBLIC_APP_URL` | 서비스 URL | All |

### DATABASE_URL 형식

```
postgresql://USER:PASSWORD@HOST:5432/festimap?schema=festimap
```

### JWT_SECRET 재생성 (필요시)

```bash
openssl rand -base64 32
```

### 카카오 API 키 발급

1. [Kakao Developers](https://developers.kakao.com) 접속
2. 내 애플리케이션 → 애플리케이션 추가하기
3. 앱 키에서 **JavaScript 키** (지도용) 및 **REST API 키** (데이터 수집용) 복사
4. 플랫폼 → Web 플랫폼 등록: 서비스 도메인 추가
   - `https://festimap.vercel.app`
   - `http://localhost:3000` (로컬 개발용)

### 배포 흐름

1. `main` 브랜치에 푸시 → Vercel 자동 빌드 트리거
2. 빌드 중 자동 실행:
   - `prisma generate --schema=prisma/schema.production.prisma`
   - `prisma migrate deploy --schema=prisma/schema.production.prisma`
   - `next build`
3. PostgreSQL 마이그레이션 자동 적용

## 스크립트

```bash
npm run dev              # 개발 서버
npm run build            # 프로덕션 빌드 (로컬)
npm run db:generate      # Prisma 클라이언트 생성 (SQLite)
npm run db:migrate       # 마이그레이션 실행 (SQLite)
npm run db:push          # 스키마 동기화 (SQLite)
npm run db:seed          # 시드 데이터 삽입
npm run db:prod:generate # Prisma 클라이언트 생성 (PostgreSQL)
npm run db:prod:migrate  # 마이그레이션 배포 (PostgreSQL)
```

## 프로젝트 구조

```
src/
├── app/
│   ├── api/events/         # 이벤트 API 엔드포인트
│   ├── events/[id]/        # 이벤트 상세 페이지
│   ├── layout.tsx          # 루트 레이아웃 (PWA 메타데이터)
│   └── page.tsx            # 홈 (지도 뷰)
├── components/
│   ├── map/                # 카카오 맵 컴포넌트
│   └── MapPageClient.tsx   # 메인 지도 클라이언트
├── hooks/
│   ├── useKakaoMap.ts      # 카카오 맵 SDK 훅
│   └── useViewportEvents.ts # 뷰포트 기반 이벤트 로딩
├── lib/
│   ├── auth.ts             # JWT 인증 유틸리티
│   ├── prisma.ts           # Prisma 싱글톤
│   └── kakao-loader.ts     # 카카오 SDK 로더
└── types/                  # TypeScript 타입 정의
prisma/
├── schema.prisma           # 개발용 스키마 (SQLite)
├── schema.production.prisma # 프로덕션 스키마 (PostgreSQL)
└── seed.ts                 # 시드 데이터
```
