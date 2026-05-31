import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAR_CLASSES } from '../../src/data/characterClasses';
import { getMasterClass, isMasterClassLineId } from '../../src/data/ClassTree';
import { getItemDef, ITEMS } from '../../src/data/ItemDB';
import { getMonsterDefinitionSafe, isMonsterId } from '../../src/data/MonsterCatalog';
import { ORIGINAL_SHOP_ITEMS } from '../../src/data/OriginalShopItems';
import { PlayerData } from '../../src/data/PlayerData';
import { getRestFacility, REST_FACILITIES } from '../../src/data/RestFacilityData';
import { getSellPrice, getShopItems, SHOP_INVENTORY_BY_TOWN_FACILITY } from '../../src/data/ShopData';
import { rollBossRune, rollChestGem } from '../../src/data/SocketLoot';
import { getSkill } from '../../src/data/SkillDB';
import { getSkillVisualProfile } from '../../src/data/SkillVisualProfiles';
import { createBaseStats, getBaseStatsForClass } from '../../src/data/Stats';
import type { Skill } from '../../src/data/SkillDB';
import {
    TOWN_FACILITIES,
    getTownFacilities,
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
