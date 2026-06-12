import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAR_CLASSES } from '../../src/data/characterClasses';
import { getMasterClass, isMasterClassLineId } from '../../src/data/ClassTree';
import { getItemDef, ITEMS } from '../../src/data/ItemDB';
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
import { STORY_INTERIOR_LAYOUTS } from '../../src/data/StoryInteriorData';
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
    assert.equal(getItemDef('herb_common')?.rarity, 'uncommon');
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
    const burgosKey = getItemDef('quest_burgos_key');
    assert.ok(burgosKey);
    assert.equal(getSellPrice(burgosKey), 0);
    const cainNecklace = getItemDef('quest_cain_necklace');
    assert.ok(cainNecklace);
    assert.equal(getSellPrice(cainNecklace), 0);

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

test('story episodes 1 through 22 are chained and fully localized', () => {
    assert.deepEqual(STORY_SCENARIOS.map((scenario) => scenario.episode), Array.from({ length: 22 }, (_, i) => i + 1));
    assert.equal(STORY_QUESTS.length, 22);
    assert.deepEqual(
        STORY_SCENARIOS.filter((scenario) => scenario.missionKind === 'soloInterior').map((scenario) => scenario.episode),
        [1, 2, 3, 7, 13, 18, 19, 20, 21, 22]
    );
    assert.deepEqual(
        STORY_SCENARIOS.filter((scenario) => scenario.missionKind === 'vehicle').map((scenario) => scenario.episode),
        [17]
    );
    assert.deepEqual(
        STORY_INTERIOR_LAYOUTS.map((layout) => layout.dungeonId).sort(),
        STORY_SCENARIOS.filter((scenario) => scenario.missionKind === 'soloInterior').map((scenario) => scenario.dungeonId).sort()
    );

    const ko = i18n.strings.ko as Record<string, string>;
    const en = i18n.strings.en as Record<string, string>;
    for (const [index, quest] of STORY_QUESTS.entries()) {
        assert.equal(quest.episode, index + 1);
        assert.equal(quest.prerequisiteQuestId, index === 0 ? undefined : STORY_QUESTS[index - 1].id);
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
