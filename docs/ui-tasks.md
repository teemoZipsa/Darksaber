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
- 타입체크: `npx tsc --noEmit` (반드시 통과).
- 개발 서버: `npm run dev` → http://127.0.0.1:5731 (프리뷰 도구는 `.claude/launch.json`의 5742).
- 개발자 바로 시작: `npm run dev:town`, `npm run dev:raid`, `npm run dev:raid:aggro`, `npm run dev:raid:loot`, `npm run dev:tutorial`.
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
