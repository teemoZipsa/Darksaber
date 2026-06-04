# UI 리빌드 — React DOM 오버레이 (진행 상황 & 인수인계)

> 캔버스에 손으로 그리던 메뉴/패널 UI를 **React DOM 오버레이**로 옮기면서
> **"풀 다크 Darkest Dungeon"** 룩으로 통일하는 작업. 월드 렌더링과 월드 좌표에
> 붙은 HUD(적 체력바·플로팅 데미지·전술 마커·방사형 액션메뉴)는 캔버스 유지.

## 비주얼 방향
- 거의 검정 배경 + 가죽 패널 + **브론즈 골드 테두리**, **밝은 골드(#f0c050)가 주 강조**(DD의 빨강 자리).
- **빨강(#e43f5a)은 위험 전용**(HP 저하·사망·치명타·파괴적 동작).
- 토큰은 전부 `src/ui/theme/darksaber-ui.css`에 `#ui-overlay` 스코프로 정의 → 여기 색만 바꾸면 전 패널 일괄 변경.

## 아키텍처
```
index.html: #game-container > (canvas#gameCanvas, div#ui-overlay)
  #ui-overlay: position:absolute; pointer-events:none  (패널/스크림만 auto)
```
- **마운트**: `src/main.ts` → `mountUiOverlay(manager)` → `createRoot(#ui-overlay)`로 `<OverlayRoot/>` 렌더, `UiStore` 반환 후 `manager.attachUiStore()`.
- **상태 브리지**(`src/ui/react/UiStore.ts`, `UiContext.tsx`): 게임에 이벤트버스가 없어서, `GameManager.loop()`가 프레임당 `uiStore.tick()` 호출 → React가 `useSyncExternalStore`로 구독.
  - `useUiSelector(sel)`: 값 바뀔 때만 리렌더(열림 플래그용).
  - `useUiVersion()`: 매 프레임 리렌더(열린 패널 내용용 — HP 등 in-place 변경 반영).
  - 액션은 게임 상태를 직접 안 건드리고 `GameManager`/매니저에 위임 후 `tick()`.
- **입력 격리**: `InputManager`가 클릭을 캔버스에 바인딩 → DOM 패널이 위에 뜨면 자연히 흡수. 추가로 `GameManager.isDomModalOpen()`가 true면 `worldEngine.update()` 스킵(월드 동결). 각 패널은 풀스크린 `.ds-scrim`(클릭 시 닫힘) 위에 렌더.
- **열림/닫힘 주인은 GameManager**: 기존 캔버스 UI 객체(`charUI`/`pauseMenu`/`settingsUI`/`partyUI`)의 `isVisible()` 비트를 그대로 재사용(키 토글·상호배제 유지). 캔버스 render/input만 우회하고 React가 대신 그림.

## 완료 (커밋·푸시됨)
| 패널 | React 파일 | 비고 |
|---|---|---|
| 캐릭터창 (C) | `src/ui/react/character/*` | 스탯·HP/MP·장비·파티탭 |
| 일시정지 (ESC) | `src/ui/react/PauseMenu.tsx` | 설정 핸드오프 포함 |
| 설정 | `src/ui/react/settings/SettingsPanel.tsx` | 토글 스위치·네이티브 슬라이더 |
| 파티 (P) | `src/ui/react/party/PartyPanel.tsx` | 스쿼드+로스터, HTML5 드래그앤드롭 |
| 캐릭생성 | `src/ui/react/charcreate/CharacterCreation.tsx` | 독립 state 기반 DOM 패널 |
| 마을 (Town) | `src/ui/react/town/*` | **화면 전체 DOM 이전**: 헤더·탭바·출격 + 창고/상점/휴식/퀘스트/소문. `TownUI`는 상태 홀더로 축소, `WorldEngine.getTownSession()`→`GameManager.getTownSession()`로 노출. |
| 인벤토리 | `src/ui/react/inventory/InventoryPanel.tsx` | 월드(I)·마을 창고 공용 DOM 패널. 드래그 해석은 `InventoryUI` 모델 액션에 유지. |

## 남음 (다음 순서)
1. **레이드 전리품 end-to-end 수동 검증** — DOM 인벤토리의 일반 DnD/소켓/퀵트랜스퍼는 실제 포인터로 확인됨. 전리품 콜백은 모델 테스트로 보강했고 `devStart=raid`로 레이드 자동 진입도 가능하지만, 실제 레이드 화면에서 전리품 생성 후 드롭까지는 별도 전투/상자 조건이 필요.
2. **실제 레이드 화면 어그로 수동 검증** — 어그로 상태 적의 추격/인접 공격은 모델 회귀 테스트로 보강됨. Browser에서 레이드 자동 진입은 확인했지만, 실제 몬스터 조우 화면에서 추격/공격을 보는 수동 검증은 남음.

## 마을(Town) 이전 메모
- `TownUI`는 더 이상 캔버스 크롬이나 storage 인벤토리를 그리지 않음. 상태·탭·소문·상점/인벤토리 모델 참조만 유지하고 React `TownScreen`/`InventoryPanel`이 그림.
- React 동선: `UiStore.getTownSession()` → `WorldTownSession`(.ui = `TownUI`, + `purchaseRestMenu`/`treatActivePartyInjuries`). 상점 데이터/액션은 `ShopUI`의 public 메서드(`listBuyEntries`/`buy`/`sell` 등), 탭/출격은 `TownUI.setTab`/`requestDeploy`.
- `TownScreen`은 `.ds-scrim` 안 씀 — 자체 풀스크린 컨테이너. storage 탭은 DOM `InventoryPanel`을 embedded 모드로 렌더.

> 캔버스 유지(이전 안 함): 적 체력바·플로팅 데미지·전술 마커·방사형 액션메뉴 등 월드/카메라 좌표 HUD.

## 패널 이전 레시피 (반복 패턴)
1. `darksaber-ui.css`에 필요한 클래스 추가(`.ds-panel`/`.ds-btn`/`.ds-bar` 등 재사용).
2. React 컴포넌트 작성(데이터는 `useUiVersion()`로 라이브, 텍스트는 `t()`).
3. `UiStore`에 `isXOpen` 셀렉터 + 액션(닫기 등) 추가.
4. `OverlayRoot.tsx`에 `{xOpen && <Scrim><Panel/></Scrim>}` 분기 추가.
5. `GameManager`: 해당 패널 **캔버스 render·input 우회**, `isDomModalOpen()` OR 체인에 추가, 필요시 ESC/닫기 메서드.
6. `tsc --noEmit` → 프리뷰 검증 → 커밋.

## 실행 & 검증
- 개발 서버: `npm run dev` (Vite, http://127.0.0.1:5731).
- 개발자 바로 시작:
  - `npm run dev:town` 또는 `/?devStart=town`: 튜토리얼을 건너뛰고 마을로 진입.
  - `npm run dev:raid` 또는 `/?devStart=raid`: 마을 출격 경로를 통해 레이드 자동 진입.
  - `npm run dev:tutorial` 또는 `/?devStart=tutorial`: 캐릭터 생성 없이 튜토리얼 대련장으로 진입.
- 타입체크: `npx tsc --noEmit`.
- **헤드리스 프리뷰 주의**: 탭이 숨겨지면 브라우저가 `requestAnimationFrame`을 멈춰 루프가 정지 → 스크린샷/자동 tick 불가. 대응:
  - `GameManager.scheduleFrame()`에 **DEV 전용 setTimeout 폴백**(hidden일 때) — 프로덕션 무영향.
  - `main.ts`에 **DEV 전용 `window.__gm`** 디버그 핸들(프리뷰에서 구동/검증용).
  - 집(실제 브라우저 포커스 탭)에선 그냥 정상 60fps로 보임.

## 알려진 함정 (시간 절약용)
- **i18n 키 누락 주의**: `t('key')`는 없는 키면 키 문자열을 그대로 반환(`|| '기본값'` 폴백 안 통함). 새 패널 텍스트는 `LanguageManager.ts`의 ko/en 양쪽에 키 추가 확인. (pause.* 키가 누락돼 있어 추가한 전례 있음.)
- **SettingsManager는 static + `this` 사용**: 메서드를 bare 참조로 넘기지 말고 `() => S.setX(v)`로 감쌀 것(안 그러면 `this` undefined).
- **WorldEngine이 월드 진입 시 `partyUI`를 자동으로 닫음**(WorldEngine.ts ~590) — 검증 시 WORLD 안정화 후 열 것.
- **드래그앤드롭은 합성이벤트 검증이 불안정** → 검증은 실제 포인터 입력 기준. 마을 창고/배낭/장비/소켓 주요 동선은 Browser 포인터 입력으로 확인됨.
- `.claude/launch.json` 포트는 프리뷰 도구용 로컬 값(작업 기기별로 다를 수 있음).

## 관련 커밋
- `d401952` React 오버레이 기반 + 캐릭터창
- `2e8e663` 일시정지 DOM 이전 + 라벨 가독성 + hidden-tab 루프 폴백 + vite-env.d.ts
- `c65692d` 설정 + 파티 DOM 이전
