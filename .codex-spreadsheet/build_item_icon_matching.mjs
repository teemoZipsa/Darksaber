import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const repoRoot = "C:/Users/arasoftGJ_01/MyProjects/Darksaber";
const outputDir = path.join(repoRoot, "outputs", "item-icon-matching");
const iconDir = path.join(repoRoot, ".codex-item-atlas-preview", "icons");
const allIconDir = path.join(repoRoot, ".codex-item-atlas-preview", "all-icons");
const allIconManifest = path.join(repoRoot, ".codex-item-atlas-preview", "all-icons-manifest.csv");
const atlasPreview = path.join(repoRoot, ".codex-item-atlas-preview", "item-1x1-candidates.png");
const webItemsDataPath = path.join(repoRoot, ".codex-web-items", "lastlangrisser_items.json");

const finalConfirmed = [
  ["herb_cheap", "싸구려 약초", "consumable", "83,0", "herb_83_0", "확정", "사용자 확인", "사용자 확인 완료. 현재 ItemDB에 적용된 1x1 소모품 아이콘."],
  ["herb_common", "흔한 약초", "consumable", "84,0", "herb_84_0", "확정", "사용자 확인", "사용자 확인 완료. 현재 ItemDB에 적용된 1x1 소모품 아이콘."],
  ["herb_rare", "귀한 약초", "consumable", "85,0", "herb_85_0", "확정", "사용자 확인", "사용자 확인 완료. 현재 ItemDB에 적용된 1x1 소모품 아이콘."],
  ["herb_legendary", "희귀한 약초", "consumable", "86,0", "herb_86_0", "확정", "사용자 확인", "사용자 확인 완료. 현재 ItemDB에 적용된 1x1 소모품 아이콘."],
  ["mp_potion", "MP 포션", "consumable", "82,0", "blue_potion_82_0", "확정", "사용자 확인", "사용자 확인 완료. 현재 ItemDB에 적용된 1x1 소모품 아이콘."],
  ["official_hwareo_sword", "활어신검", "weapon", "62,3", "cell_62_03", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_baekyeol_sword", "백열신검", "weapon", "32,4", "cell_32_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_deattack_spear_7", "디어택 스피어 7", "weapon", "82,1", "cell_82_01", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_holy_spear_7", "홀리 스피어 7", "weapon", "85,1", "cell_85_01", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_holy_sword_7", "홀리 소드 7", "weapon", "70,1", "cell_70_01", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_holy_lance_7", "홀리 랜스 7", "weapon", "84,1", "cell_84_01", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_holy_halberd_7", "홀리 할버트 7", "weapon", "86,1", "cell_86_01", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_poison_spear_7", "포이즌 스피어 7", "weapon", "81,1", "cell_81_01", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_devil_sword", "데빌 소드", "weapon", "37,4", "cell_37_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_gwangyeol_sword", "광열검", "weapon", "38,4", "cell_38_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_geno_breaker", "제노 브레이커", "weapon", "39,4", "cell_39_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_kelion_spear", "켈리온 스피어", "weapon", "40,4", "cell_40_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_ring_of_star", "스타링", "accessory", "41,4", "cell_41_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_ring_of_mars", "마스링", "accessory", "42,4", "cell_42_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_icarus_badge", "이카루스 휘장", "accessory", "43,4", "cell_43_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_mernika_badge", "메르니카 휘장", "accessory", "44,4", "cell_44_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_angel_of_light", "엔젤 오브 라이트", "weapon", "45,4", "cell_45_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_finix_of_soul", "피닉스 오브 소울", "weapon", "46,4", "cell_46_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_grand_strider", "그랑 스트라이더", "armor", "47,4", "cell_47_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_acronian", "아크로니안", "armor", "48,4", "cell_48_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_lighting_shoes", "라이팅 슈즈", "boots", "49,4", "cell_49_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_chaos_breaker", "카오스 브레이커", "weapon", "50,4", "cell_50_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_abidorius", "아비도리어스", "weapon", "51,4", "cell_51_04", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_holy_ring", "홀리링", "accessory", "64,0", "cell_64_00", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["suggested_bomb", "폭탄", "consumable", "7,1", "cell_07_01", "확정", "사용자 확인", "사용자 확인 완료. 원작 목록의 폭탄과 아이콘이 직접 대응."],
  ["suggested_gold_coin_five", "금화다섯개", "valuable", "96,0", "cell_96_00", "확정", "사용자 확인", "사용자 확인 완료. 금화 더미 이미지와 원작 귀중품이 직접 대응."],
  ["official_red_blade", "레드 블레이드", "weapon", "29,5", "cell_29_05", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_yellow_blade", "옐로 블레이드", "weapon", "20,5", "cell_20_05", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_green_blade", "그린 블레이드", "weapon", "18,5", "cell_18_05", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_blue_blade", "블루 블레이드", "weapon", "19,5", "cell_19_05", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_asura", "아수라", "weapon", "30,5", "cell_30_05", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
  ["official_ruiner", "루이너", "weapon", "28,5", "cell_28_05", "확정", "공식 이미지", "공식 아이템 리스트 이미지와 atlas 픽셀 비교로 직접 매칭."],
];

const recommended = [
  ["wooden_shield", "나무방패 / 우든 실드", "shield", "28,0", "cell_28_00", "원작 목록 기반 추천", "높음", "원작 일반 방패 목록의 우든 실드와 둥근 나무 방패 이미지가 직접 대응."],
  ["power_ring", "파워링", "accessory", "31,6", "ring_31_6", "원작 목록 기반 추천", "중간", "원작 파워링은 공격력 증가 반지. 금색 공격형 반지 후보 중 가장 직관적."],
  ["shell_ring", "쉘링 / 셀링", "accessory", "32,6", "ring_32_6", "원작 목록 기반 추천", "중간", "원작 셀링은 마공 증가 반지. 흰색/마법 계열 반지 후보로 유추."],
  ["heal_ring", "힐 링 / 홀리링", "accessory", "33,6", "ring_33_6", "원작 목록 기반 추천", "중간", "원작 홀리링은 리제네 효과. 밝은 보석 반지 후보로 유추."],
  ["amulet", "아뮬렛 / 에뮬렛", "accessory", "88,4", "amulet_88_4", "원작 목록 기반 추천", "중간", "원작 에뮬렛은 마법력 증폭 장신구. 금색 목걸이형 아이콘이 가장 자연스러움."],
  ["suggested_antidote", "해독제", "consumable", "88,0", "medicine_88_0", "원작 목록 기반 추천", "높음", "십자 표시가 있는 약병. 포이즌 치료 소모품과 직접 대응."],
  ["suggested_fire_herb", "화염초", "consumable", "90,0", "rare_90_0", "원작 목록 기반 추천", "높음", "불꽃처럼 보이는 붉은 약초. 화이어볼 효과 소모품과 대응."],
  ["suggested_ice_herb", "빙결초", "consumable", "91,0", "rare_91_0", "원작 목록 기반 추천", "높음", "얼음 결정처럼 보이는 푸른 약초. 프리즈 효과 소모품과 대응."],
  ["suggested_poison_needle", "독침", "consumable", "92,0", "cell_92_00", "원작 목록 기반 추천", "높음", "침/다트형 아이콘. 독침과 직접 대응."],
  ["suggested_phoenix_feather", "봉익", "consumable", "93,0", "cell_93_00", "원작 목록 기반 추천", "높음", "깃털 아이콘. 봉황의 깃털 설명과 직접 대응."],
  ["suggested_lock", "자물쇠", "consumable", "2,1", "cell_02_01", "원작 목록 기반 추천", "높음", "잠금쇠 아이콘. 비밀방 개설 소모품과 직접 대응."],
  ["suggested_gold_coin_two", "금화두개", "valuable", "95,0", "cell_95_00", "원작 목록 기반 추천", "높음", "금화 2개 이미지. 귀중품 금화두개와 직접 대응."],
  ["suggested_gold_coin_stack", "금화한무더기", "valuable", "97,0", "cell_97_00", "원작 목록 기반 추천", "높음", "큰 금화 더미 이미지. 금화한무더기와 직접 대응."],
  ["suggested_golden_eagle", "황금독수리", "valuable", "98,0", "cell_98_00", "원작 목록 기반 추천", "높음", "황금 독수리상 이미지. 귀중품 설명과 직접 대응."],
  ["suggested_golden_horse", "황금망아지", "valuable", "99,0", "cell_99_00", "원작 목록 기반 추천", "높음", "황금 말 조각상 이미지. 귀중품 설명과 직접 대응."],
];

const needsReview = [
  ["void_crystal", "공허의 수정", "accessory", "90,4 / 91,4 / 92,4", "crystal_90_4, crystal_91_4, crystal_92_4", "확인 필요", "중간", "보스 드랍 수정. 보라/푸른 수정 후보 중 선택 필요."],
  ["repair_kit", "수리 키트", "consumable", "87,0 / 76,2", "bag_87_0, bag10_76_2", "후속 확인", "낮음", "원작 소모품 중 직접 수리 키트로 보이는 아이콘은 명확하지 않음. 현재 V1 도구에서도 제외."],
  ["suggested_heal_potion", "힐포션", "consumable", "87,0 / 88,0", "bag_87_0, medicine_88_0", "확인 필요", "중간", "회복약류로 보이는 후보는 있으나 해독제와 겹칠 수 있어 확인 필요."],
  ["suggested_endorphin", "엔돌핀", "consumable", "89,0", "drink_89_0", "확인 필요", "중간", "음료/과일 병처럼 보여 엔돌핀 후보지만 확정 근거는 부족."],
  ["suggested_return_stone", "귀환의돌", "consumable", "0,1 / 1,1 / 79,2", "cell_00_01, cell_01_01, orb10_79_2", "확인 필요", "낮음", "구슬류 후보가 여럿 있음. 10개 묶음 아이콘과도 구분 필요."],
  ["suggested_warp_stone", "공간이동의 마석", "consumable", "80,2 / 90,4 / 92,4", "jewel10_80_2, crystal_90_4, crystal_92_4", "확인 필요", "낮음", "마석/수정류 후보가 많아 확인 필요."],
  ["suggested_key_series", "열쇠류", "key", "8,1~15,1 / 6,3~14,3", "cell_08_01, cell_09_01, cell_10_01, cell_11_01", "확인 필요", "중간", "원작에 청동/은/목재/봉인/혼돈 열쇠가 많아 색상별 매칭 필요."],
];

const eventCleanup = [
  ["PC Power 1~12", "귀중품", "이벤트/잡지", "후보 풀에서 PC POWER/PC CHAMP 표지 아이콘 일괄 확인", "게임 진행 기능이 없다면 후속 정리 후보"],
  ["바톤1~8", "귀중품", "이벤트/달리기 경주", "후보 풀에서 바톤/막대 형태 아이콘 확인", "이벤트 기능이 없다면 후속 정리 후보"],
  ["결혼반지", "기타", "결혼 이벤트", "반지 후보와 겹침", "결혼 시스템 미구현이면 후속 정리 후보"],
  ["노란꽃", "기타", "결혼 이벤트", "꽃/약초 후보와 겹침", "결혼 시스템 미구현이면 후속 정리 후보"],
  ["선물상자", "귀중품", "이벤트/선물", "후보 풀에서 선물상자 아이콘 확인", "이벤트 기능 정의 후 유지/삭제 결정"],
  ["신비의 조각 A~D", "귀중품", "시나리오 조각", "보석/조각 후보와 겹침", "흑자성검 제작 기능을 넣을 때 유지"],
];

function keyToPng(key) {
  if (key.startsWith("cell_")) return path.join(allIconDir, `${key}.png`);
  return path.join(iconDir, `${key}.png`);
}

async function loadAtlasCandidatePool() {
  const csv = await fs.readFile(allIconManifest, "utf8");
  const lines = csv.trim().split(/\r?\n/).slice(1);
  return lines.map((line) => {
    const [key, col, row, coord, nonTransparent] = [...line.matchAll(/"([^"]*)"/g)]
      .map((match) => match[1]);
    return [
      key,
      coord,
      `atlas col ${col}, row ${row}`,
      `${nonTransparent} px`,
    ];
  });
}

const candidatePool = await loadAtlasCandidatePool();

async function loadWebItemsData() {
  try {
    return JSON.parse(await fs.readFile(webItemsDataPath, "utf8"));
  } catch {
    return { summary: {}, items: [] };
  }
}

const webItemsData = await loadWebItemsData();
const webItems = webItemsData.items ?? [];
const finalConfirmedNames = new Set(finalConfirmed.map((row) => row[1]));
const webConfirmed = webItems
  .filter((item) => item.matchConfidence !== "no_match")
  .filter((item) => item.parseStatus === "ok")
  .filter((item) => !finalConfirmedNames.has(item.name))
  .map((item) => [
    `web_${item.sourcePage}_${String(item.sourceOrder).padStart(2, "0")}`,
    item.name,
    `장착위 ${item.equipSlot}`,
    item.atlasCoord,
    item.atlasKey,
    "확정",
    "웹자료 exact",
    `${item.sourceName} ${item.sourceOrder}번. 원문 아이콘과 atlas가 exact 매칭. 장착레벨 ${item.level}, 내구력 ${item.durability}.`,
  ]);
const finalConfirmedRows = [...finalConfirmed, ...webConfirmed];
const webSourceSummary = Object.entries(webItemsData.summary ?? {}).map(([sourceName, counts]) => {
  const first = webItems.find((item) => item.sourceName === sourceName);
  return [
    sourceName,
    first?.sourceUrl ?? "",
    first?.sourceKind ?? "",
    counts.count ?? 0,
    counts.exact ?? 0,
    (counts.strong ?? 0) + (counts.medium ?? 0) + (counts.low ?? 0),
    counts.no_match ?? 0,
    "no_match는 티스토리 공용 '없음' placeholder 이미지라 atlas 좌표를 비워둠",
  ];
});

async function dataUrl(filePath) {
  const data = await fs.readFile(filePath);
  return `data:image/png;base64,${data.toString("base64")}`;
}

function formatHeader(range) {
  range.format = {
    fill: "#1F2937",
    font: { color: "#FFFFFF", bold: true },
    wrapText: true,
  };
}

function formatNote(range) {
  range.format = {
    fill: "#FFF7ED",
    font: { color: "#7C2D12" },
    wrapText: true,
  };
}

async function addIcon(sheet, key, row, col, size = 34) {
  const png = keyToPng(key);
  try {
    await fs.access(png);
  } catch {
    return;
  }
  sheet.images.add({
    dataUrl: await dataUrl(png),
    anchor: {
      from: { row, col, rowOffsetPx: 4, colOffsetPx: 10 },
      extent: { widthPx: size, heightPx: size },
    },
  });
}

async function addMultiIcons(sheet, keys, row, col) {
  const list = keys.split(",").map((value) => value.trim()).filter(Boolean);
  for (let i = 0; i < Math.min(list.length, 4); i++) {
    const key = list[i];
    const png = keyToPng(key);
    try {
      await fs.access(png);
    } catch {
      continue;
    }
    sheet.images.add({
      dataUrl: await dataUrl(png),
      anchor: {
        from: { row, col, rowOffsetPx: 4, colOffsetPx: 6 + i * 35 },
        extent: { widthPx: 30, heightPx: 30 },
      },
    });
  }
}

async function addFileIcon(sheet, filePath, row, col, size = 34) {
  if (!filePath) return;
  try {
    await fs.access(filePath);
  } catch {
    return;
  }
  sheet.images.add({
    dataUrl: await dataUrl(filePath),
    anchor: {
      from: { row, col, rowOffsetPx: 4, colOffsetPx: 10 },
      extent: { widthPx: size, heightPx: size },
    },
  });
}

const workbook = Workbook.create();
const summary = workbook.worksheets.add("README");
const finalConfirmedSheet = workbook.worksheets.add("확정");
const recommendedSheet = workbook.worksheets.add("확정 추천");
const reviewSheet = workbook.worksheets.add("확인 필요");
const webSummarySheet = workbook.worksheets.add("웹자료_요약");
const webItemsSheet = workbook.worksheets.add("웹자료_아이템");
const poolSheet = workbook.worksheets.add("후보 풀");
const cleanupSheet = workbook.worksheets.add("이벤트 정리 후보");

summary.showGridLines = false;
summary.getRange("A1:H1").merge();
summary.getRange("A1").values = [["Darksaber 원작 아이템 아이콘 매칭표"]];
summary.getRange("A1").format = { fill: "#111827", font: { bold: true, color: "#FFFFFF", size: 16 } };
summary.getRange("A3:B11").values = [
  ["목적", "원작 Item.bmp 아틀라스를 현재 ItemDB에 안전하게 매칭하기 위한 검토표"],
  ["아틀라스", "public/assets/images/items/darksaber_items.png"],
  ["좌표 기준", "32x32 cell, col,row"],
  ["확정", "사용자 확인 항목, 공식 아이템 리스트 이미지, 웹자료 exact 매칭 항목"],
  ["확정 추천", "원작 목록 기반으로 강하게 유추 가능하지만 공식 이미지 대조 전인 항목"],
  ["확인 필요", "후보가 여럿이거나 원작 이름과 이미지 대응이 애매한 항목"],
  ["웹자료_요약", "lastlangrisser.tistory.com/65~70 추출/매칭 요약"],
  ["웹자료_아이템", "웹자료에서 추출한 아이템 215개와 원문 아이콘/atlas 좌표"],
  ["배경 처리", "순수 #000000 픽셀은 투명화된 PNG로 변환 완료"],
];
summary.getRange("A3:A11").format = { fill: "#E5E7EB", font: { bold: true } };
summary.getRange("B3:B11").format = { wrapText: true };
summary.getRange("A10:H10").merge();
summary.getRange("A10").values = [["전체 후보 미리보기"]];
summary.getRange("A10").format = { fill: "#374151", font: { bold: true, color: "#FFFFFF" } };
summary.images.add({
  dataUrl: await dataUrl(atlasPreview),
  anchor: { from: { row: 10, col: 0 }, extent: { widthPx: 520, heightPx: 410 } },
});
summary.getRange("A:A").format.columnWidthPx = 130;
summary.getRange("B:B").format.columnWidthPx = 620;

const confirmedHeaders = [["아이템 ID", "현재 이름", "슬롯", "후보 이미지", "좌표", "후보 키", "상태", "확신도", "메모"]];

async function writeIconSheet(sheet, rows) {
  sheet.getRange("A1:I1").values = confirmedHeaders;
  sheet.getRangeByIndexes(1, 0, rows.length, 9).values = rows.map((row) => [
    row[0], row[1], row[2], "", row[3], row[4], row[5], row[6], row[7],
  ]);
  formatHeader(sheet.getRange("A1:I1"));
  formatNote(sheet.getRangeByIndexes(1, 6, rows.length, 3));
  sheet.freezePanes.freezeRows(1);
  sheet.getRange("A:I").format.wrapText = true;
  sheet.getRange("A:A").format.columnWidthPx = 150;
  sheet.getRange("B:B").format.columnWidthPx = 120;
  sheet.getRange("C:C").format.columnWidthPx = 95;
  sheet.getRange("D:D").format.columnWidthPx = 64;
  sheet.getRange("E:F").format.columnWidthPx = 95;
  sheet.getRange("G:H").format.columnWidthPx = 90;
  sheet.getRange("I:I").format.columnWidthPx = 390;
  for (let i = 0; i < rows.length; i++) {
    sheet.getRangeByIndexes(i + 1, 0, 1, 9).format.rowHeightPx = 44;
    await addIcon(sheet, rows[i][4], i + 1, 3);
  }
}

await writeIconSheet(finalConfirmedSheet, finalConfirmedRows);
await writeIconSheet(recommendedSheet, recommended);

reviewSheet.getRange("A1:I1").values = confirmedHeaders;
reviewSheet.getRangeByIndexes(1, 0, needsReview.length, 9).values = needsReview.map((row) => [
  row[0], row[1], row[2], "", row[3], row[4], row[5], row[6], row[7],
]);
formatHeader(reviewSheet.getRange("A1:I1"));
formatNote(reviewSheet.getRangeByIndexes(1, 6, needsReview.length, 3));
reviewSheet.freezePanes.freezeRows(1);
reviewSheet.getRange("A:I").format.wrapText = true;
reviewSheet.getRange("A:A").format.columnWidthPx = 130;
reviewSheet.getRange("B:B").format.columnWidthPx = 110;
reviewSheet.getRange("C:C").format.columnWidthPx = 95;
reviewSheet.getRange("D:D").format.columnWidthPx = 148;
reviewSheet.getRange("E:E").format.columnWidthPx = 180;
reviewSheet.getRange("F:F").format.columnWidthPx = 250;
reviewSheet.getRange("G:H").format.columnWidthPx = 90;
reviewSheet.getRange("I:I").format.columnWidthPx = 380;
for (let i = 0; i < needsReview.length; i++) {
  reviewSheet.getRangeByIndexes(i + 1, 0, 1, 9).format.rowHeightPx = 44;
  await addMultiIcons(reviewSheet, needsReview[i][4], i + 1, 3);
}

webSummarySheet.getRange("A1:H1").values = [["출처", "URL", "분류", "추출 아이템", "atlas exact", "검토 필요", "no_match", "메모"]];
if (webSourceSummary.length > 0) {
  webSummarySheet.getRangeByIndexes(1, 0, webSourceSummary.length, 8).values = webSourceSummary;
}
formatHeader(webSummarySheet.getRange("A1:H1"));
formatNote(webSummarySheet.getRangeByIndexes(1, 7, Math.max(webSourceSummary.length, 1), 1));
webSummarySheet.freezePanes.freezeRows(1);
webSummarySheet.getRange("A:H").format.wrapText = true;
webSummarySheet.getRange("A:A").format.columnWidthPx = 190;
webSummarySheet.getRange("B:B").format.columnWidthPx = 260;
webSummarySheet.getRange("C:G").format.columnWidthPx = 95;
webSummarySheet.getRange("H:H").format.columnWidthPx = 360;

const webItemHeaders = [[
  "출처", "페이지", "순번", "아이템명", "원문 아이콘", "atlas 아이콘", "atlas 좌표", "매칭",
  "점수", "장착위", "장착레벨", "내구력", "이동", "공격", "방어", "공격범위", "마법력",
  "마법공격", "마법방어", "마법범위", "지휘범위", "명중률", "회피율", "사용가능 클래스", "설명", "URL",
]];
webItemsSheet.getRange("A1:Z1").values = webItemHeaders;
if (webItems.length > 0) {
  webItemsSheet.getRangeByIndexes(1, 0, webItems.length, 26).values = webItems.map((item) => [
    item.sourceName,
    item.sourcePage,
    item.sourceOrder,
    item.name,
    "",
    "",
    item.atlasCoord,
    item.matchConfidence,
    item.matchScore,
    item.equipSlot,
    item.level,
    item.durability,
    item["이동"],
    item["공격"],
    item["방어"],
    item["공격범위"],
    item["마법력"],
    item["마법공격"],
    item["마법방어"],
    item["마법범위"],
    item["지휘범위"],
    item["명중률"],
    item["회피율"],
    item.classes,
    item.description,
    item.sourceUrl,
  ]);
}
formatHeader(webItemsSheet.getRange("A1:Z1"));
webItemsSheet.freezePanes.freezeRows(1);
webItemsSheet.getRange("A:Z").format.wrapText = true;
webItemsSheet.getRange("A:A").format.columnWidthPx = 190;
webItemsSheet.getRange("B:C").format.columnWidthPx = 55;
webItemsSheet.getRange("D:D").format.columnWidthPx = 150;
webItemsSheet.getRange("E:F").format.columnWidthPx = 66;
webItemsSheet.getRange("G:I").format.columnWidthPx = 85;
webItemsSheet.getRange("J:W").format.columnWidthPx = 65;
webItemsSheet.getRange("X:X").format.columnWidthPx = 260;
webItemsSheet.getRange("Y:Y").format.columnWidthPx = 340;
webItemsSheet.getRange("Z:Z").format.columnWidthPx = 230;
for (let i = 0; i < webItems.length; i++) {
  webItemsSheet.getRangeByIndexes(i + 1, 0, 1, 26).format.rowHeightPx = 44;
  await addFileIcon(webItemsSheet, webItems[i].localIcon, i + 1, 4, 32);
  await addIcon(webItemsSheet, webItems[i].atlasKey, i + 1, 5, 32);
}

poolSheet.getRange("A1:E1").values = [["후보 키", "좌표", "이미지", "설명", "비투명 픽셀 수"]];
poolSheet.getRangeByIndexes(1, 0, candidatePool.length, 5).values = candidatePool.map((row) => [
  row[0], row[1], "", row[2], row[3],
]);
formatHeader(poolSheet.getRange("A1:E1"));
poolSheet.freezePanes.freezeRows(1);
poolSheet.getRange("A:E").format.wrapText = true;
poolSheet.getRange("A:A").format.columnWidthPx = 150;
poolSheet.getRange("B:B").format.columnWidthPx = 80;
poolSheet.getRange("C:C").format.columnWidthPx = 64;
poolSheet.getRange("D:E").format.columnWidthPx = 240;
for (let i = 0; i < candidatePool.length; i++) {
  poolSheet.getRangeByIndexes(i + 1, 0, 1, 5).format.rowHeightPx = 44;
  await addIcon(poolSheet, candidatePool[i][0], i + 1, 2);
}

cleanupSheet.getRange("A1:E1").values = [["원작 항목", "분류", "용도", "이미지 검토", "정리 메모"]];
cleanupSheet.getRangeByIndexes(1, 0, eventCleanup.length, 5).values = eventCleanup;
formatHeader(cleanupSheet.getRange("A1:E1"));
formatNote(cleanupSheet.getRangeByIndexes(1, 4, eventCleanup.length, 1));
cleanupSheet.freezePanes.freezeRows(1);
cleanupSheet.getRange("A:E").format.wrapText = true;
cleanupSheet.getRange("A:A").format.columnWidthPx = 140;
cleanupSheet.getRange("B:C").format.columnWidthPx = 110;
cleanupSheet.getRange("D:D").format.columnWidthPx = 310;
cleanupSheet.getRange("E:E").format.columnWidthPx = 310;

await fs.mkdir(outputDir, { recursive: true });

const preview = await workbook.render({ sheetName: "확인 필요", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(path.join(outputDir, "item_icon_matching_preview.png"), new Uint8Array(await preview.arrayBuffer()));

const inspect = await workbook.inspect({
  kind: "table",
  range: "웹자료_요약!A1:H7",
  include: "values",
  tableMaxRows: 8,
  tableMaxCols: 8,
});
console.log(inspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "darksaber_item_icon_matching.xlsx"));
