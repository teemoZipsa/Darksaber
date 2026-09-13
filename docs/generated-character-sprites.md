# 직업별 생성 캐릭터 스프라이트

## 적용 범위

같은 계열의 색상 변형처럼 보이던 아래 8개 직업을 서로 다른 인물·장비·실루엣으로 다시 제작했다.

| 표시 이름 | 자산 ID | 외형 구분점 | 주 색상 | 액션 |
|---|---|---|---|---|
| 그랜드소드 | `master_battle_t10` | 은발, 비대칭 흑철 갑옷, 대각선 양손 대검, 찢어진 반쪽 망토 | 흑철·진홍·고금 | 양손 베기 |
| 그랜드아처 | `master_tactics_t10` | 긴 금발 땋은 머리, 큰 은목 장궁, 흰 깃 화살통, 짧은 깃망토 | 에메랄드·아이보리·은색 | 활 시위 당기기 |
| 그랜드에이지 | `master_magic_t10` | 백발·백수염, 초승달 지팡이, 사슬로 맨 마도서, 각진 망토 | 인디고·청색·은색 | 지팡이 들기와 시전 손짓 |
| 비약사 | `alchemist_t3` | 구리색 머리와 고글, 청록 목도리, 큰 원형 플라스크, 약병 띠 | 갈색·청록·호박색 | 플라스크 들어 사용하기 |
| 현자 | `alchemist_t4` | 올림머리, 허브 향로, 두루마리와 절구 주머니, 잎 장식 | 이끼색·크림·황토 | 향로 들어 흔들기 |
| 필로소퍼 | `alchemist_t7` | 삭발과 짧은 흰 수염, 석판, 캘리퍼에 고정한 철학자의 돌 | 흑자색·고금·진홍 | 철학자의 돌 제시하기 |
| 그랑힐러 | `master_healer_t9` | 금발 땋은 머리, 고리 지팡이와 긴 천 리본, 짧은 청록 망토 | 아이보리·청록·금색 | 고리 지팡이 축복 |
| 힐러마스터 | `master_healer_t8` | 적갈색 짧은 머리, 붕대 팔, 큰 의무 가방, 작은 손종 | 버건디·크림·갈색 | 손종 들기와 치료 손짓 |

각 ID에는 다음 두 파일이 있다.

- 정지 초상: `public/assets/images/characters/darksaber/<id>.png` — 128×128 RGBA
- 필드 시트: `public/assets/images/characters/animations/<id>_walk.png` — 96×192 RGBA

## 시트 계약

시트는 32×32 셀 3열×6행이다.

1. 북쪽 걷기: 왼발·중립·오른발
2. 남쪽 걷기: 왼발·중립·오른발
3. 동쪽 걷기: 왼발·중립·오른발
4. 서쪽 걷기: 왼발·중립·오른발
5. 남쪽 액션: 준비·정점·회수
6. 북쪽 액션: 준비·정점·회수

런타임은 걷기 세 프레임과 액션 행의 앞 두 프레임을 사용한다. 모든 셀은 사방 1px 이상의 완전 투명 여백을 갖는다. 초상은 남쪽 중립 프레임을 최근접 보간으로 4배 확대한 그림이므로 필드 캐릭터와 다른 인물로 보이지 않는다.

## 생성과 정규화

최종 원화/포즈 시트는 Codex 내장 ImageGen으로 직업마다 별도 생성했다. 외부 무료 스프라이트 팩의 픽셀은 최종 자산에 포함하지 않았다. 생성 원본은 887×1774의 3×6 배치였고, `scripts/process-generated-character-sheet.mjs`가 다음 작업을 결정적으로 수행한다.

- 캔버스 가장자리와 이어진 밝은 무채색 배경만 투명화한다. 이 방식으로 흰 머리·옷·강철 하이라이트는 보존한다.
- 전경 연결 성분을 찾고 가장 가까운 3×6 프레임으로 통째로 배정한다. 생성 포즈가 논리 셀을 조금 넘더라도 머리·무기 끝을 자르지 않는다.
- 18개 프레임에 같은 축척을 적용하고 발 위치를 기준으로 32×32 셀 안에 정렬한다.
- 남쪽 중립 프레임에서 128×128 정지 초상을 만든다.

처리 예시:

```powershell
node scripts/process-generated-character-sheet.mjs `
  --input C:\path\to\imagegen-sheet.png `
  --id alchemist_t3 `
  --force
```

`--force`는 기존 초상 또는 시트를 교체하므로, 생성 원본의 18개 포즈를 먼저 확인한 뒤 사용한다.

## 공통 ImageGen 프롬프트

각 직업 프롬프트는 기존 정지 초상을 “교체 대상과 게임 스케일 참고”로, 먼저 승인한 비약사 3×6 결과를 “레이아웃·픽셀 밀도·마감 참고”로 지정했다. 공통 본문은 다음과 같다.

```text
Use case: stylized-concept
Asset type: production 2D game walk/action sprite sheet for Darksaber
Primary request: Completely redesign <CLASS> as a unique character and animate that exact identity.
Input images: Image 1 is the old asset to replace; retain only the compact top-down game scale, not its clothes, halo or silhouette. Image 2 is the approved layout, pixel density and finish reference only; do not copy its character.
Scene/backdrop: plain light neutral removable background with no floor, shadow, aura, panels, separators, grid lines, text or labels.
Style/medium: crisp hand-pixeled compact Korean SRPG sprite art, limited palette, selective dark outline, readable after reduction to a 32x32 logical frame.
Composition/framing: one exact 3-column by 6-row sprite sheet filling a 1:2 canvas, with eighteen equal square logical cells and no outer margin. Row 1 north/back walk left-step, neutral, right-step. Row 2 south/front walk left-step, neutral, right-step. Row 3 east/right-facing walk left-step, neutral, right-step. Row 4 west/left-facing walk left-step, neutral, right-step. Row 5 south/front signature action wind-up, peak, recovery. Row 6 north/back signature action wind-up, peak, recovery. Every cell contains exactly one complete centered full-body sprite on the same feet baseline, with identical identity, scale, proportions, palette, clothing and equipment.
Constraints: exactly 18 sprites; no missing frames, extra people, inconsistent identity, swapped equipment, duplicated limbs, cropped body, camera change, background decoration, checkerboard, watermark, border or large particle effects.
```

직업별 `Subject`와 핵심 제외 조건은 다음과 같이 고정했다.

- 그랜드소드: swept-back silver hair, asymmetrical blackened plate, deep crimson split cloak, massive dark-steel two-handed sword; no shield, crown, helmet or halo.
- 그랜드아처: long ash-blond braid, emerald hunting mantle, ivory leathers, tall silver-and-yew recurved bow, white-fletched quiver; no ninja mask, plate armor or hood.
- 그랜드에이지: elderly royal archmage, sharp white beard, angular indigo mantle, crescent staff with fixed cyan crystal, chained brass-bound codex; no giant hat, wings or floating objects.
- 비약사: short copper hair, brass goggles, cropped brown jacket, teal scarf, potion bandolier, oversized cyan flask and compact satchel; no robe, staff or heavy armor.
- 현자: middle-aged herbal sage, high hair knot, moss and cream field robes, bronze herb censer, parchment and mortar pouch; no goggles, giant flask or tall staff.
- 필로소퍼: older transmutation philosopher, shaved head, short forked beard, black-violet geometric coat, stone-and-brass tablet, crimson stone in a caliper; no hood, potion belt or floating orb.
- 그랑힐러: senior healer with golden braids, ivory tunic, turquoise split mantle, ring-topped staff with sea-green crystal and cloth ribbons; no wings, armor or giant cross.
- 힐러마스터: mature field medic-priest, cropped auburn hair, burgundy padded coat, bandaged forearm, square medical satchel and bronze handbell; no hood, royal robe or tall staff.

## 검증

`tests/field/generated-class-sprite-assets.test.ts`가 다음을 확인한다.

- 8개 초상과 시트의 크기·RGBA 형식
- 18개 셀의 전경 픽셀, 투명 테두리, 행별 프레임 변화
- 8개 남쪽 중립 외형이 서로 같은 픽셀 자산이 아님
- 직업·티어에서 해당 초상과 걷기/액션 시트를 실제로 로드함
