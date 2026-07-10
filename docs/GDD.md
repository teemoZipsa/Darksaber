# Game Design Document (GDD)

**Project**: Darksaber : Extraction

**Genre**: 필드 기반 SRPG + extraction RPG

**Platform**: Web browser (desktop/mobile)

**As-built baseline**: 2026-07-10

이 문서는 장기 아이디어 목록이 아니라 현재 플레이 가능한 규칙의 기준선이다. 세부 구현
위치는 각 절의 source-of-truth 링크를 따르며, 미래 항목은 명시적으로 구분한다.

## 1. 게임의 핵심 약속

- 플레이어는 마을에서 1~3명의 출격 파티를 꾸리고 장비·배낭·창고를 정비한다.
- 출격하면 같은 필드 위에서 이동, 탐색, 전투, 파밍이 끊김 없이 이어진다.
- 레이드는 30분 제한이며 출발지가 아닌 유효한 마을에 도착해야 `SURVIVED`가 된다.
- 생환한 전리품과 퀘스트 결과만 영구 저장된다. `DEAD`, `MIA`, `LEFT`는 실패 규칙을 적용한다.
- 전투는 실시간 이동 위에 ATB/행동력 턴을 결합한다. 준비된 유닛은 이동, 공격, 마법,
  도구, 방어, 휴식, 팡파르, 조사 행동을 선택한다.

규칙의 기준 코드는 `src/raid/RaidRules.ts`, `src/field/FieldActionEconomy.ts`,
`server/WorldSessionRaidResults.ts`다.

## 2. 플레이 루프

1. 계정 로그인과 캐릭터 선택 또는 생성
2. 마을에서 창고, 장비, 상점, 대장간, 치료/휴식, 의뢰, 시설 업그레이드 정비
3. 출격 파티와 보험을 결정하고 레이드 시작
4. 월드 필드나 스토리 실내에서 전투·조사·전리품 획득
5. 다른 마을로 생환하거나 사망/시간초과/이탈 결과 확정
6. 서버 저장을 동기화하고 다음 출격 준비

네트워크 플레이에서는 서버가 이동, LoS, 공격, 마법, 전리품, 시나리오 완료와 레이드
결과를 검증한다. 로컬 DEV 시나리오는 콘텐츠 검증용이며 배포 플레이의 권위 모델이 아니다.

## 3. 캐릭터와 파티

- 로스터는 최대 9명, 한 번에 출격하는 활성 파티는 최대 3명이다.
- 현재 기본 직업 계열은 12개이며 전투/전술/치유/마법의 4개 융합 마스터 계열로 이어진다.
- 직업은 원작 기반 티어/레벨 성장표를 사용하며, 데이터가 없는 구간만 프로젝트 기본 성장값을 쓴다.
- 핵심 전투 능력치는 HP/MP, ATK/DEF, MAG ATK/MAG DEF, SPD, MOV, 명중/치명/회피와
  행동·지휘 관련 파생 수치다. STR/DEX/INT/CON 4스탯 모델은 사용하지 않는다.
- 장비 슬롯, 룬/젬 소켓, 최대 8칸 마법 장착, 스킬 1~5단계 업그레이드를 지원한다.

데이터 기준은 `src/data/content/class-tree.json`, `src/data/Stats.ts`,
`src/data/ItemDB.ts`, `src/data/SkillDB.ts`다.

## 4. 전투와 월드

- 월드는 32×32 타일 chunk를 화면 크기와 preload margin에 맞춰 생성·폐기한다.
- 몬스터는 필드에서 배회하고 탐지/시야/거리 조건에 따라 전투에 진입한다.
- 이동, 원거리 공격과 마법은 지형 통과 가능 여부 및 line of sight를 검사한다.
- 적 역할에는 근접, 원거리, 지원, 치유, 도주, 보스 패턴이 포함된다.
- 밤, 짙은 안개, 보급 투하 raid modifier가 출격마다 결정된다.
- 원작 몬스터 수치는 원장으로 보존하되 현재 피해식에 맞게 정규화해서 사용한다.

세부 밸런스는 `docs/monster-balance.md`, 월드 구조는 `docs/ARCHITECTURE.md`를 따른다.

## 5. 콘텐츠 범위

- 메인 시나리오 1~31화가 데이터, 월드 입구, 목표, 보상, ko/en 텍스트와 함께 구현돼 있다.
- 필드, 비공정, 실내 던전 유형을 지원하며 서버와 로컬 경로가 몬스터/이벤트 원장을 공유한다.
- 32화는 원본 자료 확인 단계이고 33화 이후는 필요한 원본 세트 결손으로 현재 범위 밖이다.
- 스토리 목표 달성은 즉시 영구 완료가 아니며 유효한 생환 뒤에 확정된다.

화별 상태와 원본 자료 계약은 `docs/main-quest-roadmap.md`와
`docs/original-scenario-import.md`가 source of truth다.

## 6. 경제와 위험

- Tarkov식 격자 배낭/창고, 장비 내구도, 소켓, 자동/수동 전리품 획득을 지원한다.
- 마을별 상점 재고, 매입/매출 압력, 상인 계약과 시설 업그레이드가 저장된다.
- 실패하면 raid-scoped 획득물과 일부 장비를 잃으며 보험은 장비 손실 하나를 보호한다.
- 진행 필수 퀘스트 보상은 일반 전리품과 분리해 생환 결과에서 안전하게 확정한다.

저장 계약은 `docs/hub-save-sync.md`와 `server/WorldSessionSaveState.ts`를 따른다.

## 7. UX와 접근성

- 게임 필드는 DPR 대응 Canvas, 차단형 메뉴는 React DOM overlay로 렌더한다.
- 키보드, 마우스, primary pointer/touch 전투 입력을 지원한다.
- 차단형 패널은 dialog 의미론, 초기 포커스, Tab 순환과 포커스 복원을 제공한다.
- 한국어/영어 선택은 저장되며 `<html lang>`과 Canvas/DOM 번역이 함께 바뀐다.
- 색상 규칙은 금색=강조, 빨강=위험으로 제한하고 UI token을 공용 CSS에서 관리한다.

UI 작업 규칙은 `docs/ui-overlay-migration.md`를 따른다.

## 8. 온라인 운영 계약

- Postgres가 계정, 캐릭터 저장, stash, 월드 snapshot과 lease를 영속화한다.
- 진행 중 레이드는 주기적 snapshot과 resume token으로 재접속·서버 재시작 복구를 지원한다.
- 현재 production 지원 범위는 `WORLD_SHARD_COUNT=1`이다. lease와 raid instance routing은
  중복 writer를 막지만 multi-process shard 배치를 완성하지는 않는다.
- `/metrics`는 기술 상태와 레이드 시작/결과/시간/처치 퍼널을 Prometheus 형식으로 노출한다.

배포와 장애 복구 계약은 `docs/deployment.md`를 따른다.

## 9. 명시적 비범위와 다음 판단

현재 구현됐다고 간주하지 않는 항목:

- 다중 shard 자동 배치와 수평 확장
- 완전한 다계정 파티 공유 진행도
- PvP, 길드, 채팅, 경매장 같은 MMORPG 소셜 계층
- 32화 이후 메인 시나리오 완성

다음 우선순위는 기능 수를 늘리는 것보다 실제 플레이 데이터로 생환율, 평균 레이드 시간,
실패 원인과 직업/행동 편중을 확인하고 밸런스를 조정하는 것이다.

## 10. 품질과 배포 기준

- `npm run lint`
- `npm run typecheck`
- `npm run test:coverage` (lines 82%, branches 80%, functions 68% 하한)
- `npm run build` 및 `npm run build:server`
- `npm run test:e2e` (desktop + mobile)

Render 자동 배포는 GitHub checks가 모두 통과한 커밋만 허용한다.

## 11. 배포 전 권리 검토

현재 저장소에는 원작 연구용 명칭·데이터 원장·에셋 참조가 포함돼 있다. 공개 상용 배포 전에는
보유 권리를 확인하고, 허가되지 않은 명칭·그래픽·음원·원문 자료를 프로젝트 고유 자산으로
교체해야 한다. 이 문서는 해당 권리가 확보됐음을 의미하지 않는다.
