# UI 인수인계 (Codex 이어받기용) — 2026-05-29 기준

> Opus가 캔버스 UI → React DOM 오버레이("풀다크 Darkest Dungeon") 이전을 **거의 전부** 끝냈습니다.
> 이 문서는 **Codex가 이어서 마무리할 작업**과 **건드리면 안 되는 것**을 정의합니다.
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

- [x] 시작 튜토리얼: 캐릭터 생성 확인 후 실제 `WorldEngine` 로컬 규칙을 쓰는 실내 대련장으로 진입. 킹 교관 안내에 따라 이동/공격/휴식/마법/처치 훈련을 마치거나 Esc로 스킵하면 기존 마을 화면으로 이동.

캔버스에 남은 것(이전 대상 아님): 월드 렌더, 적 체력바, 플로팅 데미지, 전술 마커, 방사형 액션메뉴 등 **월드/카메라 좌표 HUD**.

---

## 🔴 Codex가 이어서 할 일 (우선순위 순)

### 1. 인벤토리 드래그앤드롭 **실제 마우스 검증** (최우선)
헤드리스 프리뷰는 합성 DnD 이벤트가 불안정해 Opus가 검증 못 한 부분. `npm run dev`로 띄워 **실제 마우스로** 확인:
- 배낭 ↔ 마을창고(ext) 그리드 간 드래그 이동 (빈 칸 배치)
- 그리드 → 장비 슬롯 드래그(장착), 장비 → 그리드 드래그(해제)
- 장비 슬롯끼리 교체(swap) — 기존 장비가 배낭으로 돌아가는지
- 소켓 아이템(◇ 표시) 위에 룬/젬 드롭 시 소켓 삽입
- **클릭(드래그X)** = 퀵트랜스퍼 (배낭→창고, 창고→배낭, 장비→배낭) — 이미 동작 확인됨
- 레이드 중 전리품 그리드에서 배낭으로 가져오기 → `onRaidLootSecured` 호출되는지
드롭 위치는 커서 아래 셀이 아이템의 **좌상단**. 동작이 어색하면 `InventoryPanel.tsx`의 `dropOnGrid`만 조정(모델은 건드리지 말 것).

검토 메모:
- 장착 슬롯에 기존 장비가 있고 배낭이 가득 찬 상태에서 외부 그리드/전리품 장비를 해당 슬롯에 드롭하면, `InventoryUI.moveToEquip`가 기존 장비의 `autoPlaceExisting` 실패를 확인하지 않아 기존 장비가 유실될 수 있음. `src/inventory/InventoryUI.ts`는 예약 파일이므로 여기에는 기록만 남김.

### 2. 상점 카테고리 데이터 마무리 (병행 작업 WIP)
워킹트리에 weapon/armor/accessory/consumable 4분류 + 마을별 재고(`getShopItems(townId)`) + `OriginalShopItems.ts`가 **진행 중**으로 들어와 있음. Codex가 이어서:
- `src/data/ShopData.ts` / `ItemDB.ts` / `OriginalShopItems.ts` 정합성 확인
- i18n 키 `shop.weapon/armor/accessory/consumable` 존재 확인(ko/en) — 이미 추가됨, 누락 시 보강
- 마을 들어가서 상점 탭 → 4개 카테고리 버튼·아이템 목록·구매/판매 정상인지 확인
- `tests/raid/core.test.ts` 변경분 포함 → `npm test` 통과 확인

### 3. i18n 잔여 (선택)
- 소문(`TownUI.ts`)은 ko/en 양쪽 텍스트로 분리됨. 마을 헤더/소문 footer/퀘스트 보상 아이템명도 언어 설정을 따르도록 정리됨.
- 인벤토리/상점 새 텍스트 영어 토글 점검.

### 4. 죽은 캔버스 코드 정리 (선택, 안전)
- 완료: `darksaber-ui.css`의 `.ds-town.is-storage*` 미사용 규칙 제거.
- 완료: `ShopUI.ts`의 캔버스 `render/onMouseMove/onMouseDown/onMouseUp/renderXxx` 제거. 현재는 React `ShopPanel`용 모델+액션 레이어만 유지.
- 완료: `PauseMenuUI.ts`, `SettingsUI.ts`, `PartyUI.ts`, `CharacterPanelUI.ts`의 미사용 캔버스 렌더/입력 코드를 제거하고 DOM 오버레이용 visibility state holder로 축소.
- 완료: `UITheme.ts`의 미사용 glass/dark-panel 렌더 헬퍼와 관련 주석 제거. 현재 캔버스 HUD에서 쓰는 parchment helper만 유지.
- `TownUI.ts`의 `updateInput/render`는 no-op로 남겨둠(WorldEngine 파이프라인이 호출). 그대로 둘 것.

### 5. 인벤토리/패널 비주얼 다듬기 (선택)
- 아이템 희귀도별 테두리색, 드래그 고스트 이미지, 툴팁 개선
- 반응형(작은 화면)에서 `.ds-inv__body` 가로 스크롤 점검

---

## ⛔ 건드리지 말 것 (Opus/메인 예약 — 충돌·회귀 위험)
- `src/inventory/InventoryUI.ts`, `src/inventory/GridInventory.ts` — 드래그 **해석 로직**(moveToCell/moveToEquip/quickMove). 버그 발견 시 이 문서에 기록만.
- `src/engine/GameManager.ts`, `src/engine/WorldEngine.ts`, `src/engine/world/*` — 상태/루프/세션 배선.
- `src/ui/react/OverlayRoot.tsx`, `src/ui/react/UiStore.ts`, `src/ui/react/UiContext.tsx` — 오버레이 배선.
- `src/ui/theme/darksaber-ui.css`의 **기존 토큰/공용 클래스**(`--ds-*`, `.ds-panel`, `.ds-btn`, `.ds-scrim`, `.ds-bar` 등). 새 컴포넌트 전용 클래스 추가는 OK, 공용 토큰 값 변경은 금지.

## 검증 명령
- 타입체크: `npx tsc --noEmit` (반드시 통과).
- 개발 서버: `npm run dev` → http://127.0.0.1:5731 (프리뷰 도구는 `.claude/launch.json`의 5742).
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
- `b27d03c` 인벤토리 DOM 이전 (+ 상점 카테고리 WIP 동반)
