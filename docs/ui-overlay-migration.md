# UI 리빌드 — React DOM 오버레이 (진행 상황 & 인수인계)

**현행 기준**: 2026-09-13

> 캔버스에 손으로 그리던 메뉴/패널 UI를 **React DOM 오버레이**로 옮기면서
> 원작의 도트 표현·배치를 우선해 다듬는 작업. 기존 어두운 DOM 테마는 정보창에 활용한다. 월드 렌더링과 월드 좌표에
> 붙은 HUD(적 체력바·플로팅 데미지·전술 마커·방사형 액션메뉴)는 캔버스 유지.

## 필드 HUD (2026-09-13)

`src/ui/react/field/FieldHud.tsx`는 비차단형 HUD다. `WorldEngine.getFieldHudView()` → `UiStore` 서명으로 체력·성장·탐험·의뢰·이동 상태를 읽는다. 버튼만 포인터 입력을 받으며, 차단형 패널과 전체 지도에서는 숨긴다. 전투 메뉴가 열리면 하단 안내를 숨겨 모바일 입력을 가리지 않는다.

## 비주얼 방향

사용자 최신 기준: “아이콘만 뜨던 원작 방식으로 하자. 다른 것도 원작이 더 예쁠 경우를 고려하자.” 원작 스프라이트·간결한 배치가 이미 기능하는 부분은 먼저 보존한다. 이미지 생성은 부족한 자산을 보완할 때 사용하며, 원작 아이콘 위에 장식 카드나 배지를 일괄 추가하지 않는다. 반응형 처리는 화면 안 배치와 터치 영역을 보정하는 용도다. 원작에 더 가까운 표현인지 확인하지 않은 채 어두운 스타일로 통일하지 않는다.

### 필드 UI 아트 적용 (2026-09-13)

필드 HUD·미니맵은 `public/assets/ui/field-forged/panel.png`를 공유한다. DOM은 `border-image`, Canvas는 `FieldPanelSkin.ts`의 nine-slice로 모서리를 보존한다. 생성 PNG 원본의 투명 알파를 유지했으며 프롬프트는 자산 폴더 `README.md`에 기록했다. 문장은 장식 이미지이고 텍스트·수치·상호작용은 코드로 유지한다.

캐릭터 주변 8방향 액션 메뉴는 모든 화면 크기에서 원작 도트 아이콘만 표시한다. 모바일 카드·연결선·중앙 고리, 단축키 배지·상시 이름·비용·사유, 사각 호버 장식을 제거했다. 공통 아이콘 렌더러를 쓰며 호버/튜토리얼 강조는 아이콘 자체의 작은 빛으로 표현한다. 모바일에서도 아이콘 크기·간격·보이지 않는 클릭 영역에 카메라 줌/UI 배율의 비율을 적용해 실제 월드 타일(기본 48px)과 일치시킨다. UI 120%가 아이콘만 확대하지 않도록 하며, 화면 가장자리에서만 위치를 보정한다. 메뉴가 열린 동안 사냥터 이름 표식은 숨겨 아이콘을 가리지 않게 한다. 사용할 수 없는 행동은 흐리게 표시하고 선택 시 기존 로그로 이유를 알린다. 마법 선택도 기본 상태에는 아이콘만 표시하며 마우스를 올렸을 때 주문 이름·사용 불가 사유를 보여준다. 단축키 기능은 유지한다.

모바일 상태창과 미니맵은 위쪽에 나란히 놓고 탐험 상태는 그 아래에 표시한다. 짧은 화면의 전투 중에는 보조 정보를 접어 기존 8방향 액션 메뉴를 가리지 않는다. 비활성 버튼은 회색, 위험 상태는 빨간색으로 구분한다. 전체 지도는 Escape로 닫을 수 있다.

검증: 관련 단위 테스트 47개, 이동·전투·배치 브라우저 테스트 10개 통과. 320×568·390×844·960×640·1280×720 및 UI 120%에서 HUD/미니맵 겹침, 지도 클릭/Escape, 작은 화면 전투 버튼 노출을 확인했다. 전체 타입 검사·lint·클라이언트 빌드 통과.

후속 텍스트 검증: 프레임만 확인한 배치 검사에서 놓친 내부 글자 여백을 수정했다. DOM 상태창은 공통 26px 내용 여백을 사용하고, 제목/통계의 왼쪽과 월드명/시계의 오른쪽을 정렬한다. 미니맵은 10px 프레임과 16px 내용 여백, 당시 모바일 액션 카드는 6px 프레임과 최소 8px 텍스트 여백을 확보했다(후속 사용자 결정으로 카드 자체 제거). 기존 이미지 원본은 유지한다. 긴 이름은 말줄임과 전체 이름 툴팁, 큰 수치는 줄바꿈으로 처리한다. 관련 단위 검사 19개와 한글·영문/긴 이름/큰 숫자/516px 사용자 화면을 포함한 브라우저 검사 6개 통과. 텍스트의 실제 `Range` 경계가 장식 안쪽에 들어오는지 검사한다.

- 기존 DOM 정보창은 거의 검정 배경 + 가죽 패널 + **브론즈 골드 테두리**, **밝은 골드(#f0c050)가 주 강조**. 원작 필드 아이콘에는 이 패널 스타일을 강제하지 않는다.
- **빨강(#e43f5a)은 위험 전용**(HP 저하·사망·치명타·파괴적 동작).
- 토큰은 전부 `src/ui/theme/darksaber-ui.css`에 `#ui-overlay` 스코프로 정의 → 여기 색만 바꾸면 전 패널 일괄 변경.

## 아키텍처
```
index.html: #game-container > (canvas#gameCanvas, div#ui-overlay)
  #ui-overlay: position:absolute; pointer-events:none  (패널/스크림만 auto)
```
- **마운트**: `src/main.ts` → `mountUiOverlay(manager)` → `createRoot(#ui-overlay)`로 `<OverlayRoot/>` 렌더, `UiStore` 반환 후 `manager.attachUiStore()`.
- **상태 브리지**(`src/ui/react/UiStore.ts`, `UiContext.tsx`): 게임에 이벤트버스가 없어서, `GameManager.loop()`가 프레임당 `uiStore.tick()` 호출. `UiStore`는 DOM-visible state signature가 바뀐 경우에만 React 구독자에게 알림.
  - `useUiSelector(sel)`: 값 바뀔 때만 리렌더(열림 플래그용).
  - `useUiVersion()`: 열린 패널 내용용 변경 감지 버전(HP 등 in-place 변경 반영, 동일 상태 프레임은 리렌더 안 함).
  - 액션은 게임 상태를 직접 안 건드리고 `GameManager`/매니저에 위임 후 `tick()`.
- **입력 격리**: `InputManager`가 클릭을 캔버스에 바인딩 → DOM 패널이 위에 뜨면 자연히 흡수. 추가로 `GameManager.isDomModalOpen()`가 true면 `worldEngine.update()` 스킵(월드 동결). 각 패널은 풀스크린 `.ds-scrim`(클릭 시 닫힘) 위에 렌더.
- **열림/닫힘 주인은 GameManager**: 기존 캔버스 UI 객체(`charUI`/`pauseMenu`/`settingsUI`/`partyUI`)의 `isVisible()` 비트를 그대로 재사용(키 토글·상호배제 유지). 캔버스 render/input만 우회하고 React가 대신 그림.

## 현재 React DOM 패널
| 패널 | React 파일 | 비고 |
|---|---|---|
| 캐릭터창 (C) | `src/ui/react/character/*` | 스탯·HP/MP·장비·파티탭 |
| 일시정지 (ESC) | `src/ui/react/PauseMenu.tsx` | 설정 핸드오프 포함 |
| 설정 | `src/ui/react/settings/SettingsPanel.tsx` | 토글 스위치·네이티브 슬라이더 |
| 파티 (P) | `src/ui/react/party/PartyPanel.tsx` | 스쿼드+로스터, HTML5 드래그앤드롭 |
| 캐릭생성 | `src/ui/react/charcreate/CharacterCreation.tsx` | 독립 state 기반 DOM 패널 |
| 마을 (Town) | `src/ui/react/town/*` | **화면 전체 DOM 이전**: 헤더·탭바·출격 + 창고/상점/휴식/퀘스트/소문. `TownUI`는 상태 홀더로 축소, `WorldEngine.getTownSession()`→`GameManager.getTownSession()`로 노출. |
| 인벤토리 | `src/ui/react/inventory/InventoryPanel.tsx` | 월드(I)·마을 창고 공용 DOM 패널. 드래그 해석은 `InventoryUI` 모델 액션에 유지. |
| 스토리 저널 (J) | `src/ui/react/quest/StoryJournalPanel.tsx` | 퀘스트 목록, 캐릭터별 최근 출격 20건, 전체 61종 몬스터 도감을 함께 표시. 도감은 마을 퀘스트 게시판과 같은 검색·계열 필터·상세 보기를 공유. |

## 남은 독립 Canvas 차단형 패널

탐험 결과는 `src/ui/react/result/RaidResultPanel.tsx`로 이전했다. `RaidResultUI`는 결과 상태와 한 번만 실행되는 확인 콜백을 보관한다. `WorldRaidOutcomeController.getOutcome()` → `WorldEngine` → `UiStore` 경로로 표시하며, `result` 오버레이가 열려 있는 동안 게임 입력을 차단한다. 기존 보상 정산·저장 로직은 그대로 사용한다.

결과창은 어두운 필드 프레임, 안전 여백, 한 개의 본문 스크롤과 고정 확인 버튼을 사용한다. 620px 이하에서는 보상과 파티를 세로로 배치하고 UI 배율을 반영해 화면 안에 맞춘다. Enter·Space·Escape·바깥 클릭은 마을로 계속하기와 같으며, Tab 포커스는 창 안에서 순환한다. 보상·퀘스트 문장을 개수로 잘라내지 않는다.

일반 계정 로그인 뒤에도 남아 마을 탭을 가리던 개발자 메뉴는 `UiStore` 변경 구독으로 월드 진입 시 숨기며, 타이틀로 돌아오면 다시 표시한다.

남은 이전 대상:
- `src/ui/FusionTempleUI.ts`: 합체 후보·비용·확인 흐름을 표시하는 신전 패널. React dialog로 이전하고 키보드/터치 포커스 계약을 적용한다.

적 체력바·플로팅 데미지·전술 마커·방사형 액션 메뉴처럼 월드/카메라 좌표에 붙는 HUD는 Canvas에 유지한다. 우선순위와 완료 조건은 `docs/roadmap.md`를 따른다.

## 완료된 최종 수동 검증
- **전리품 end-to-end** — `devStart=raid&devScenario=loot`는 로컬 필드에서 실제 전리품 그리드와 배낭을 사용한다. 2026-09-13 가짜 네트워크 클라이언트를 제거했다. 회수는 상태 문자열 대신 외부 그리드 감소·배낭 증가·수량 보존으로 검증하고, 회수 후 이동·귀환·재진입도 확인한다.
- **실제 레이드 화면 어그로** — `devStart=raid&devScenario=aggro` 실제 레이드 화면에서 어그로 적의 추격 후 강제 인접 공격 로그/상태 배지 확인.
- **시나리오 직접 진입** — Chrome headless에서 `devStart=raid&devScenario=story31`로 `StoryInteriorMap`/`demon_fixers_den` 진입, DEV 상태 `story31 / interior-ready`, 보스 1명(마계 해결사 `{22,11}`), 경비 보스 오인 0개, 입장 로그 확인. 같은 DEV 경로는 구현된 스토리 시나리오 전체를 지원하며, 필드/비공정 시나리오는 월드맵 목표 상태로 바로 시작한다.

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
6. `npm run typecheck` → 프리뷰 검증 → 커밋.

## 실행 & 검증
- 개발 서버: `npm run dev` (Vite, http://127.0.0.1:5731).
- 개발자 바로 시작:
  - `npm run dev:town` 또는 `/?devStart=town`: 튜토리얼을 건너뛰고 마을로 진입.
  - `npm run dev:raid` 또는 `/?devStart=raid`: 마을 출격 경로를 통해 레이드 자동 진입.
  - `npm run dev:raid:aggro` 또는 `/?devStart=raid&devScenario=aggro`: 레이드 자동 진입 후 어그로 추격/공격 검증 상태 구성.
  - `npm run dev:raid:loot` 또는 `/?devStart=raid&devScenario=loot`: 레이드 자동 진입 후 전리품 DOM 패널 검증 상태 구성.
  - `npm run dev:raid:story -- storyNN` 또는 `/?devStart=raid&devScenario=storyNN`: 레이드 자동 진입 후 구현된 스토리 시나리오로 바로 진입. 지원 에피소드는 `story-scenarios.json` 데이터에서 결정된다. 실내는 실내맵, 필드/비공정은 월드맵 목표 상태로 시작.
  - `npm run dev:tutorial` 또는 `/?devStart=tutorial`: 캐릭터 생성 없이 튜토리얼 대련장으로 진입.
- 타입체크: `npm run typecheck`.
- DOM 오버레이 브라우저 스모크: `npm run test:e2e` (새 환경은 먼저 `npx playwright install chromium`).
- **헤드리스 프리뷰 주의**: 탭이 숨겨지면 브라우저가 `requestAnimationFrame`을 멈춰 루프가 정지 → 스크린샷/자동 tick 불가. 대응:
  - `GameManager.scheduleFrame()`에 **DEV 전용 setTimeout 폴백**(hidden일 때) — 프로덕션 무영향.
  - `main.ts`에 **DEV 전용 `window.__gm`** 디버그 핸들(프리뷰에서 구동/검증용).
  - 집(실제 브라우저 포커스 탭)에선 그냥 정상 60fps로 보임.

## 알려진 함정 (시간 절약용)
- **i18n 키 누락 주의**: `t('key')`는 없는 키면 키 문자열을 그대로 반환(`|| '기본값'` 폴백 안 통함). 새 패널 텍스트는 `src/i18n/translations.ts`의 ko/en 양쪽에 키를 추가하고 `LanguageManager.ts`의 `t()`를 통해 사용한다. (pause.* 키가 누락돼 있어 추가한 전례 있음.)
- **SettingsManager는 static + `this` 사용**: 메서드를 bare 참조로 넘기지 말고 `() => S.setX(v)`로 감쌀 것(안 그러면 `this` undefined).
- **WorldEngine이 월드 진입 시 `partyUI`를 자동으로 닫음**(WorldEngine.ts ~590) — 검증 시 WORLD 안정화 후 열 것.
- **드래그앤드롭은 합성이벤트 검증이 불안정** → 검증은 실제 포인터 입력 기준. 마을 창고/배낭/장비/소켓 주요 동선은 Browser 포인터 입력으로 확인됨.
- `.claude/launch.json` 포트는 프리뷰 도구용 로컬 값(작업 기기별로 다를 수 있음).

## 관련 커밋
- `d401952` React 오버레이 기반 + 캐릭터창
- `2e8e663` 일시정지 DOM 이전 + 라벨 가독성 + hidden-tab 루프 폴백 + vite-env.d.ts
- `c65692d` 설정 + 파티 DOM 이전
