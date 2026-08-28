# Darksaber : Extraction

고전 SRPG의 필드 탐험·성장 구조에 extraction RPG의 출격, 파밍, 손실, 생환 규칙을 결합한 웹 게임입니다. TypeScript 기반 Canvas 필드와 React DOM UI, Node.js 권위 서버를 함께 사용합니다.

현재 상태는 **플레이 가능한 개발 빌드**입니다. 핵심 출격 루프와 메인 시나리오 1~31화의 데이터·런타임 경로가 구현돼 있으며, 실제 플레이 완성도와 운영 안정성을 다듬는 단계입니다. 장기 우선순위는 [프로젝트 로드맵](docs/roadmap.md)에서 관리합니다.

## 현재 구현 범위

- 마을에서 1~3인 파티 편성, 장비·마법·배낭·창고 정비 후 출격
- 실시간 필드 이동 위에 ATB/행동력을 결합한 이동·공격·마법·도구·방어·휴식·조사 전투
- 30분 제한, 다른 마을 생환, 사망·실종·중도 복귀 시 배낭과 일부 장비 손실
- 장비 보험, 기본 복구 키트, 전리품 자동/수동 획득, 격자 인벤토리와 소켓
- 마을별 상점·시장 압력·상인 계약·시설 업그레이드·휴식·치료
- 단서 추적과 개인 정예 표적을 포함한 현상수배 의뢰
- 메인 시나리오 1~31화의 월드 입구, 필드/비공정/실내 목표, 보상, 한·영 텍스트
- 캐릭터별 최근 출격 20건 기록: 결과, 경로, 시간, 처치, 확보·손실, 골드 요약
- 계정·캐릭터 저장, 서버 권위 전투/전리품/퀘스트 결과, 재접속과 진행 중 레이드 복구
- 한국어/영어 전환과 데스크톱·모바일 입력/레이아웃

게임 규칙의 상세 기준은 [GDD](docs/GDD.md), 서버·클라이언트 구조는 [아키텍처 문서](docs/ARCHITECTURE.md)를 참고하세요.

## 기술 구성

| 영역 | 구성 |
|---|---|
| 클라이언트 | TypeScript, Vite, Canvas 2D, React 19 DOM overlay |
| 서버 | Node.js, `ws`, 서버 권위 `WorldSession` |
| 저장 | 개발 환경 메모리 저장 또는 Postgres, 캐릭터·창고·월드 세션 snapshot |
| 테스트 | Node test runner, TypeScript typecheck, ESLint, Playwright desktop/mobile |

Node.js `22.13.0` 이상이 필요합니다.

## 로컬 실행

패키지를 설치합니다.

```bash
npm install
```

콘텐츠를 바로 확인하려면 서버와 Vite를 함께 여는 개발 진입 명령을 사용합니다.

```bash
npm run dev:town
```

기본 주소는 `http://127.0.0.1:5731`이며 Vite가 다른 포트로 자동 변경하지 않습니다.

일반 계정 생성·선택 흐름을 확인하려면 두 터미널에서 각각 실행합니다. `DATABASE_URL`이 없는 개발 환경은 메모리 저장소를 사용합니다.

```bash
# 터미널 1
npm run server

# 터미널 2
npm run dev
```

### 개발자 직접 진입

```bash
npm run dev:town
npm run dev:raid
npm run dev:raid:aggro
npm run dev:raid:loot
npm run dev:raid:story -- story31
npm run dev:tutorial
```

스토리 직접 진입은 `story1`부터 현재 구현된 `story31`까지 데이터 기준으로 검증합니다.

## 검증

일반 변경의 기본 검증은 다음과 같습니다.

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

릴리스 수준 검증에는 아래 항목을 추가합니다.

```bash
npm run test:coverage
npm run build
npm run build:server
npm run verify:assets
```

`npm run verify:story`는 추출한 원작 연구 자료와 대조하므로 `DARKSABER_ORIGINAL_SOURCE_ROOT` 설정이 필요합니다. 원본 자료가 없는 환경에서는 `npm run verify:assets`와 일반 테스트만 실행할 수 있습니다.

## 문서 지도

- [프로젝트 로드맵](docs/roadmap.md) — 현재 기준선과 다음 우선순위
- [GDD](docs/GDD.md) — 현재 플레이 규칙
- [메인퀘스트 로드맵](docs/main-quest-roadmap.md) — 1~31화 상태와 후속 검수
- [UI 오버레이 이전](docs/ui-overlay-migration.md) — React DOM/Canvas 경계와 남은 패널
- [허브 저장 동기화](docs/hub-save-sync.md) — 저장 권위와 충돌 처리
- [배포 가이드](docs/deployment.md) — Vercel, Render, Postgres 운영 계약
- [레이드 랩](docs/raid-lab/PLAN.md) — 결정적 시뮬레이션과 밸런스 검증

## 현재 제한 사항

- 운영 서버는 단일 shard(`WORLD_SHARD_COUNT=1`)만 지원합니다.
- 32화는 원본 자료 확인 단계이며 33화 이후는 필요한 원본 세트 결손으로 보류 중입니다.
- 주요 메뉴는 React DOM으로 이전됐지만 출격 결과와 합체 신전은 아직 Canvas 차단형 패널입니다.
- 필수 자산은 검증되지만 BGM 7개와 지형 발소리 3개는 선택 자산으로 남아 있습니다.
- PvP, 길드, 채팅, 경매장과 다계정 공유 파티 진행도는 현재 범위가 아닙니다.

## 배포와 권리 검토

공개 배포는 Vite 프론트엔드, WebSocket 월드 서버, Postgres를 분리합니다. 자세한 환경 변수와 장애 복구 절차는 [배포 가이드](docs/deployment.md)를 따릅니다.

저장소에는 원작 연구를 위한 명칭·데이터 원장·에셋 참조가 포함돼 있습니다. 공개 상용 배포 전에는 보유 권리를 확인하고, 허가되지 않은 명칭·그래픽·음원·원문 자료를 프로젝트 고유 자산으로 교체해야 합니다.
