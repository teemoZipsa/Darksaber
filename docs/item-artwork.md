# 아이템 그림 보완 — 2026-09-13

375종 중 이모지·문자로 표시되던 200종에 그림을 연결했다. 기존 원작 그림 175종은 보존했다. 빠진 154종은 원작 아틀라스에서 형태·재질에 맞는 그림을 재사용하고, 46종은 새로 만든 13개 그림을 사용한다.

- 단검·장검·활·창·방패, 84종 계열 방어구, 반지·보석·스토리 조각 등: 기존 원작 PNG 재사용. 원작 아이템의 정확한 정체가 확인되지 않은 대응은 시각적 대체이며 원작 데이터 복원으로 주장하지 않는다.
- 수리 키트, 수지, 버섯, 소금, 향신료, 비단, 향, 성물함, 호박, 기름통, 등잔, 검술교본, 룬석: 내장 `image_gen`으로 개별 제작. 33개 룬은 같은 룬석 그림, 두 종류 향은 같은 향 다발 그림을 공유한다. 보석 등급과 룬 순위는 기존 이름·희귀도·설명으로 구분한다.
- 기본 32×32 셀, 새 그림은 최대 26×26 영역과 사방 3px 투명 여백. 좌표·크기·투명도는 인벤토리/상점/툴팁과 Canvas 도구 목록에서 같은 규칙으로 처리한다. 게임 수치·가격·크기·보관/장착 규칙은 변경하지 않는다.

## 파일과 재생성

- 원본 아틀라스: `public/assets/images/items/darksaber_items.png` (수정 없음)
- 새 아틀라스: `public/assets/images/items/supplemental_items.png`
- 개별 최종 PNG와 SHA-256: `public/assets/images/items/supplemental/`
- 대응표: `src/data/ItemArtwork.ts`; 기존 `iconSprite` 지정이 항상 우선한다.
- 생성 모드·최종 프롬프트·원본 생성 파일명: [item-artwork-prompts.json](assets/item-artwork-prompts.json)

직접 알파 생성 시 체크무늬가 RGB에 포함되어, 생성 도구로 단색 마젠타 배경을 지정했다. PNG 가져오기 과정에서 해당 색과 연결된 가장자리만 투명 처리한 후 nearest-neighbor 축소·중앙 정렬·32색 팔레트로 정규화했다. 물체 내부 보라색은 배경과 분리해 보존한다. 원본 생성 파일은 로컬 `.runtime/item-icons/generated/`에 보관하며 최종 RGBA PNG와 아틀라스는 저장소에 포함한다.

```sh
node scripts/import-item-artwork.mjs .runtime/item-icons/generated
node scripts/import-item-artwork.mjs --pack-only
```

첫 명령은 이름별 생성 원본을 가져온다. 두 번째 명령은 저장소의 개별 PNG만으로 아틀라스를 다시 묶는다. 새 종류를 추가할 때는 `ItemArtwork.ts`와 가져오기 스크립트의 셀 순서를 함께 갱신한다. `tests/raid/item-artwork.test.ts`는 모든 실제 아이템의 유효한 셀·투명 여백·원작 좌표 보존을 검사한다.
