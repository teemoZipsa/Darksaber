# UI 작업 체크리스트 (Codex 위임용)

작업 규칙은 루트 `AGENTS.md` 참고. 완료 시 아래 박스를 `- [x]`로 바꾸고 변경과 함께 커밋.
**아래 "Codex-safe" 목록만** 진행할 것. 그 외(공유 배선 파일·인벤토리)는 손대지 말 것.

## Codex-safe tasks (쉬움 · 충돌 위험 낮음)
이 작업들은 주로 새 React 패널 `.tsx`와 `LanguageManager.ts`(추가만)에 한정됨.

- [ ] **SettingsPanel 다국어화** — `src/ui/react/settings/SettingsPanel.tsx`의
  하드코딩된 한글 라벨(사운드/화면/접근성/BGM 음소거/UI 크기 등)을 `t('settings.*')`로
  교체하고, `LanguageManager.ts`의 ko/en 양쪽에 해당 키 추가. 영어 토글 시 영어로
  바뀌는지 확인.
- [ ] **닫기 안내 문구 다국어화** — `PauseMenu.tsx`/`SettingsPanel.tsx`/`PartyPanel.tsx`의
  "ESC 또는 …" 푸터 문구를 `t('ui.closeHint')` 류 키로 통일(ko/en 추가).
- [ ] **빈 슬롯/대기 명단 빈 상태 문구 다국어화** — `PartyPanel.tsx`의 '빈 슬롯',
  로스터 빈 상태 표시를 `t()` 키로(ko/en 추가).
- [ ] **접근성 라벨** — 새 패널들의 버튼/토글/슬라이더에 `aria-label`/`title` 보강
  (각 `.tsx` 내부에서만). 동작 변경 금지, 속성 추가만.
- [ ] **PauseMenu/PartyPanel/SettingsPanel의 인라인 스타일 정리** — 반복되는 인라인
  `style={{...}}`를 `darksaber-ui.css`에 클래스로 빼지 말고(❌ CSS는 공유 파일이라 금지),
  컴포넌트 파일 상단의 로컬 상수 객체로만 정리. (CSS 파일은 수정 금지.)

## 손대지 말 것 (메인 작업 예약)
- `src/engine/GameManager.ts`, `src/ui/react/OverlayRoot.tsx`, `src/ui/react/UiStore.ts`
- `src/ui/theme/darksaber-ui.css` (공유 토큰/클래스 — 충돌 방지)
- 상점/캐릭생성/인벤토리 신규 이전 (특히 인벤토리 드래그 그리드)

## 검증
- `npx tsc --noEmit` 통과 필수.
- 가능하면 `npm run dev`로 띄워 패널 열어 확인(캐릭터창 C / 파티 P / ESC 일시정지 → 설정).
