# 메인퀘스트 로드맵

장기 시나리오 구상은 타르코프식 출격/생환 루프와 분리해서 관리한다. 메인퀘 목표는
위험한 필드나 실내 던전에서 해결하되, 영구 보상은 반드시 유효한 마을로 생환한 뒤
확정한다.

## 현재 구현 상태

- 1~31화 메인 시나리오는 `src/data/StoryScenarioData.ts`에 데이터로 등록되어 있다.
- 1~31화 월드맵 랜드마크/입구와 퀘스트 연결은 테스트로 검증된다.
- 실내 미션은 별도 `StoryInteriorMap`으로 진입하고, 완료 후 원래 월드맵 입구로 복귀한다.
- 실내 미션 보스 전리품은 실내가 아니라 원래 입구 타일에 남는다.
- 시나리오 경비병/보스 몬스터 ID는 `src/data/StoryScenarioMonsterData.ts`에서 서버와 로컬 실내 진입이 공유한다.
- 몬스터 능력치는 원작 `ability.json` raw 값을 직접 쓰지 않고 `src/data/original/originalMonsterBalance.ts`에서 현재 전투식에 맞게 정규화한다.
- 23~31화 후반 봉인 권역은 월드맵에서 stone/snow/lava/special 바이옴과 위험도 20 구간으로 고정 검증된다.
- 대사, 컷신 발표 단계, 카메라 포커스, 원작 이벤트 연출은 1~31화 데이터와 런타임에 연결되어 있다.
  남은 판단은 새 실내 추가가 아니라 실제 플레이 완성도 점검 기준으로 한다.

## 1~31화 진행 공간

| 화 | 퀘스트 id | 진행 공간 | 현재 처리 | 목표 |
|---|---|---|---|---|
| 1 | `main:episode_01_burgos` | `burgos_castle` | 실내 | 키스라 처치 |
| 2 | `main:episode_02_zamora` | `zamora_fortress` | 실내 | 펜리스 처치 |
| 3 | `main:episode_03_etna` | `etna_volcano` | 실내 | 가노마스 처치 |
| 4 | `main:episode_04_arcadia` | `arcadia_plain` | 필드 | 에우리티온 처치 |
| 5 | `main:episode_05_cacaora` | `cacaora_highland` | 필드 | 미노타우르스 처치 |
| 6 | `main:episode_06_village` | `remote_village` | 필드 | 파치 처치 |
| 7 | `main:episode_07_sagrajas` | `sagrajas_temple` | 실내 | 안피스베냐 처치 |
| 8 | `main:episode_08_sagunto` | `sagunto_port` | 필드 | 셔트 처치 |
| 9 | `main:episode_09_sicilio` | `sicilio_island` | 필드 | 단구 처치 |
| 10 | `main:episode_10_dalai` | `dalai_lake` | 필드 | 나이아드 처치 |
| 11 | `main:episode_11_oasis` | `oasis` | 필드 | 카론 처치 |
| 12 | `main:episode_12_pyramid_front` | `pyramid_front` | 필드 | 만타고라스 처치 |
| 13 | `main:episode_13_pyramid_inside` | `pyramid_inside` | 실내 | 미얀트 처치 |
| 14 | `main:episode_14_skeria` | `skeria` | 필드 | 셔트 처치 |
| 15 | `main:episode_15_skeria_2` | `skeria_2` | 필드 | 마기 처치 |
| 16 | `main:episode_16_valhalla` | `valhalla_plain` | 필드 | 바르바투 처치 |
| 17 | `main:episode_17_airship` | `airship` | 비공정 | 탑승/진입형 특수 목표 |
| 18 | `main:episode_18_ament_gate` | `ament_gate` | 실내 | 암피트 처치 |
| 19 | `main:episode_19_ament_1f` | `ament_1f` | 실내 | 우레우스 처치 |
| 20 | `main:episode_20_ament_2f` | `ament_2f` | 실내 | 메피스토펠레스 처치 |
| 21 | `main:episode_21_nergal_castle` | `nergal_castle` | 실내 | 네르갈 처치 |
| 22 | `main:episode_22_flame_castle` | `flame_castle` | 실내 | 베라모드 처치 |
| 23 | `main:episode_23_beelzebuth` | `beelzebuth_hall` | 실내 | 벨제뷔트 처치 |
| 24 | `main:episode_24_astaroth` | `astaroth_gate` | 실내 | 아스타로스 처치 |
| 25 | `main:episode_25_nergal_depths` | `nergal_depths` | 실내 | 네르갈 처치 |
| 26 | `main:episode_26_beast_mark` | `beast_mark_shrine` | 실내 | 배마의 징표 수호자 처치 |
| 27 | `main:episode_27_chosen_mark` | `chosen_mark_shrine` | 실내 | 택마의 징표 수호자 처치 |
| 28 | `main:episode_28_ergion` | `ergion_keep` | 실내 | 에르기온 처치 |
| 29 | `main:episode_29_martani` | `martani_bastion` | 실내 | 마르타니 처치 |
| 30 | `main:episode_30_blin` | `blin_watch` | 실내 | 블린 처치 |
| 31 | `main:episode_31_demon_fixers` | `demon_fixers_den` | 실내 | 마계 해결사 처치 |

## 원작 후반 구간 기준

현재 프로젝트는 대륙을 1개로 유지한다. 원작에서 합체 뒤 지역이 바뀌는 흐름은
별도 대륙 추가가 아니라, 같은 대륙 안에서 봉인되었거나 접근이 막혀 있던 후반 권역이
단계적으로 열리는 구조로 해석한다.

| 원작 구간 | 티어 기준 | 현재 구현 기준 |
|---|---|---|
| 1~20 | 7단 시나리오 | 1대륙 인간권/아멘트까지의 기본 구간. 현재 1~20화 구현 완료. |
| 21~27 | 8단 시나리오 | 합체 이후 열리는 같은 대륙의 봉인 권역. 현재 21~27화 구현 완료. |
| 28~33 | 9단 시나리오 | 더 깊은 후반 권역. 현재 28~31화 구현 완료, 32화는 원본 MAP 세트 확인됨, 33화는 MAP 세트 결손으로 보류. |
| 34~46 | `Wlib/scene*.lsc` 후보 | 로컬 클라이언트에 scene 스크립트는 있으나 대응 `Glib/gsceneNN.lsc`, `MAP/NNset.arc`, `MAP/NN.mrc`가 없어 메인 로드맵 대상에서 보류한다. |

## 실내 미션 후속 작업

현재 실내화 대상(1, 2, 3, 7, 13, 18, 19, 20, 21, 22화)은 모두 별도 실내맵 진입 흐름과
전용 원작 기반 방 구조/전투 동선이 들어갔다. 아멘트 3개 층은 `MAP/18set.arc`,
`MAP/19set.arc`, `MAP/20set.arc`의 원작 `DEO`/`evt` 흐름을 기준으로 문, 막힌 길,
보스 위치, 함정, 보상, 조각/암흑의 검 조건을 현재 전투식에 맞게 반영한다.
21화 네르갈 성은 `MAP/21set.arc`의 `21.DEO` 소환 연출과 `21.evt` EVENT 91~94/99
유물·클리어 이벤트를 별도 실내맵에 반영한다.
22화 플래임 캐슬은 `MAP/22set.arc`의 `22.DEO` 베라모드 대면, `22.DEE` 격파 대사,
`22.ai` 적 배치, `22.evt` EVENT 91~94/99 유물·클리어 이벤트를 별도 실내맵에 반영한다.

남은 후속 작업은 새 실내 던전 추가가 아니라 완성도 점검이다.

1. 각 실내맵의 목표 HUD와 입장/복귀/전리품 로그가 자연스럽게 보이는지 실제 플레이로 확인한다.
   - 완료: 자동 테스트에서 1~31화 실내 시나리오 전체(1, 2, 3, 7, 13, 18~31화)가 전용 목표 HUD 키, 현지화된 목표 문구, 실내 제목, 남은 적 수 모델을 노출하는지 검증한다.
   - 완료: 자동 테스트에서 1~31화 실내 시나리오 전체가 로컬 진입 시 공통 실내 진입 로그와 퀘스트 진입 로그를 남기고, 보스 목표 달성 뒤 원래 월드로 복귀하며 복귀 로그와 목표 완료 로그를 남기는지 검증한다.
   - 완료: 자동 테스트에서 1~31화 실내 시나리오 전체의 보스 전리품이 실내맵이 아니라 원래 월드 입구 타일에 남고, 입구 전리품 로그를 남기는지 검증한다.
   - 완료: Chrome headless에서 `/?devStart=raid&devScenario=story31`로 바로 진입해 `StoryInteriorMap`, `demon_fixers_den`, DEV 상태 `story31 / interior-ready`, 보스 1명(마계 해결사 `{22,11}`), 경비 보스 오인 0개, 입장 로그를 확인했다.
   - 완료: 같은 DEV 직접 진입 경로를 1~31화 전체로 확장했다. `npm run dev:raid:story1`~`npm run dev:raid:story31`로 모든 구현 시나리오를 개별 점검할 수 있고, URL의 `devScenario=storyNN` 형식도 유지한다. 자동 테스트는 실내 에피소드가 로컬 실내 던전으로 시작되고 필드/비공정 에피소드가 월드맵 목표 상태로 시작되는지, DEV 상태가 각각 `interior-ready` 또는 `scenario-ready`로 표시되는지 검증한다.
2. 23~31화 GETITEM 보상은 `src/data/content/original-late-story-items.json`에 원작 아이템 ID, 출처 이벤트, 원작 이름/스탯을 원장화했고 `orig_late_####` 아이템 정의로 지급한다. 원장은 `scripts/generate-late-story-item-defs.mjs`로 원작 `itemtbl.atr`에서 재생성할 수 있다.
3. 컷신 발표 단계의 카메라 포커스, 단계별 duration, 실제 지연 재생, 연출 중 월드 입력/이동 동결, 23~31화 주인공 진입 이동 연출은 런타임에 연결했다.

## 필드 미션 후속 작업

필드 시나리오(4, 5, 6, 8, 9, 10, 11, 12, 14, 15, 16화)는 전부 실내로 밀어 넣지
않는다. 월드맵 자체가 전투 공간이라는 현재 방향을 살리되, 원작 흐름에 맞는 필드
기믹을 붙인다.

- 4, 5, 6, 8, 9, 10, 11, 12, 14, 15, 16화는 원작 `DEO` 진입 흐름과 `evt` 주요 필드 이벤트가 하이브리드 방식으로 들어갔다.
- 평원/고원/마을: 목표 지점 점령, 추적, 마을 방어 같은 야외 전투 흐름.
- 항구/섬/호수/오아시스: 접근 경로, 다리/해안/물가 지형을 이용한 전투 흐름.
- 스케리아/발할라: 중후반 필드 보스 접근 루트와 위험 구역 분리.
- 17화 비공정은 `vehicle` 미션으로 유지하되, 원작 `DEO` 탑승 대사와 `evt` 보급/도착 이벤트가 들어갔다.
- DEV 직접 진입과 자동 테스트에서 4~6, 8~12, 14~16화 필드 시나리오는 월드맵 목표 상태로 시작되어 원작 투영 필드 이벤트 마커, 목표 적 배치, 입장/완료 로그를 검증한다. 17화 비공정은 보스 없는 `vehicle` 목표로 시작하되 로컬 플레이에서는 원작 보급/도착 조사 마커를 유지하고, 도착 이벤트가 목표 완료를 발생시키며 선택 경비는 유지된다.
- 자동 테스트에서 이벤트가 있는 필드/비공정 시나리오 전체가 원작 좌표를 현재 월드 입구 주변의 실제 보행 가능 타일로 투영하고, 네트워크 스냅샷에서 모든 조사 마커를 노출/완료 후 숨김 처리하는지 검증한다.
- 로컬/서버 양쪽 경로에서 원작 `CHARDEAD` 기반 적 처치 발표 이벤트 전체가 실제 시나리오 적 인덱스와 연결되어, 처치 시 원작 발표 단계와 현재 적 위치 포커스를 반환하는지 검증한다.
- 서버 권한 경로에서도 1~31화 전체 `SCENARIO_ENTER`가 실제 시나리오 상태를 만들고, 실내는 개인 실내 시작/복귀 타일을, 필드는 월드맵 시작 위치와 목표 적을, 17화 비공정은 즉시 완료형 보스리스 목표를 생성하는지 자동 테스트로 검증한다.
- 서버 권한 경로에서 1~31화 전체 목표 완료는 즉시 저장 파일에 반영되지 않고, 유효한 다른 마을로 생환한 뒤에만 최종 저장 패치의 완료 퀘스트에 포함되는지 자동 테스트로 검증한다.

## 통합 규칙

- 스토리 문장은 원문 복붙이 아니라 짧게 재작성한 요약으로 둔다.
- 유저에게 보이는 문자열은 `LanguageManager.ts`의 ko/en 양쪽에 추가한다.
- 던전 안에서는 목표 달성만 기록하고, `SURVIVED` 결과 전에는 영구 보상을 주지 않는다.
- 시나리오 몬스터 배치는 `StoryScenarioMonsterData.ts`의 ID 표를 우선 수정하고, 서버/로컬이 같은 표를 쓰도록 유지한다.
- 원작 몬스터 raw 스탯은 `docs/monster-balance.md`의 정규화 규칙을 거쳐 사용한다.
- 유효한 생환 마을은 출발지가 아닌 마을이다. 출발 마을 재진입은 생환으로 인정하지 않는다.
- 진행에 필요한 보상은 세션 인벤토리가 아니라 `PlayerData.questItems`에 저장한다.
- 공개 전 명칭/에셋 교체는 데이터 파일부터 바꿀 수 있게 유지한다.

## 검증 명령

- `npm run verify:story`: 필수 렌더/BGM/font 자산 참조와 1~31화의 선언된 원본 `Wlib`/`Glib`/`MAP` 파일과 `set.arc`
  멤버를 추출 원본과 대조하고, `original-scenario-import`/메인퀘스트 로드맵 표가
  런타임 선언과 일치하는지 확인하며, 1~31화 체인/중복, 퀘스트 정의/
  표시 텍스트/보상/이벤트 참조/시나리오 원장/월드맵 입구/hmap 지형/
  실내 접근성/23~31화 후반 원본 AI·MRC·DEO·DEE 발표 포커스/hmap 재생성/후반 봉인 권역 바이옴·위험도/
  필드 이벤트 월드 배치/몬스터 배치/스토리 i18n/BGM/완료 플래그 계약과
  23~31화 후반 원장(아이템/MRC/hmap/set.arc/source)을 함께 검증한다.
