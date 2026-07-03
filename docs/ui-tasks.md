# UI 인수인계 (Codex 이어받기용) — 2026-06-04 기준

> 캔버스 UI → React DOM 오버레이("풀다크 Darkest Dungeon") 이전은 주요 패널 기준 완료 상태입니다.
> 이 문서는 **남은 후속 점검**, **최근 수정 기록**, **건드리면 안 되는 것**을 정의합니다.
> 작업 규칙·아키텍처는 루트 `AGENTS.md` + `docs/ui-overlay-migration.md` 참고.

## ✅ 이미 끝난 것 (커밋됨)
| 영역 | React 위치 | 비고 |
|---|---|---|
| 캐릭터창 (C) | `src/ui/react/character/*` | |
| 일시정지 (ESC) | `src/ui/react/PauseMenu.tsx` | |
| 설정 | `src/ui/react/settings/SettingsPanel.tsx` | i18n·aria·인라인스타일 정리 완료 |
| 파티 (P) | `src/ui/react/party/PartyPanel.tsx` | i18n·빈슬롯·aria 완료 |
| 캐릭생성 | `src/ui/react/charcreate/CharacterCreation.tsx` | 독립 state, 캔버스 `CharacterCreationUI.ts` 삭제됨 |
| 마을 전체 | `src/ui/react/town/*` | 헤더·탭바·출격 + 상점/휴식/퀘스트/소문 |
| 인벤토리 | `src/ui/react/inventory/InventoryPanel.tsx` | 듀얼그리드+장비+드래그앤드롭, 월드(I키)·마을창고 양쪽 |

- [x] 시작 튜토리얼: 캐릭터 생성 확인 후 `WorldEngine` 전투 프리미티브를 쓰는 실내 대련장으로 진입. 킹 교관 안내에 따라 이동/공격/휴식/마법/처치 훈련을 마치거나 Esc로 스킵하면 기존 마을 화면으로 이동. 튜토리얼은 온보딩 연습장일 뿐 별도 로컬 게임 모드가 아니다.

캔버스에 남은 것(이전 대상 아님): 월드 렌더, 적 체력바, 플로팅 데미지, 전술 마커, 방사형 액션메뉴 등 **월드/카메라 좌표 HUD**.

---

## 현재 후속 점검

- [x] 필드 비어그로 몬스터가 ATB를 충전한 뒤 행동 없이 즉시 초기화하는 문제 수정. 비어그로 몬스터는 ATB 0을 유지하고, 어그로가 시작된 몬스터만 ready 턴에 들어간다.
- [x] 실제 레이드 화면에서 어그로 진입 후 몬스터 추격/공격 동선 브라우저 확인.
  - 진행: `tests/field/world-enemy-turn-controller.test.ts`에 어그로 상태 적이 사거리 밖에서는 추격하고 인접 후 1회 공격하는 회귀 테스트를 추가.
  - 진행: Browser에서 `devStart=raid` 레이드 자동 진입과 월드 인벤토리 오버레이를 확인.
  - 완료: `devStart=raid&devScenario=aggro` 실제 레이드 화면에서 어그로 적의 추격 후 강제 인접 공격 로그/상태 배지 확인.
- [x] 저주받은 유물 구현: 봉인된 유물함에서 낮은 확률로 고가치 저주 유물이 나오고, 레이드 배낭에 든 동안 행동력 회복 저하와 턴 시작 HP 피해를 적용한다.
- [x] DOM 오버레이 후속 약점 보강: 오버레이 열림/월드 차단 레지스트리 단일화, 동적 i18n guard 보강, 모바일 오버레이 e2e 추가, 일반형 스토리 dev 스크립트 추가.
- [x] `WorldEngine` 생성자 후속 정리: 전투·행동, 레이드 라이프사이클, 표시·입력 컨트롤러 배선을 feature별 initializer로 분리해 생성자 조립부를 축소.
- [x] DEV 스토리 시작 스크립트 정리: `dev:raid:story1`~`story31` 수동 별칭을 제거하고, 일반형 `dev:raid:story -- storyNN`이 `story-scenarios.json` 데이터로 지원 에피소드를 검증하도록 변경.
- [x] i18n guard 보강: wrapper literal 키(`formatSkillLog`/`logEnemy`/로그 색상 키), 템플릿 조합 key family, 타일/지형 hazard 데이터 키를 ko/en 양쪽 검증에 포함.
- [x] 브라우저 e2e 보강: Playwright에 Mobile Chrome 프로젝트를 추가하고, DEV 전리품 패널에서 실제 포인터 드래그로 loot→backpack 이동을 검증.
- [x] 서버 세션 snapshot restore 초기화 순서 수정: `ownedSessionKeys`를 restore 호출 전에 초기화해 서버 재시작 복구 경로의 TDZ 오류를 제거.
- [x] `WorldEngine` 시작 흐름 후속 정리: 생성자에 남은 튜토리얼/네트워크 resume/마을 진입 분기를 `WorldEngineStartupFlow`로 분리하고 단위 테스트로 순서를 고정.
- [x] `WorldEngine` 시나리오/네트워크 배선 후속 정리: 스토리·튜토리얼·네트워크 sync/intent/event 컨트롤러 생성을 `WorldEngineScenarioNetworkControllers` factory로 분리해 생성자 충돌 표면을 축소.
- [x] 클라이언트/서버 시나리오 규칙 공유화: 필드 이벤트의 USEITEM/RANDOM/MAGIC trigger 해석과 트랩 피해 계산을 `StoryScenarioFieldEventRules`로 통합해 로컬/네트워크 레이드 분기 위험을 축소.
- [x] 장시간 DOM 오버레이 e2e 보강: DEV 튜토리얼 월드에서 인벤토리·마법 장착·일시정지 패널을 반복 토글하며 overlay registry, 화면 맞춤, 클라이언트 오류 부재를 검증.
- [x] i18n guard AST화: `t`/`formatT`/wrapper literal 키, template key family, ko/en 번역 블록 추출을 TypeScript AST 기반으로 바꿔 regex 누락 위험을 축소.
- [x] field nest 재생성 seed 안정화: forced nest 생성이 일반 생성과 같은 RNG 순서/중심 좌표를 쓰게 해 cleared nest respawn 테스트의 sessionEpoch 의존성을 제거.
- [x] `WorldEngine` support-controller 배선 분리: minimap/combat feedback/temple/resting controller 생성을 `WorldEngineWorldControllers` factory로 이동해 생성자 직접 배선과 충돌 표면을 축소.
- [x] 네트워크 끊김 UX e2e 보강: 실제 dev 네트워크 레이드에서 WebSocket transport drop을 유발하고 재접속 상태 로그와 레이드 유지/복구를 Playwright로 검증.
- [x] 클라이언트/서버 레이드 탈출 판정 공유화: 마을 도착 규칙을 `RaidRules`의 leave/result 판정으로 확장하고 서버 `WORLD_LEAVE`/생존 보정을 같은 함수로 처리해 departure town 생환 우회 위험을 축소.
- [x] `WorldEngine` presentation-controller 배선 분리: tactical/render/input controller 생성을 `WorldEnginePresentationControllers` factory로 이동해 월드 UI 표시·입력 배선의 충돌 표면을 축소.
- [x] `WorldEngine` combat-core 배선 분리: turn-start/combat flow/movement/enemy-turn/field-spawn controller 생성을 `WorldEngineCombatControllers` factory로 이동해 전투 기능 추가 시 `WorldEngine.ts` 충돌 표면을 축소.
- [x] `WorldEngine` action-controller 배선 분리: selection/loot/magic/tool/player-action controller 생성을 `WorldEngineActionControllers` factory로 이동해 액션·전리품·전술 입력 기능 추가 시 `WorldEngine.ts` 충돌 표면을 축소.
- [x] `WorldEngine` raid-lifecycle 배선 분리: raid outcome/lifecycle controller 생성을 `WorldEngineRaidLifecycleControllers` factory로 이동해 레이드 종료·네트워크 레이드 기능 변경 시 `WorldEngine.ts` 충돌 표면을 축소.
- [x] `WorldEngine` flow 배선 분리: update/action-turn flow 생성을 `WorldEngineFlows` factory로 이동해 프레임 업데이트·턴 메뉴 기능 변경 시 `WorldEngine.ts` 직접 배선을 줄임.
- [x] `WorldEngine` 생성자 배선 축소: world support/scenario-network controller 조립을 전용 initializer로 분리해 생성자가 세션 초기화와 조립 순서만 드러내도록 정리.
- [x] `WorldEngine` presentation controller 필드 축소: tactical/render/input controller 개별 필드를 `presentationControllers` aggregate로 묶어 컨트롤러 상태 표면을 줄임.
- [x] `WorldEngine` action controller 필드 축소: selection/loot/magic/tool/player-action controller 개별 필드를 `actionControllers` aggregate로 묶어 액션 기능 변경 시 필드 충돌 표면을 줄임.
- [x] `WorldEngine` combat controller 필드 축소: turn-start/combat-flow/movement/enemy-turn/field-spawn controller 개별 필드를 `combatControllers` aggregate로 묶어 전투 기능 변경 시 필드 충돌 표면을 줄임.
- [x] `WorldEngine` raid lifecycle controller 필드 축소: raid-outcome/raid-lifecycle controller 개별 필드를 `raidLifecycleControllers` aggregate로 묶어 레이드 종료·복귀 기능 변경 시 필드 충돌 표면을 줄임.
- [x] `WorldEngine` world support controller 필드 축소: minimap/combat-feedback/temple/resting controller 개별 필드를 `worldControllers` aggregate로 묶어 월드 보조 기능 변경 시 필드 충돌 표면을 줄임.
- [x] `WorldEngine` scenario/network controller 필드 축소: story/tutorial/network-sync/network-intent/network-events controller 개별 필드를 `scenarioNetworkControllers` aggregate로 묶고 DEV 시나리오 진입도 aggregate를 통해 접근하도록 정리.
- [x] `WorldEngine` network runtime state 필드 축소: network raid client/connection flags/player id를 `networkState` aggregate로 묶고 DEV/e2e 디버그 접근은 accessor로 유지.
- [x] 클라이언트/서버 intent payload 규칙 공유화: 네트워크 player intent payload builder/reader를 `WorldIntentPayloads`로 분리해 클라이언트 전송 shape와 서버 검증 key가 갈라지는 위험을 줄임.
- [x] `WorldEngine` runtime state 필드 축소: phase/worldTime/hover/fanfare-follow 상태를 `runtimeState` aggregate로 묶어 월드 루프 상태 변경 표면을 줄임.
- [x] `WorldEngine` UI/feedback state 필드 축소: action menu/entity info/fusion temple/floating text/effects/combat log 상태를 `uiState` aggregate로 묶어 표시·피드백 기능 변경 시 필드 충돌 표면을 줄임.
- [x] `WorldEngine` field state 필드 축소: party actors/field enemies/remote party actors를 `fieldState` aggregate로 묶어 전투·네트워크 snapshot 상태 변경 표면을 줄임.
- [x] `WorldEngine` flow state 필드 축소: turn state controller와 update/action-turn flow cache를 `flowState` aggregate로 묶어 프레임·턴 흐름 상태 변경 표면을 줄임.
- [x] `WorldEngine` controller state 필드 축소: combat/action/raid/presentation/scenario/world controller aggregate들을 `controllerState` backing store로 묶어 controller 조립 필드 충돌 표면을 줄임.

---

## 완료된 이번 후속 작업

- 완료: 원작 몬스터 `ability.json` row를 `originalMonsters` 원장으로 분리하고, 현재 전투식용 정규화 계층(`originalMonsterBalance`)을 추가. `Enemy`는 `monsterId`가 있으면 정규화 스탯을 사용하며, 서버 스폰과 로컬 실내 시나리오가 같은 `StoryScenarioMonsterData` 몬스터 ID 표를 공유한다. 세부 기준은 `docs/monster-balance.md`.
- 완료: DEV 전용 시작 링크 추가. 개발 모드 기본 화면에서 Town/Raid/Tutorial 링크로 바로 진입 가능.
- 완료: `devStart=town`은 튜토리얼을 건너뛰고 마을로 진입, `devStart=raid`는 마을 출격 경로를 통해 레이드에 자동 진입, `devStart=tutorial`은 캐릭터 생성 없이 튜토리얼 대련장으로 진입.
- 완료: `npm run dev:town`, `npm run dev:raid`, `npm run dev:raid:aggro`, `npm run dev:raid:loot`, `npm run dev:tutorial` 스크립트 추가.
- 완료: `devStart=raid&devScenario=loot` / `npm run dev:raid:loot`로 실제 레이드 전리품 DOM 패널을 열고 포인터 검증할 수 있는 DEV 시나리오 추가.
- 완료: 데이터 기반 UI 키를 `tests/raid/i18n-guards.test.ts`에서 ko/en 양쪽 검증하도록 보강하고 누락된 `inv.accessory2` 키 추가.
- 완료: 작은 화면에서 인벤토리 패널이 화면 밖으로 밀리지 않도록 폭 제한, 컬럼 고정, 가로 스크롤, 줄바꿈 CSS 보강.
- 완료: 멀티플레이 클라이언트 상태/재접속/서버 오류 로그를 i18n 기반 플레이어 친화 문구로 정리.
- 완료: 레이드 modifier 구현. 출격마다 야간/안개/보급 투하 중 하나를 적용하고 서버/클라이언트 snapshot, ATB 회복량, 보급 상자 스폰에 반영.
- 완료: 마크드 상자 + 마스터키 구현. 레이드마다 잠긴 고가치 상자가 스폰되고, 희귀 마스터키를 소비해야 서버 권위로 열리며 unlock 상태가 snapshot/persistence에 유지된다.
- 완료: 시설 업그레이드 V1 구현. 골드와 전리품 납품으로 치료소/정비대를 영구 강화하고, 치료비/정비비 할인을 저장·서버 patch·마을 UI에 반영한다.
- [x] 상인 반복 의뢰 V1 구현. 기존 시장 계약을 퀘스트 게시판에 노출하고, 배낭/창고 교역품 납품으로 기본 판매가+의뢰 보너스를 지급하며 계약 수량·만료·저장 동기화를 기존 시장 사이클과 공유한다.
- [x] 전설급 유물/희귀 전리품 티어 V1 구현. 후반 원작 relic 아이템을 전설 전리품 풀로 분리하고, 마크드 상자와 봉인 유물함의 낮은 확률 대박 보상에 연결한다.
- [x] 보험 시스템 V1 구현. 마을 출격 전 골드를 내고 다음 레이드 장비 보험을 가입하면 실패 시 장비 손실 1개를 보호하고 레이드 종료 시 보험을 소모한다.
- [x] 환경 함정/독 늪지대 체감 강화 V1 구현. 독 늪 진입 시 중독과 둔화를 부여하고, 지형 hover와 전투 로그/상태 텍스트로 위험을 명확히 표시한다.

---

## 완료된 이전 후속 작업

### 1. 인벤토리 드래그앤드롭 **실제 마우스 검증** (완료)
`npm run dev`로 띄워 Browser 실제 포인터 입력으로 확인:
- 완료: 배낭 ↔ 마을창고(ext) 그리드 간 드래그 이동 (빈 칸 배치).
- 완료: 그리드 → 장비 슬롯 드래그(장착), 장비 → 그리드 드래그(해제).
- 완료: 장비 슬롯끼리 교체(swap) — 기존 장비가 배낭으로 돌아오는 것 확인.
- 완료: 소켓 아이템(◇ 표시) 위에 젬 드롭 시 소켓 삽입 확인 (`◇` → `◆`).
- 완료: **클릭(드래그X)** = 퀵트랜스퍼 (배낭→창고, 창고→배낭, 장비→배낭).
- 완료: 레이드 전리품 모델 경로(`moveToCell`/`quickMove`/`takeAll`)가 `onRaidLootSecured`를 호출하는지 `tests/raid/core.test.ts`로 보강.
- 완료: `devStart=raid&devScenario=loot` 실제 레이드 화면에서 전리품 DOM 패널을 열고 Browser 포인터 드래그로 전리품을 배낭에 드롭. 외부 전리품 1→0, 배낭 4→5, DEV 상태 `picked:dev_raid_loot:0,0` 확인.
드롭 위치는 커서 아래 셀이 아이템의 **좌상단**.

검토 메모:
- 완료: 장착 슬롯에 기존 장비가 있고 배낭이 가득 찬 상태에서 외부 그리드/전리품 장비를 해당 슬롯에 드롭하면 기존 장비가 유실될 수 있던 `InventoryUI.moveToEquip` 버그 수정. 실패 시 새 장비를 원위치로 복구하고 기존 장비를 유지하도록 테스트 보강.

### 2. 상점 카테고리 데이터 마무리 (완료)
- 완료: `src/data/ShopData.ts` / `ItemDB.ts` / `OriginalShopItems.ts` 정합성 확인.
- 완료: i18n 키 `shop.weapon/armor/accessory/consumable` ko/en 존재 확인.
- 완료: 마을 상점 탭에서 4개 카테고리 버튼·아이템 목록·구매/판매 렌더 확인.
- 완료: `tests/raid/core.test.ts` 변경분 포함 → `npm test` 통과 확인.

### 3. i18n 잔여 (선택)
- 완료: 소문(`TownUI.ts`)은 `RUMOR_KEYS` + `t()` 기반으로 이동. 마을 헤더/소문 footer/퀘스트 보상 아이템명도 언어 설정을 따르도록 정리됨.
- 완료: 설정 언어 값과 캐릭터 생성 기본 이름도 i18n 키로 이동.
- 완료: `tests/raid/i18n-guards.test.ts`에서 `t('...')`/`formatT('...')` 리터럴 키가 ko/en 양쪽에 존재하는지 검사.
- 완료: 인벤토리/상점 새 텍스트는 정적 i18n guard와 브라우저 ko 렌더 확인으로 누락 방지.
- 완료: 월드 HUD/행동 메뉴/지형 hover의 `ATB`, 타일명, 속성명 표시를 i18n으로 이동. 한국어 설정에서는 행동력·초원·불꽃/바람 등으로 표시.

### 4. 죽은 캔버스 코드 정리 (선택, 안전)
- 완료: `darksaber-ui.css`의 `.ds-town.is-storage*` 미사용 규칙 제거.
- 완료: `ShopUI.ts`의 캔버스 `render/onMouseMove/onMouseDown/onMouseUp/renderXxx` 제거. 현재는 React `ShopPanel`용 모델+액션 레이어만 유지.
- 완료: `PauseMenuUI.ts`, `SettingsUI.ts`, `PartyUI.ts`, `CharacterPanelUI.ts`의 미사용 캔버스 렌더/입력 코드를 제거하고 DOM 오버레이용 visibility state holder로 축소.
- 완료: `UITheme.ts`의 미사용 glass/dark-panel 렌더 헬퍼와 관련 주석 제거. 현재 캔버스 HUD에서 쓰는 parchment helper만 유지.
- `TownUI.ts`의 `updateInput/render`는 no-op로 남겨둠(WorldEngine 파이프라인이 호출). 그대로 둘 것.

### 5. 인벤토리/패널 비주얼 다듬기 (선택)
- 완료: 아이템 희귀도별 테두리/스트립/면광, 드래그 고스트 아이콘+라벨, 툴팁 헤더+메타칩 개선.
- 완료: 반응형(작은 화면)에서 `.ds-inv__body` 가로 스크롤 점검 및 CSS 보강. Browser 좁은 화면에서 월드(I키) 인벤토리 오버레이가 열리고 내부 가로 스크롤이 생기는 것 확인.

---

## ⛔ 건드리지 말 것 (Opus/메인 예약 — 충돌·회귀 위험)
- `src/inventory/InventoryUI.ts`, `src/inventory/GridInventory.ts` — 드래그 **해석 로직**(moveToCell/moveToEquip/quickMove). 평소에는 충돌 방지를 위해 조심하고, 명시 요청/조율이 있을 때만 테스트와 함께 수정.
- `src/ui/react/OverlayRoot.tsx`, `src/ui/react/UiStore.ts`, `src/ui/react/UiContext.tsx` — 오버레이 배선.
- `src/ui/theme/darksaber-ui.css`의 **기존 토큰/공용 클래스**(`--ds-*`, `.ds-panel`, `.ds-btn`, `.ds-scrim`, `.ds-bar` 등). 새 컴포넌트 전용 클래스 추가는 OK, 공용 토큰 값 변경은 금지.

예외 기록: 2026-06-06 몬스터 밸런스 작업에서는 사용자 명시 승인으로 `WorldEngine.ts`의 로컬 실내 시나리오 몬스터 생성 지점만 좁게 수정했다. 이 예외는 UI/오버레이 배선 전체에 대한 일반 허가가 아니다.

## 검증 명령
- 타입체크: `npm run typecheck` (반드시 통과).
- DOM 오버레이 브라우저 스모크: `npm run test:e2e` (새 환경은 먼저 `npx playwright install chromium`).
- 개발 서버: `npm run dev` → http://127.0.0.1:5731 (프리뷰 도구는 `.claude/launch.json`의 5742).
- 개발자 바로 시작: `npm run dev:town`, `npm run dev:raid`, `npm run dev:raid:aggro`, `npm run dev:raid:loot`, `npm run dev:raid:story -- storyNN`, `npm run dev:tutorial`. 직접 진입 URL은 `/?devStart=raid&devScenario=storyNN` 형식이며, 지원 에피소드는 `story-scenarios.json` 데이터에서 결정된다.
- 테스트: `npm test`.

## 알려진 함정
- **`npm install` 먼저** — 집/새 기기엔 node_modules에 react가 없을 수 있음(이번에 설치함).
- i18n: 없는 키는 키 문자열을 그대로 반환(`|| '기본값'` 폴백 안 통함). ko/en 양쪽에 키 추가 확인.
- `SettingsManager`는 static+`this` 사용 → bare 참조 금지, `() => S.setX(v)`로 감쌀 것.
- 드래그앤드롭은 합성이벤트 검증 불안정 → 실제 마우스로 확인.

## 관련 커밋 (이번 세션)
- `b7e47aa` 설정/일시정지/파티 i18n+a11y 다듬기
- `2e7dd40` 마을 화면 DOM 이전
- `034018d` 캐릭생성 DOM 이전
- `b27d03c` 인벤토리 DOM 이전 (+ 상점 카테고리 후속 정리 완료)
