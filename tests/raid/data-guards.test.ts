import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAR_CLASSES } from '../../src/data/characterClasses';
import { getMasterClass, isMasterClassLineId } from '../../src/data/ClassTree';
import { getCombatRecovery, getItemDef, ITEMS } from '../../src/data/ItemDB';
import { ORIGINAL_LATE_STORY_FACTS, getOriginalLateStoryCacheEvents, getOriginalLateStoryFact } from '../../src/data/OriginalLateStoryFacts';
import { ORIGINAL_LATE_STORY_MRC_FACTS } from '../../src/data/OriginalLateStoryMapFacts';
import {
    ORIGINAL_LATE_STORY_ITEMS,
    ORIGINAL_LATE_STORY_REWARD_ITEMS,
    getOriginalLateStoryItem,
    getOriginalLateStoryItemIds,
    getOriginalLateStoryItemsForSourceEvent,
} from '../../src/data/OriginalLateStoryItems';
import {
    GENERAL_MONSTER_IDS,
    FINAL_STORY_MONSTER_IDS,
    NEW_MONSTER_IDS,
    RESERVED_RENDERABLE_MONSTER_IDS,
    getMonsterDefinitionSafe,
    isMonsterId,
} from '../../src/data/MonsterCatalog';
import { ORIGINAL_SHOP_ITEMS } from '../../src/data/OriginalShopItems';
import { PlayerData } from '../../src/data/PlayerData';
import { getRestFacility, REST_FACILITIES } from '../../src/data/RestFacilityData';
import { getSellPrice, getShopItems, SHOP_INVENTORY_BY_TOWN_FACILITY } from '../../src/data/ShopData';
import { rollBossRune, rollChestGem } from '../../src/data/SocketLoot';
import { getSkill } from '../../src/data/SkillDB';
import { getSkillVisualProfile } from '../../src/data/SkillVisualProfiles';
import { createBaseStats, getBaseStatsForClass } from '../../src/data/Stats';
import { STORY_QUESTS, getStoryCompanionRewards } from '../../src/data/StoryQuestData';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';
import { STORY_SCENARIO_EVENT_SEQUENCES } from '../../src/data/StoryScenarioEventData';
import { STORY_INTERIOR_LAYOUTS, getStoryInteriorLayout } from '../../src/data/StoryInteriorData';
import { i18n } from '../../src/i18n/LanguageManager';
import {
    ORIGINAL_MONSTER_COUNT,
    getOriginalMonsterRow,
    isOriginalMonsterId,
} from '../../src/data/original/originalMonsters';
import type { Skill } from '../../src/data/SkillDB';
import {
    TOWN_FACILITIES,
    getTownFacilities,
    getTownNameKey,
    isTownFacilityId,
    isTownId,
} from '../../src/data/TownFacilityData';
import { AUDIO_CATALOG } from '../../src/engine/AudioManager';

type StoryScenarioContentRecord = {
    episode: number;
    questId: string;
    dungeonId: string;
    guardCount: number;
    missionKind: string;
};

test('town facility guards reject prototype keys and return copies', () => {
    assert.equal(isTownId('toString'), false);
    assert.equal(isTownFacilityId('toString'), false);

    const centralFacilities = getTownFacilities('central_castle');
    centralFacilities.push('shrine');
    assert.equal(TOWN_FACILITIES.central_castle.includes('shrine'), false);

    const fallbackFacilities = getTownFacilities('__missing__');
    fallbackFacilities.push('shrine');
    assert.deepEqual(getTownFacilities('__missing__'), ['storage', 'general_store', 'rumors']);
});

test('town name keys resolve in both supported languages', () => {
    const previousLang = i18n.lang;
    try {
        for (const lang of ['ko', 'en'] as const) {
            i18n.setLanguage(lang);
            for (const townId of Object.keys(TOWN_FACILITIES)) {
                const key = getTownNameKey(townId);
                assert.notEqual(i18n.t(key), key);
            }
        }
    } finally {
        i18n.setLanguage(previousLang);
    }
});

test('class and stat guards reject loose ids and clamp resources', () => {
    assert.equal(isMasterClassLineId('master_battle'), true);
    assert.equal(isMasterClassLineId('master_fake'), false);
    assert.equal(getMasterClass('battle')?.branch, 'battle');

    const stats = createBaseStats({ hp: 150, maxHp: 100, mp: Number.NaN, maxMp: 10 });
    assert.equal(stats.hp, 100);
    assert.equal(stats.mp, 10);

    const base = getBaseStatsForClass('unknown', Number.NaN);
    assert.deepEqual(base, { mov: 0 });
});

test('item normalization keeps consumable rarity and generated armor metadata stable', () => {
    assert.equal(getItemDef('herb_cheap')?.rarity, 'common');
    assert.equal(getItemDef('orig_story_0300_heal_potion')?.rarity, 'uncommon');
    assert.equal(getItemDef('herb_common')?.rarity, 'uncommon');
    assert.equal(getItemDef('orig_story_0305_magic_potion')?.rarity, 'uncommon');
    assert.equal(getItemDef('mp_potion')?.rarity, 'common');
    assert.equal(getItemDef('battle_t1_head')?.itemCategory, 'armor');
    assert.equal(Object.prototype.hasOwnProperty.call(getItemDef('gem_flawed_ruby') ?? {}, 'buyPrice'), false);
    assert.equal(ITEMS.some((item) => item.itemCategory === 'armor' && item.slot === 'head'), true);
});

test('shop and original item data expose guarded equipment fields', () => {
    const crossbow = ORIGINAL_SHOP_ITEMS.find((item) => item.id === 'web_66_23');
    assert.ok(crossbow);
    assert.equal(crossbow.attackRange, 6);
    assert.equal(crossbow.stats?.hitRate, 10);
    assert.equal(crossbow.itemCategory, 'normal_weapon');

    const staff = ORIGINAL_SHOP_ITEMS.find((item) => item.id === 'web_69_08');
    assert.ok(staff);
    assert.equal(staff.magicRange, 1);

    const questBomb = getItemDef('quest_bomb');
    assert.ok(questBomb);
    assert.equal(getSellPrice(questBomb), 0);
    const oilCan = getItemDef('orig_story_ep16_oil_can');
    assert.ok(oilCan);
    assert.equal(oilCan.nameKr, '기름통');
    assert.equal(oilCan.itemCategory, 'material');
    assert.equal(oilCan.sellable, false);
    assert.match(oilCan.description ?? '', /SET_DUTY_STEP 16 4/);
    assert.equal(getSellPrice(oilCan), 0);
    const lamp = getItemDef('orig_story_ep17_lamp');
    assert.ok(lamp);
    assert.equal(lamp.nameKr, '등잔');
    assert.equal(lamp.itemCategory, 'material');
    assert.equal(lamp.sellable, false);
    assert.match(lamp.description ?? '', /SET_DUTY_STEP 16 2/);
    assert.equal(getSellPrice(lamp), 0);
    const burgosKey = getItemDef('quest_burgos_key');
    assert.ok(burgosKey);
    assert.equal(getSellPrice(burgosKey), 0);
    const cainNecklace = getItemDef('quest_cain_necklace');
    assert.ok(cainNecklace);
    assert.equal(getSellPrice(cainNecklace), 0);
    const originalHealPotion = getItemDef('orig_story_0300_heal_potion');
    assert.ok(originalHealPotion);
    assert.equal(originalHealPotion.nameKr, '힐포션');
    assert.equal(originalHealPotion.itemCategory, 'consumable');
    assert.deepEqual(originalHealPotion.iconSprite, { col: 82, row: 0 });
    assert.deepEqual(getCombatRecovery(originalHealPotion), { hp: 50, mp: 0 });
    assert.match(originalHealPotion.description ?? '', /GETITEM 300/);
    assert.match(originalHealPotion.descriptionKr ?? '', /발동마법 3001/);
    const originalMagicPotion = getItemDef('orig_story_0305_magic_potion');
    assert.ok(originalMagicPotion);
    assert.equal(originalMagicPotion.nameKr, '매직포션');
    assert.equal(originalMagicPotion.itemCategory, 'consumable');
    assert.deepEqual(originalMagicPotion.iconSprite, { col: 87, row: 0 });
    assert.deepEqual(getCombatRecovery(originalMagicPotion), { hp: 0, mp: 30 });
    assert.match(originalMagicPotion.description ?? '', /GETITEM 305/);
    assert.match(originalMagicPotion.descriptionKr ?? '', /발동마법 3201/);
    const starKnife = getItemDef('orig_story_0008_star_knife');
    assert.ok(starKnife);
    assert.equal(starKnife.itemCategory, 'normal_weapon');
    assert.equal(starKnife.slot, 'weapon');
    assert.equal(starKnife.sellable, false);
    assert.match(starKnife.description ?? '', /GETITEM 008/);
    assert.match(starKnife.descriptionKr ?? '', /GETITEM 008/);
    assert.equal(getSellPrice(starKnife), 0);
    for (const [itemId, originalItemId, nameKr, iconCol, expectedStats, expectedSellPrice] of [
        ['orig_story_0203_resist_fire_ring', 203, '레지스트파이어링', 61, undefined, 30000],
        ['orig_story_0204_resist_thunder_ring', 204, '레지스트썬더링', 62, undefined, 30000],
        ['orig_story_0207_illusion_ring', 207, '일루젼 링', 65, { evasion: 5 }, 2500],
        ['orig_story_0208_necklace', 208, '네크리스', 66, { magDef: 5 }, 2500],
    ] as const) {
        const originalAccessory = getItemDef(itemId);
        assert.ok(originalAccessory, `missing original accessory ${itemId}`);
        assert.equal(originalAccessory.nameKr, nameKr);
        assert.equal(originalAccessory.itemCategory, 'accessory');
        assert.equal(originalAccessory.slot, 'accessory');
        assert.deepEqual(originalAccessory.iconSprite, { col: iconCol, row: 0 });
        assert.equal(originalAccessory.maxDurability, 250);
        assert.deepEqual(originalAccessory.stats, expectedStats);
        assert.match(originalAccessory.description ?? '', new RegExp(`GETITEM ${originalItemId}`));
        assert.match(originalAccessory.descriptionKr ?? '', new RegExp(`GETITEM ${originalItemId}`));
        assert.equal(getSellPrice(originalAccessory), expectedSellPrice);
    }
    const assassinKnife = getItemDef('orig_story_0005_assassin_knife');
    assert.ok(assassinKnife);
    assert.equal(assassinKnife.nameKr, '어새신 나이프');
    assert.equal(assassinKnife.itemCategory, 'normal_weapon');
    assert.deepEqual(assassinKnife.iconSprite, { col: 5, row: 0 });
    assert.deepEqual(assassinKnife.stats, { atk: 45 });
    assert.equal(assassinKnife.maxDurability, 300);
    assert.equal(assassinKnife.attackRange, 1);
    assert.match(assassinKnife.description ?? '', /GETITEM 005/);
    assert.equal(getSellPrice(assassinKnife), 5750);
    const hermesShoes = getItemDef('orig_story_0261_hermes_shoes');
    assert.ok(hermesShoes);
    assert.equal(hermesShoes.nameKr, '엘메스의 구두');
    assert.equal(hermesShoes.itemCategory, 'armor');
    assert.equal(hermesShoes.slot, 'boots');
    assert.deepEqual(hermesShoes.iconSprite, { col: 80, row: 0 });
    assert.deepEqual(hermesShoes.stats, { def: -4 });
    assert.equal(hermesShoes.magicRange, -4);
    assert.equal(hermesShoes.maxDurability, 300);
    assert.match(hermesShoes.description ?? '', /GETITEM 261/);
    assert.equal(getSellPrice(hermesShoes), 13000);
    const dragonKiller6 = getItemDef('orig_story_0619_dragon_killer6');
    assert.ok(dragonKiller6);
    assert.equal(dragonKiller6.nameKr, '드래곤 킬러6');
    assert.equal(dragonKiller6.itemCategory, 'normal_weapon');
    assert.deepEqual(dragonKiller6.iconSprite, { col: 78, row: 1 });
    assert.deepEqual(dragonKiller6.stats, { atk: 100, hitRate: 10 });
    assert.equal(dragonKiller6.maxDurability, 3200);
    assert.equal(dragonKiller6.requiredLevel, 76);
    assert.match(dragonKiller6.description ?? '', /GETITEM 619/);
    assert.equal(getSellPrice(dragonKiller6), 400000);
    const lightRobe = getItemDef('orig_story_0180_light_robe');
    assert.ok(lightRobe);
    assert.equal(lightRobe.nameKr, '빛의 로브');
    assert.equal(lightRobe.itemCategory, 'armor');
    assert.equal(lightRobe.slot, 'body');
    assert.deepEqual(lightRobe.iconSprite, { col: 57, row: 0 });
    assert.deepEqual(lightRobe.stats, { def: 1 });
    assert.equal(lightRobe.magicRange, 1);
    assert.equal(lightRobe.maxDurability, 300);
    assert.match(lightRobe.description ?? '', /GETITEM 180/);
    assert.equal(getSellPrice(lightRobe), 45000);
    const dragonKiller7 = getItemDef('orig_story_0620_dragon_killer7');
    assert.ok(dragonKiller7);
    assert.equal(dragonKiller7.nameKr, '드래곤 킬러7');
    assert.equal(dragonKiller7.itemCategory, 'normal_weapon');
    assert.deepEqual(dragonKiller7.iconSprite, { col: 78, row: 1 });
    assert.deepEqual(dragonKiller7.stats, { atk: 125, hitRate: 10 });
    assert.equal(dragonKiller7.maxDurability, 4000);
    assert.equal(dragonKiller7.requiredLevel, 106);
    assert.match(dragonKiller7.description ?? '', /GETITEM 620/);
    assert.equal(getSellPrice(dragonKiller7), 500000);
    const windBoots = getItemDef('orig_story_0258_wind_boots');
    assert.ok(windBoots);
    assert.equal(windBoots.nameKr, '바람의 부츠');
    assert.equal(windBoots.itemCategory, 'armor');
    assert.equal(windBoots.slot, 'boots');
    assert.deepEqual(windBoots.iconSprite, { col: 77, row: 0 });
    assert.deepEqual(windBoots.stats, { def: 20 });
    assert.equal(windBoots.magicRange, 1);
    assert.equal(windBoots.requiredLevel, 106);
    assert.match(windBoots.description ?? '', /GETITEM 258/);
    assert.match(windBoots.descriptionKr ?? '', /발동마법 701/);
    assert.equal(getSellPrice(windBoots), 35000);
    const zambia6 = getItemDef('orig_story_0577_zambia6');
    assert.ok(zambia6);
    assert.equal(zambia6.nameKr, '잠비아6');
    assert.equal(zambia6.itemCategory, 'normal_weapon');
    assert.deepEqual(zambia6.iconSprite, { col: 71, row: 1 });
    assert.deepEqual(zambia6.stats, { atk: 120 });
    assert.equal(zambia6.maxDurability, 3200);
    assert.equal(zambia6.requiredLevel, 76);
    assert.match(zambia6.description ?? '', /GETITEM 577/);
    assert.equal(getSellPrice(zambia6), 175000);
    const shortBow = getItemDef('orig_story_0015_short_bow');
    assert.ok(shortBow);
    assert.equal(shortBow.nameKr, '쇼트보우');
    assert.equal(shortBow.itemCategory, 'normal_weapon');
    assert.deepEqual(shortBow.iconSprite, { col: 15, row: 0 });
    assert.deepEqual(shortBow.stats, { atk: 35 });
    assert.equal(shortBow.attackRange, 5);
    assert.equal(shortBow.maxDurability, 300);
    assert.match(shortBow.description ?? '', /GETITEM 015/);
    assert.equal(getSellPrice(shortBow), 6000);
    const iceShield = getItemDef('orig_story_0110_ice_shield');
    assert.ok(iceShield);
    assert.equal(iceShield.nameKr, '아이스 실드');
    assert.equal(iceShield.itemCategory, 'armor');
    assert.equal(iceShield.slot, 'shield');
    assert.deepEqual(iceShield.iconSprite, { col: 37, row: 0 });
    assert.deepEqual(iceShield.stats, { def: 20 });
    assert.equal(iceShield.magicRange, 2);
    assert.match(iceShield.description ?? '', /GETITEM 110/);
    assert.equal(getSellPrice(iceShield), 25000);
    const crystalMail6 = getItemDef('orig_story_0854_crystal_mail6');
    assert.ok(crystalMail6);
    assert.equal(crystalMail6.nameKr, '크리스탈 메일6');
    assert.equal(crystalMail6.itemCategory, 'armor');
    assert.equal(crystalMail6.slot, 'body');
    assert.deepEqual(crystalMail6.iconSprite, { col: 63, row: 2 });
    assert.deepEqual(crystalMail6.stats, { def: 30, evasion: 10 });
    assert.equal(crystalMail6.maxDurability, 900);
    assert.equal(crystalMail6.requiredLevel, 76);
    assert.match(crystalMail6.description ?? '', /GETITEM 854/);
    assert.equal(getSellPrice(crystalMail6), 50000);
    const zambia7 = getItemDef('orig_story_0578_zambia7');
    assert.ok(zambia7);
    assert.equal(zambia7.nameKr, '잠비아7');
    assert.equal(zambia7.itemCategory, 'normal_weapon');
    assert.deepEqual(zambia7.iconSprite, { col: 71, row: 1 });
    assert.deepEqual(zambia7.stats, { atk: 155 });
    assert.equal(zambia7.maxDurability, 4000);
    assert.equal(zambia7.requiredLevel, 106);
    assert.match(zambia7.description ?? '', /GETITEM 578/);
    assert.equal(getSellPrice(zambia7), 250000);
    const crown = getItemDef('orig_story_0148_crown');
    assert.ok(crown);
    assert.equal(crown.nameKr, '크라운');
    assert.equal(crown.itemCategory, 'armor');
    assert.equal(crown.slot, 'head');
    assert.deepEqual(crown.iconSprite, { col: 45, row: 0 });
    assert.deepEqual(crown.stats, { def: 3, magDef: 3 });
    assert.equal(crown.magicRange, 3);
    assert.match(crown.description ?? '', /GETITEM 148/);
    assert.equal(getSellPrice(crown), 45000);
    const levitationBoots = getItemDef('orig_story_0262_levitation_boots');
    assert.ok(levitationBoots);
    assert.equal(levitationBoots.nameKr, '레비테이션 부츠');
    assert.equal(levitationBoots.itemCategory, 'armor');
    assert.equal(levitationBoots.slot, 'boots');
    assert.deepEqual(levitationBoots.iconSprite, { col: 81, row: 0 });
    assert.deepEqual(levitationBoots.stats, { def: 1 });
    assert.equal(levitationBoots.magicRange, 1);
    assert.match(levitationBoots.description ?? '', /GETITEM 262/);
    assert.equal(getSellPrice(levitationBoots), 30000);
    const flailSaber7 = getItemDef('orig_story_0632_flail_saber7');
    assert.ok(flailSaber7);
    assert.equal(flailSaber7.nameKr, '플레일 세이버7');
    assert.equal(flailSaber7.itemCategory, 'normal_weapon');
    assert.deepEqual(flailSaber7.iconSprite, { col: 13, row: 0 });
    assert.deepEqual(flailSaber7.stats, { atk: 140, hitRate: 20 });
    assert.equal(flailSaber7.maxDurability, 4000);
    assert.equal(flailSaber7.requiredLevel, 106);
    assert.match(flailSaber7.description ?? '', /GETITEM 632/);
    assert.equal(getSellPrice(flailSaber7), 300000);
    const crystalMail7 = getItemDef('orig_story_0855_crystal_mail7');
    assert.ok(crystalMail7);
    assert.equal(crystalMail7.nameKr, '크리스탈 메일7');
    assert.equal(crystalMail7.itemCategory, 'armor');
    assert.equal(crystalMail7.slot, 'body');
    assert.deepEqual(crystalMail7.iconSprite, { col: 63, row: 2 });
    assert.deepEqual(crystalMail7.stats, { def: 37, evasion: 10 });
    assert.equal(crystalMail7.maxDurability, 1000);
    assert.equal(crystalMail7.requiredLevel, 106);
    assert.match(crystalMail7.description ?? '', /GETITEM 855/);
    assert.equal(getSellPrice(crystalMail7), 75000);
    const jackKnife = getItemDef('orig_story_0010_jack_knife');
    assert.ok(jackKnife);
    assert.equal(jackKnife.nameKr, '잭 나이프');
    assert.equal(jackKnife.itemCategory, 'normal_weapon');
    assert.deepEqual(jackKnife.iconSprite, { col: 10, row: 0 });
    assert.deepEqual(jackKnife.stats, { atk: 55 });
    assert.equal(jackKnife.requiredLevel, 6);
    assert.match(jackKnife.description ?? '', /GETITEM 010/);
    assert.equal(getSellPrice(jackKnife), 7500);
    const powerStaff = getItemDef('orig_story_0018_power_staff');
    assert.ok(powerStaff);
    assert.equal(powerStaff.nameKr, '힘의 지팡이');
    assert.equal(powerStaff.itemCategory, 'normal_weapon');
    assert.deepEqual(powerStaff.iconSprite, { col: 18, row: 0 });
    assert.deepEqual(powerStaff.stats, { atk: 30 });
    assert.match(powerStaff.descriptionKr ?? '', /발동마법 2101/);
    assert.equal(getSellPrice(powerStaff), 125000);
    const longinus = getItemDef('orig_story_0974_longinus');
    assert.ok(longinus);
    assert.equal(longinus.nameKr, '롱기누스');
    assert.equal(longinus.itemCategory, 'normal_weapon');
    assert.deepEqual(longinus.iconSprite, { col: 49, row: 3 });
    assert.deepEqual(longinus.stats, { atk: 220 });
    assert.equal(longinus.attackRange, 2);
    assert.equal(longinus.requiredLevel, 500);
    assert.match(longinus.description ?? '', /GETITEM 974/);
    assert.equal(getSellPrice(longinus), 0);
    const earthArmageddon = getItemDef('orig_story_1037_earth_armageddon');
    assert.ok(earthArmageddon);
    assert.equal(earthArmageddon.nameKr, '어스아마게돈');
    assert.equal(earthArmageddon.itemCategory, 'normal_weapon');
    assert.deepEqual(earthArmageddon.iconSprite, { col: 12, row: 4 });
    assert.deepEqual(earthArmageddon.stats, { atk: 200, magAtk: 40, magDef: 150 });
    assert.match(earthArmageddon.descriptionKr ?? '', /발동마법 906/);
    assert.equal(getSellPrice(earthArmageddon), 0);
    const valkyrie = getItemDef('orig_story_0995_valkyrie');
    assert.ok(valkyrie);
    assert.equal(valkyrie.nameKr, '발키리');
    assert.equal(valkyrie.itemCategory, 'armor');
    assert.deepEqual(valkyrie.iconSprite, { col: 70, row: 3 });
    assert.deepEqual(valkyrie.stats, { def: 60 });
    assert.equal(valkyrie.maxDurability, 2000);
    assert.match(valkyrie.description ?? '', /GETITEM 995/);
    assert.equal(getSellPrice(valkyrie), 0);
    const bernium = getItemDef('orig_story_0990_bernium');
    assert.ok(bernium);
    assert.equal(bernium.nameKr, '베르니움');
    assert.deepEqual(bernium.iconSprite, { col: 65, row: 3 });
    assert.deepEqual(bernium.stats, { def: 65, magAtk: 15 });
    assert.equal(bernium.magicRange, 10);
    assert.match(bernium.description ?? '', /GETITEM 990/);
    assert.equal(getSellPrice(bernium), 0);
    const enigmaBlade = getItemDef('orig_story_0970_enigma_blade');
    assert.ok(enigmaBlade);
    assert.equal(enigmaBlade.nameKr, '이니그마 블레이드');
    assert.deepEqual(enigmaBlade.iconSprite, { col: 45, row: 3 });
    assert.deepEqual(enigmaBlade.stats, { atk: 210 });
    assert.match(enigmaBlade.descriptionKr ?? '', /발동마법 10405/);
    assert.equal(getSellPrice(enigmaBlade), 0);
    const discovery = getItemDef('orig_story_1035_discovery');
    assert.ok(discovery);
    assert.equal(discovery.nameKr, '디스커버리');
    assert.deepEqual(discovery.iconSprite, { col: 10, row: 4 });
    assert.deepEqual(discovery.stats, { atk: 150, def: 30, magAtk: 40, magDef: 100, evasion: 5 });
    assert.match(discovery.descriptionKr ?? '', /발동마법 2506/);
    assert.equal(getSellPrice(discovery), 0);
    const excalibur = getItemDef('orig_story_0969_excalibur');
    assert.ok(excalibur);
    assert.equal(excalibur.nameKr, '엑스칼리버');
    assert.deepEqual(excalibur.iconSprite, { col: 44, row: 3 });
    assert.deepEqual(excalibur.stats, { atk: 220 });
    assert.match(excalibur.description ?? '', /GETITEM 969/);
    assert.equal(getSellPrice(excalibur), 0);
    const grCarium = getItemDef('orig_story_1015_gr_carium');
    assert.ok(grCarium);
    assert.equal(grCarium.nameKr, 'GR.캐리엄');
    assert.equal(grCarium.slot, 'boots');
    assert.deepEqual(grCarium.iconSprite, { col: 90, row: 3 });
    assert.deepEqual(grCarium.stats, { def: 40 });
    assert.match(grCarium.descriptionKr ?? '', /발동마법 11003/);
    assert.equal(getSellPrice(grCarium), 0);
    const arondight = getItemDef('orig_story_1000_arondight');
    assert.ok(arondight);
    assert.equal(arondight.nameKr, '아론다이트');
    assert.deepEqual(arondight.iconSprite, { col: 75, row: 3 });
    assert.deepEqual(arondight.stats, { def: 70, magAtk: 30, magDef: 20 });
    assert.match(arondight.description ?? '', /GETITEM 1000/);
    assert.equal(getSellPrice(arondight), 0);
    const chaosLinger = getItemDef('orig_story_0975_chaos_linger');
    assert.ok(chaosLinger);
    assert.equal(chaosLinger.nameKr, '카오스링거');
    assert.deepEqual(chaosLinger.iconSprite, { col: 50, row: 3 });
    assert.deepEqual(chaosLinger.stats, { atk: 230 });
    assert.equal(chaosLinger.attackRange, 2);
    assert.match(chaosLinger.descriptionKr ?? '', /발동마법 906/);
    assert.equal(getSellPrice(chaosLinger), 0);
    for (const [itemId, originalItemId] of [
        ['orig_story_0315_stone_snake', 315],
        ['orig_story_0397_yellow_flower', 397],
    ] as const) {
        const originalScenarioItem = getItemDef(itemId);
        assert.ok(originalScenarioItem, `missing original scenario item ${itemId}`);
        assert.equal(originalScenarioItem.itemCategory, 'material');
        assert.equal(originalScenarioItem.sellable, false);
        assert.match(originalScenarioItem.description ?? '', new RegExp(`GETITEM ${originalItemId}`));
        assert.match(originalScenarioItem.descriptionKr ?? '', new RegExp(`GETITEM ${originalItemId}`));
        assert.equal(getSellPrice(originalScenarioItem), 0);
    }
    for (const originalItemId of [386, 387, 388, 389]) {
        const shard = getItemDef(`orig_ep19_shard_0${originalItemId}`);
        assert.ok(shard, `missing episode 19 shard ${originalItemId}`);
        assert.equal(shard.itemCategory, 'material');
        assert.equal(shard.sellable, false);
        assert.match(shard.description ?? '', new RegExp(`GETITEM ${originalItemId}`));
        assert.match(shard.descriptionKr ?? '', new RegExp(`GETITEM ${originalItemId}`));
        assert.equal(getSellPrice(shard), 0);
    }

    for (const inventory of Object.values(SHOP_INVENTORY_BY_TOWN_FACILITY)) {
        for (const entries of Object.values(inventory)) {
            for (const entry of entries ?? []) {
                assert.ok(getItemDef(entry.itemId), `missing item ${entry.itemId}`);
            }
        }
    }

    assert.equal(getShopItems('master_sanctum', 'shrine').some(({ item }) => item.slot === 'gem'), true);
    assert.equal(getShopItems('master_sanctum', 'specialty_trader').some(({ item }) => item.slot === 'gem'), false);
});

test('late original story reward item ledger covers every GETITEM cache event', () => {
    const seenOriginalItemIds = new Set<number>();
    const factCacheSourceKeys = new Set<string>();

    for (let episode = 23; episode <= 31; episode++) {
        for (const cacheEvent of getOriginalLateStoryCacheEvents(episode)) {
            const item = getOriginalLateStoryItem(cacheEvent.originalItemId);
            assert.ok(item, `missing late original item ${cacheEvent.originalItemId}`);
            assert.equal(item.currentItemId, cacheEvent.itemId);
            assert.ok(getItemDef(item.currentItemId), `missing mapped current item ${item.currentItemId}`);
            assert.equal(item.sourceEvents.some((source) => source.episode === episode && source.eventNumber === cacheEvent.eventNumber), true);
            seenOriginalItemIds.add(cacheEvent.originalItemId);
            factCacheSourceKeys.add(`${episode}:${cacheEvent.eventNumber}:${cacheEvent.originalItemId}`);
        }
    }

    const ledgerIds = getOriginalLateStoryItemIds();
    assert.equal(new Set(ledgerIds).size, ledgerIds.length, 'late original item ids must be unique');
    assert.equal(
        new Set(ORIGINAL_LATE_STORY_ITEMS.map((item) => item.currentItemId)).size,
        ORIGINAL_LATE_STORY_ITEMS.length,
        'late current item ids must be unique'
    );
    const sourceKeys = new Set<string>();
    const expectedItemCategoryBySlot = new Map([
        ['weapon', 'normal_weapon'],
        ['accessory', 'accessory'],
        ['accessory2', 'accessory'],
        ['material', 'material'],
        ['rune', 'rune'],
        ['gem', 'gem'],
        ['consumable', 'consumable'],
    ]);
    for (const item of ORIGINAL_LATE_STORY_ITEMS) {
        assert.match(item.currentItemId, /^orig_late_\d{4}$/);
        const itemDef = getItemDef(item.currentItemId);
        assert.ok(itemDef, `missing mapped current item ${item.currentItemId}`);
        assert.equal(itemDef.nameKr, item.originalNameKr);
        assert.deepEqual(itemDef.stats, item.stats);
        assert.equal(itemDef.requiredLevel, item.requiredLevel);
        assert.equal(itemDef.slot, item.slot);
        assert.equal(itemDef.gridW, item.gridW);
        assert.equal(itemDef.gridH, item.gridH);
        assert.equal(itemDef.color, item.color);
        assert.equal(itemDef.icon, item.icon);
        assert.deepEqual(itemDef.iconSprite, item.iconSprite);
        assert.equal(itemDef.maxDurability, item.maxDurability);
        assert.equal(itemDef.attackRange, item.attackRange);
        assert.equal(itemDef.magicRange, item.magicRange);
        assert.equal(itemDef.rarity, 'unique');
        assert.equal(itemDef.itemCategory, expectedItemCategoryBySlot.get(item.slot) ?? 'armor');
        assert.match(itemDef.descriptionKr ?? '', new RegExp(`원작 GETITEM ${item.originalItemId}`));
        assert.match(itemDef.description, new RegExp(`원작 GETITEM ${item.originalItemId}`));
        if (item.rewardKind === 'mark') assert.equal(itemDef.sellable, false);
        for (const source of item.sourceEvents) {
            const fact = getOriginalLateStoryFact(source.episode);
            assert.equal(source.dungeonId, fact.dungeonId, `late item ${item.originalItemId} source dungeon`);
            assert.equal(source.setArc, fact.setArc, `late item ${item.originalItemId} source set arc`);
            assert.equal(source.eventMember, fact.eventMember, `late item ${item.originalItemId} source event member`);
            assert.match(itemDef.descriptionKr ?? '', new RegExp(`${source.eventMember} EVENT ${source.eventNumber}`));
            assert.match(itemDef.description ?? '', new RegExp(`${source.eventMember} EVENT ${source.eventNumber}`));
            assert.match(source.setArc, /^MAP\/\d{2}set\.arc$/);
            assert.match(source.eventMember, /^\d{2}\.evt$/);
            const sourceKey = `${source.episode}:${source.eventNumber}:${item.originalItemId}`;
            sourceKeys.add(sourceKey);
            if (source.eventNumber === 99) {
                assert.equal(
                    getOriginalLateStoryItemsForSourceEvent(source.episode, 99).some((candidate) => candidate.originalItemId === item.originalItemId),
                    true,
                    `late boss EVENT 99 source must resolve ${sourceKey}`
                );
            } else {
                assert.equal(factCacheSourceKeys.has(sourceKey), true, `late item source must match a source fact cache event ${sourceKey}`);
            }
        }
    }
    assert.deepEqual(
        [...factCacheSourceKeys].sort((left, right) => left.localeCompare(right)),
        [...sourceKeys].filter((key) => !key.includes(':99:')).sort((left, right) => left.localeCompare(right))
    );
    for (const originalItemId of seenOriginalItemIds) assert.equal(ledgerIds.includes(originalItemId), true);
    assert.equal(getOriginalLateStoryItemsForSourceEvent(23, 99).map((item) => item.originalItemId).join(','), '984');
    assert.equal(getOriginalLateStoryItemsForSourceEvent(24, 99).map((item) => item.originalItemId).join(','), '976');
    assert.equal(getOriginalLateStoryItemsForSourceEvent(25, 99).length, 0);
    assert.equal(ORIGINAL_LATE_STORY_ITEMS.length, 30);
    assert.equal(ORIGINAL_LATE_STORY_REWARD_ITEMS.length, ORIGINAL_LATE_STORY_ITEMS.length);
    assert.equal(getItemDef('orig_late_1122')?.nameKr, '레지넨');
    assert.deepEqual(getItemDef('orig_late_1122')?.stats, { def: 45, evasion: 5 });
    assert.equal(getItemDef('orig_late_1122')?.slot, 'boots');
    assert.equal(getItemDef('orig_late_1168')?.sellable, false);
    assert.equal(sourceKeys.size, 31);
});

test('late original story source ledgers cover exactly episodes 23 through 31', () => {
    const expectedEpisodes = Array.from({ length: 9 }, (_, index) => index + 23);

    assert.deepEqual(
        Object.keys(ORIGINAL_LATE_STORY_FACTS).map(Number).sort((a, b) => a - b),
        expectedEpisodes
    );
    assert.deepEqual(
        Object.keys(ORIGINAL_LATE_STORY_MRC_FACTS).map(Number).sort((a, b) => a - b),
        expectedEpisodes
    );

    for (const episode of expectedEpisodes) {
        const episodeKey = String(episode);
        const paddedEpisode = episodeKey.padStart(2, '0');
        const fact = getOriginalLateStoryFact(episode);
        const mrcFact = ORIGINAL_LATE_STORY_MRC_FACTS[episodeKey];
        const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
        const sequence = STORY_SCENARIO_EVENT_SEQUENCES.find((entry) => entry.dungeonId === fact.dungeonId);
        const layout = getStoryInteriorLayout(fact.dungeonId);

        assert.ok(scenario, `missing story scenario ${episode}`);
        assert.ok(sequence, `missing story sequence ${episode}`);
        assert.ok(layout, `missing story layout ${episode}`);
        assert.equal(scenario.dungeonId, fact.dungeonId, `episode ${episode} dungeon id`);
        assert.equal(scenario.missionKind, 'soloInterior', `episode ${episode} mission kind`);
        assert.equal(scenario.guardCount, fact.guardAreas.length, `episode ${episode} guard count`);
        assert.equal(layout.originalAi?.source, `${fact.setArc}:${fact.aiMember}`, `episode ${episode} original AI source`);
        assert.deepEqual(layout.originalAi?.bossArea, fact.bossArea, `episode ${episode} original boss AI area`);
        assert.deepEqual(layout.originalAi?.guardAreas, fact.guardAreas, `episode ${episode} original guard AI areas`);
        assert.deepEqual(layout.originalAi?.staging, fact.staging, `episode ${episode} original staging positions`);
        assert.equal(mrcFact.source, `MAP/${paddedEpisode}.mrc`, `episode ${episode} source mrc`);
        assert.equal(mrcFact.translatedSource, `MAP/${paddedEpisode}t.mrc`, `episode ${episode} translated mrc`);
        assert.equal(sequence.originalSources.sceneScript, `Wlib/scene${episode}.lsc`, `episode ${episode} sequence script`);
        for (const sourceFile of [
            mrcFact.source,
            mrcFact.translatedSource,
            `MAP/${paddedEpisode}hmap.bmp`,
            fact.setArc,
        ]) {
            assert.equal(sequence.originalSources.mapFiles.includes(sourceFile), true, `episode ${episode} sequence source ${sourceFile}`);
        }
    }
});

test('rest, monster, and starting class data reject unknown ids', () => {
    assert.equal(Object.prototype.hasOwnProperty.call(REST_FACILITIES, 'central_castel'), false);
    assert.ok(getRestFacility('central_castle'));
    assert.equal(getRestFacility('e_outpost'), null);
    assert.equal(getRestFacility('__missing__'), null);

    assert.equal(isMonsterId('302R'), true);
    assert.equal(isMonsterId('__missing__'), false);
    assert.equal(getMonsterDefinitionSafe('302R')?.id, '302R');
    assert.equal(getMonsterDefinitionSafe('__missing__'), null);

    assert.deepEqual(CHAR_CLASSES.map((cfg) => cfg.id), ['infantry', 'cavalry', 'cleric', 'mage']);
    assert.ok(getStoryCompanionRewards().some((reward) => reward.classId === 'shrine'));
    assert.ok(getStoryCompanionRewards().some((reward) => reward.classId === 'alchemist'));
});

test('original monster ledger stays separate from renderable spawn catalog', () => {
    assert.equal(ORIGINAL_MONSTER_COUNT, 451);
    assert.equal(isOriginalMonsterId('302R'), true);
    assert.equal(isOriginalMonsterId(302), true);
    assert.equal(isOriginalMonsterId('__missing__'), false);

    const originalSkeleton = getOriginalMonsterRow('302R');
    assert.ok(originalSkeleton);
    assert.equal(originalSkeleton.combat.hpLo, 135);
    assert.equal(originalSkeleton.combat.atkLo, 105);
    assert.equal(originalSkeleton.combat.defLo, 42);

    assert.deepEqual([...RESERVED_RENDERABLE_MONSTER_IDS], ['206R', '791R']);
    const authoredSpawnIds = new Set<string>([...GENERAL_MONSTER_IDS, ...NEW_MONSTER_IDS]);
    for (const id of RESERVED_RENDERABLE_MONSTER_IDS) {
        assert.equal(isMonsterId(id), true);
        assert.ok(getMonsterDefinitionSafe(id));
        assert.equal(authoredSpawnIds.has(id), false);
    }
    for (const id of FINAL_STORY_MONSTER_IDS) {
        assert.equal(isMonsterId(id), true);
        assert.ok(getMonsterDefinitionSafe(id));
        assert.equal(authoredSpawnIds.has(id), false);
        assert.ok(getOriginalMonsterRow(id));
    }

    assert.ok(getOriginalMonsterRow('206R'));
    assert.ok(getOriginalMonsterRow('791R'));
    assert.equal(getOriginalMonsterRow('634R'), null);
});

test('story episodes 1 through 31 are chained and fully localized', () => {
    assert.deepEqual(STORY_SCENARIOS.map((scenario) => scenario.episode), Array.from({ length: 31 }, (_, i) => i + 1));
    assert.equal(STORY_QUESTS.length, 31);
    assert.deepEqual(
        STORY_SCENARIOS.filter((scenario) => scenario.missionKind === 'soloInterior').map((scenario) => scenario.episode),
        [1, 2, 3, 7, 13, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]
    );
    assert.deepEqual(
        STORY_SCENARIOS.filter((scenario) => scenario.missionKind === 'vehicle').map((scenario) => scenario.episode),
        [17]
    );
    assert.deepEqual(
        STORY_INTERIOR_LAYOUTS.map((layout) => layout.dungeonId).sort(),
        STORY_SCENARIOS.filter((scenario) => scenario.missionKind === 'soloInterior').map((scenario) => scenario.dungeonId).sort()
    );
    assert.equal(STORY_SCENARIO_EVENT_SEQUENCES.length, STORY_SCENARIOS.length);
    assert.deepEqual(
        STORY_SCENARIO_EVENT_SEQUENCES.map((sequence) => sequence.dungeonId).sort(),
        STORY_SCENARIOS.map((scenario) => scenario.dungeonId).sort()
    );
    assert.equal(new Set(STORY_SCENARIO_EVENT_SEQUENCES.map((sequence) => sequence.dungeonId)).size, STORY_SCENARIO_EVENT_SEQUENCES.length);
    for (const scenario of STORY_SCENARIOS) {
        const sequence = STORY_SCENARIO_EVENT_SEQUENCES.find((entry) => entry.dungeonId === scenario.dungeonId);
        assert.ok(sequence, `missing event sequence for episode ${scenario.episode}`);
        const episode = String(scenario.episode).padStart(2, '0');
        assert.equal(sequence.originalSources.sceneScript, `Wlib/scene${scenario.episode}.lsc`);
        assert.equal(sequence.originalSources.mapFiles.includes(`MAP/${episode}.mrc`), true, `missing MAP/${episode}.mrc`);
        assert.equal(sequence.originalSources.mapFiles.includes(`MAP/${episode}set.arc`), true, `missing MAP/${episode}set.arc`);
        if (sequence.originalSources.globalScript !== 'missing') {
            assert.equal(sequence.originalSources.globalScript, `Glib/gscene${scenario.episode}.lsc`);
        }
    }

    const ko = i18n.strings.ko as Record<string, string>;
    const en = i18n.strings.en as Record<string, string>;
    for (const [index, quest] of STORY_QUESTS.entries()) {
        assert.equal(quest.episode, index + 1);
        assert.equal(quest.prerequisiteQuestId, index === 0 ? undefined : STORY_QUESTS[index - 1].id);
        assert.ok(quest.bgmKey, `missing story bgm key for episode ${quest.episode}`);
        const bgm = AUDIO_CATALOG[quest.bgmKey];
        assert.equal(bgm?.channel, 'bgm', `missing playable story bgm catalog entry ${quest.bgmKey}`);
        assert.equal(
            existsSync(join(process.cwd(), 'public', bgm.src.replace(/^\//, ''))),
            true,
            `missing playable story bgm asset ${bgm.src}`
        );
        for (const key of [
            quest.titleKey,
            quest.summaryKey,
            quest.objectiveKey,
            quest.recommendedLevelKey,
            quest.enterLogKey,
            quest.objectiveCompleteLogKey,
        ].filter((key): key is string => Boolean(key))) {
            assert.ok(ko[key], `missing ko story key ${key}`);
            assert.ok(en[key], `missing en story key ${key}`);
        }
    }
    assert.ok(ko['story.ep01.sideObjective.cainNecklace']);
    assert.ok(en['story.ep01.sideObjective.cainNecklace']);
});

test('story scenario content ledger matches runtime scenario definitions', () => {
    const contentPath = fileURLToPath(new URL('../../src/data/content/story-scenarios.json', import.meta.url));
    const contentScenarios = JSON.parse(readFileSync(contentPath, 'utf8')) as StoryScenarioContentRecord[];
    assert.deepEqual(
        contentScenarios.map((scenario) => ({
            episode: scenario.episode,
            questId: scenario.questId,
            dungeonId: scenario.dungeonId,
            guardCount: scenario.guardCount,
            missionKind: scenario.missionKind,
        })),
        STORY_SCENARIOS.map((scenario) => ({
            episode: scenario.episode,
            questId: scenario.questId,
            dungeonId: scenario.dungeonId,
            guardCount: scenario.guardCount,
            missionKind: scenario.missionKind,
        }))
    );
});

test('story scenario event source references stay inside their declared original source files', () => {
    for (const sequence of STORY_SCENARIO_EVENT_SEQUENCES) {
        const declaredMapFiles = new Set(sequence.originalSources.mapFiles);
        const declaredSetMembers = sequence.originalSources.setArcMembers
            ? new Set(sequence.originalSources.setArcMembers.map((member) => member.toLowerCase()))
            : null;
        const sourcedEvents = [
            ...sequence.fieldEvents,
            ...(sequence.enemyDefeatEvents ?? []),
            ...(sequence.bossDefeatEvent ? [sequence.bossDefeatEvent] : []),
        ];

        for (const event of sourcedEvents) {
            const [sourceFile, sourceMember] = event.originalSource.split(':');
            assert.ok(sourceFile, `${sequence.dungeonId} ${event.id} original source file`);
            assert.ok(sourceMember, `${sequence.dungeonId} ${event.id} original source member`);
            assert.equal(declaredMapFiles.has(sourceFile), true, `${sequence.dungeonId} ${event.id} undeclared source file ${sourceFile}`);
            if (declaredSetMembers) {
                assert.equal(
                    declaredSetMembers.has(sourceMember.toLowerCase()),
                    true,
                    `${sequence.dungeonId} ${event.id} undeclared source member ${sourceMember}`
                );
            }
            assert.match(event.originalEventId, /^EVENT \d+(?:\/\d+)*$/, `${sequence.dungeonId} ${event.id} original event id`);
        }
    }
});

test('story scenario item rewards preserve their original GETITEM ids', () => {
    for (const sequence of STORY_SCENARIO_EVENT_SEQUENCES) {
        const rewardedEvents = [
            ...sequence.fieldEvents,
            ...(sequence.bossDefeatEvent ? [sequence.bossDefeatEvent] : []),
        ];
        for (const event of rewardedEvents) {
            for (const reward of event.rewards ?? []) {
                if (reward.type !== 'item') continue;
                const itemDef = getItemDef(reward.itemId);
                assert.ok(itemDef, `${sequence.dungeonId} ${event.id} missing reward item ${reward.itemId}`);
                if (reward.originalItemId === undefined || reward.originalItemId <= 0) continue;

                const originalItemPattern = new RegExp(`GETITEM 0*${reward.originalItemId}\\b`);
                assert.match(event.trigger, originalItemPattern, `${sequence.dungeonId} ${event.id} reward trigger GETITEM`);
                assert.match(itemDef.description ?? '', originalItemPattern, `${sequence.dungeonId} ${event.id} reward item description`);
                assert.match(itemDef.descriptionKr ?? '', originalItemPattern, `${sequence.dungeonId} ${event.id} reward item Korean description`);
            }
        }
    }
});

test('story scenario field events stay presentable and replay-safe', () => {
    for (const sequence of STORY_SCENARIO_EVENT_SEQUENCES) {
        assert.ok(sequence.entry.length > 0, `${sequence.dungeonId} entry presentation`);
        assert.ok(sequence.bossDefeat.length > 0, `${sequence.dungeonId} boss defeat presentation`);

        const fieldEventIds = new Set<string>();
        const runtimeFlags = new Set<string>();
        if (sequence.objectiveRuntimeFlag) runtimeFlags.add(sequence.objectiveRuntimeFlag);
        if (sequence.bossDefeatEvent?.runtimeFlag) runtimeFlags.add(sequence.bossDefeatEvent.runtimeFlag);

        for (const event of sequence.fieldEvents) {
            assert.equal(fieldEventIds.has(event.id), false, `${sequence.dungeonId} duplicate field event ${event.id}`);
            fieldEventIds.add(event.id);
            if (event.runtimeFlag) runtimeFlags.add(event.runtimeFlag);

            assert.ok(event.triggerTiles.length > 0, `${sequence.dungeonId} ${event.id} trigger tiles`);
            assert.ok(event.steps.length > 0, `${sequence.dungeonId} ${event.id} presentation steps`);
            for (const tile of event.triggerTiles) {
                assert.equal(Number.isInteger(tile.x), true, `${sequence.dungeonId} ${event.id} trigger tile x`);
                assert.equal(Number.isInteger(tile.y), true, `${sequence.dungeonId} ${event.id} trigger tile y`);
                assert.ok(tile.x >= 0, `${sequence.dungeonId} ${event.id} trigger tile x bounds`);
                assert.ok(tile.y >= 0, `${sequence.dungeonId} ${event.id} trigger tile y bounds`);
            }

            const hasPersistentReward = Boolean(event.questItemId || event.rewards?.length);
            if (hasPersistentReward) {
                assert.ok(event.runtimeFlag, `${sequence.dungeonId} ${event.id} reward runtime flag`);
                assert.ok(event.markerLabelKey, `${sequence.dungeonId} ${event.id} reward marker label`);
            }
            for (const reward of event.rewards ?? []) {
                if (reward.type === 'gold') {
                    assert.ok(Number.isInteger(reward.amount), `${sequence.dungeonId} ${event.id} gold reward integer`);
                    assert.ok(reward.amount > 0, `${sequence.dungeonId} ${event.id} gold reward positive`);
                }
            }
        }

        for (const event of sequence.enemyDefeatEvents ?? []) {
            assert.ok(event.steps.length > 0, `${sequence.dungeonId} ${event.id} presentation steps`);
        }
        for (const marker of sequence.markers ?? []) {
            if (marker.hideWhenRuntimeFlag) {
                assert.equal(
                    runtimeFlags.has(marker.hideWhenRuntimeFlag),
                    true,
                    `${sequence.dungeonId} ${marker.id} hide flag ${marker.hideWhenRuntimeFlag}`
                );
            }
        }
    }
});

test('player data guards gold and normalizes old save shapes', () => {
    const previousStorage = globalThis.localStorage;
    const store = new Map<string, string>();
    globalThis.localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() { return store.size; },
    };

    try {
        const player = new PlayerData();
        player.addGold(-100);
        player.addGold(Number.NaN);
        assert.equal(player.gold, 500);
        assert.equal(player.spendGold(-100), false);
        assert.equal(player.gold, 500);
        assert.equal(player.spendGold(25.9), true);
        assert.equal(player.gold, 475);

        store.set('sin_eater_save', JSON.stringify({
            gold: -10,
            clearedStages: ['stage-a', 42],
            questItems: ['quest_bomb', null],
            storyCompanions: ['story_cleric_ep02', null],
            inventory: [
                { uid: 'u1', itemId: 'short_sword', gridX: 1.8, gridY: Number.NaN },
                { uid: 'bad' },
            ],
            equipped: {
                weapon: { uid: 'w1', itemId: 'short_sword', gridX: 0, gridY: 0, sockets: ['rune_el', 5] },
            },
            lastSaved: '',
        }));

        const loaded = new PlayerData();
        loaded.load();
        assert.equal(loaded.gold, 0);
        assert.deepEqual([...loaded.clearedStages], ['stage-a']);
        assert.equal(loaded.hasQuestItem('quest_bomb'), true);
        assert.equal(loaded.hasStoryCompanion('story_cleric_ep02'), true);
        assert.equal(loaded.inventory.length, 1);
        assert.deepEqual(loaded.inventory[0].sockets, []);
        assert.deepEqual(loaded.equipped.weapon?.sockets, ['rune_el']);
        assert.equal(Object.prototype.hasOwnProperty.call(loaded.equipped, 'accessory2'), true);
    } finally {
        globalThis.localStorage = previousStorage;
    }
});

test('player data writes and loads a canonical character save snapshot', () => {
    const previousStorage = globalThis.localStorage;
    const store = new Map<string, string>();
    globalThis.localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() { return store.size; },
    };

    try {
        const player = new PlayerData();
        player.gold = 777;
        player.currentHubTownId = 's_coast_town';
        player.pendingRestMenuId = 'hearty_breakfast';
        player.inventory = [{
            uid: 'bag-1',
            itemId: 'short_sword',
            gridX: 2,
            gridY: 3,
            durability: 4,
            quantity: 1,
            acquiredInRaid: true,
            sockets: ['rune_el'],
        }];
        player.save();

        const raw = JSON.parse(store.get('sin_eater_save') ?? '{}') as Record<string, unknown>;
        assert.equal(Object.prototype.hasOwnProperty.call(raw, 'inventory'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(raw, 'equipped'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(raw, 'marketState'), false);
        const save = asRecord(raw.characterSave);
        assert.equal(asRecord(save.questState).gold, 777);
        assert.equal(asRecord(save.hubLocation).townId, 's_coast_town');
        const inventory = asRecord(save.inventory);
        const savedItem = asRecord((inventory.items as unknown[])[0]);
        assert.equal(savedItem.uid, 'bag-1');
        assert.deepEqual(savedItem.sockets, ['rune_el']);

        store.set('sin_eater_save', JSON.stringify({
            gold: 1,
            currentHubTownId: 'central_castle',
            inventory: [],
            equipped: {},
            lastSaved: '',
            characterSave: {
                ...save,
                questState: { ...asRecord(save.questState), gold: 999 },
                hubLocation: { ...asRecord(save.hubLocation), townId: 'w_forest_village' },
            },
        }));
        const loaded = new PlayerData();
        loaded.load();
        assert.equal(loaded.gold, 999);
        assert.equal(loaded.currentHubTownId, 'w_forest_village');
        assert.equal(loaded.inventory[0].uid, 'bag-1');
        assert.deepEqual(loaded.inventory[0].sockets, ['rune_el']);
    } finally {
        globalThis.localStorage = previousStorage;
    }
});

test('socket loot handles injected random values outside Math.random range', () => {
    assert.equal(rollChestGem(() => Number.NaN), null);
    assert.equal(rollBossRune(1, () => Number.NaN), null);
    assert.equal(rollBossRune(Number.NaN, () => Number.NaN), null);

    assert.equal(rollBossRune(1, () => -1)?.id, 'rune_el');
    assert.equal(rollBossRune(1, () => 2)?.slot, 'rune');
});

test('skill visual profiles keep final visual values in cache keys', () => {
    const skill = getSkill('og_fire');
    assert.ok(skill);

    const baseProfile = getSkillVisualProfile(skill);
    const higherTierProfile = getSkillVisualProfile({ ...skill, tier: skill.tier + 1 });
    assert.notEqual(baseProfile.visualKey, higherTierProfile.visualKey);
});

test('skill visual profiles fall back for malformed runtime data', () => {
    const skill = getSkill('og_fire');
    assert.ok(skill);
    const malformed = {
        ...skill,
        type: 'not-a-type',
        element: 'not-an-element',
        tier: Number.NaN,
        power: Number.NaN,
        range: Number.NaN,
        aoeRadius: Number.NaN,
    } as unknown as Skill;

    const profile = getSkillVisualProfile(malformed);
    assert.equal(profile.skillId, skill.id);
    assert.deepEqual(profile.palette, ['#f0c050', '#ffffff', '#8cffb8', '#7dd8ff']);
    assert.equal(profile.motion, 'burst');
    assert.equal(profile.spriteEffect, 'hit');
    assert.ok(profile.particleCount > 0);
    assert.ok(profile.spriteSize > 0);
    assert.ok(profile.duration > 0);
});

function asRecord(value: unknown): Record<string, unknown> {
    assert.equal(typeof value, 'object');
    assert.notEqual(value, null);
    return value as Record<string, unknown>;
}
