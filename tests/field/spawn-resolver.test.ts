import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getFieldDanger,
    isEligible,
    resolveSpawnLevel,
    getRegionPacks,
    pickNestForChunk,
    type SpawnContext,
} from '../../src/field/SpawnResolver';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';
import {
    GENERAL_MONSTER_IDS,
    MONSTER_DEFINITIONS,
    NEW_MONSTER_IDS,
    RESERVED_RENDERABLE_MONSTER_IDS,
    type MonsterId,
} from '../../src/data/MonsterCatalog';
import { getOriginalLateStoryFact } from '../../src/data/OriginalLateStoryFacts';
import { WorldMap } from '../../src/map/WorldMap';

test('catalog level bands are well-formed and contain the base level', () => {
    const fieldPool: MonsterId[] = [...GENERAL_MONSTER_IDS, ...NEW_MONSTER_IDS];
    for (const id of fieldPool) {
        const def = MONSTER_DEFINITIONS[id];
        const [min, max] = def.levelBand;
        assert.ok(min >= 1, `${id} band min must be >=1`);
        assert.ok(min <= max, `${id} band min<=max`);
        assert.ok(def.level >= min && def.level <= max, `${id} base level ${def.level} within band [${min},${max}]`);
        assert.ok(def.spawnTags.length > 0, `${id} has spawn tags`);
    }
});

test('region danger rises from the central start zone toward the eastern Ament', () => {
    const central = getFieldDanger(37, 44); // Kaosia town
    const burgos = getFieldDanger(43, 40);  // episode 1
    const skeria = getFieldDanger(27, 74);  // episode 15
    const ament = getFieldDanger(67, 34);   // episode 20

    assert.ok(central <= 2, `central start should be safe (got ${central})`);
    assert.ok(central < burgos, 'burgos harder than town');
    assert.ok(burgos < skeria, 'mid south harder than early central');
    assert.ok(skeria < ament, 'ament harder than skeria');
    assert.ok(ament >= 14, `deep east must reach the 600-series band (got ${ament})`);
});

test('towns stay safe even when surrounded by high-danger zones', () => {
    // Entria sits next to the eastern Ament corridor but must remain a safe bubble.
    assert.ok(getFieldDanger(63, 49) <= 2, 'Entria town is safe');
});

test('eligibility excludes bosses and respects the band +/- 1 window', () => {
    assert.equal(isEligible('burgos_wolf_boss', 3), false, 'bosses never wild-spawn');
    // 214R band [1,5]
    assert.equal(isEligible('214R', 1), true);
    assert.equal(isEligible('214R', 6), true);  // max + 1
    assert.equal(isEligible('214R', 7), false); // beyond max + 1
    // 634R band [14,20]
    assert.equal(isEligible('634R', 4), false);
    assert.equal(isEligible('634R', 13), true); // min - 1
});

test('reserved renderable monsters are not automatic field spawns', () => {
    const reserved = new Set<string>(RESERVED_RENDERABLE_MONSTER_IDS);
    for (let danger = 1; danger <= 20; danger++) {
        for (const biome of ['grass', 'forest', 'sand', 'stone', 'snow', 'lava', 'special'] as const) {
            const pool = getRegionPacks(biome, danger).map((pack) => pack.monsterId);
            assert.equal(pool.some((id) => reserved.has(id)), false, `${biome}/${danger} included a reserved monster`);
        }
    }
});

test('spawn level is the base nudged toward danger and clamped to the band', () => {
    // 304R: base 1, band [1,3]
    assert.equal(resolveSpawnLevel('304R', 1), 1);
    assert.equal(resolveSpawnLevel('304R', 6), 3, 'clamps to band max even in a hot zone');
    // 458R: base 11, band [8,14]
    assert.equal(resolveSpawnLevel('458R', 11), 11);
    assert.equal(resolveSpawnLevel('458R', 17), 14, 'shift capped then band-clamped up');
    assert.equal(resolveSpawnLevel('458R', 8), 9, 'shift floored at -2 -> 9');
});

test('the eastern stone zone yields only the 600-series human elites', () => {
    const pool = getRegionPacks('stone', getFieldDanger(67, 34)).map((p) => p.monsterId);
    assert.ok(pool.length > 0);
    for (const id of pool) {
        assert.ok(NEW_MONSTER_IDS.includes(id as never) && MONSTER_DEFINITIONS[id].family === 'human',
            `${id} should be a 600-series human elite`);
    }
});

test('late story sealed continent keeps episodes 23 through 31 on hostile land', () => {
    const world = new WorldMap('mortal', { validateTownSpawns: false });

    for (let episode = 23; episode <= 31; episode++) {
        const fact = getOriginalLateStoryFact(episode);
        const scenario = STORY_SCENARIOS.find((entry) => entry.episode === episode);
        assert.ok(scenario, `missing episode ${episode}`);
        assert.equal(
            world.getBiomeAtChunk(scenario.chunkX, scenario.chunkY),
            fact.worldBiome,
            `episode ${episode} sealed-continent biome`
        );
        assert.equal(getFieldDanger(scenario.chunkX, scenario.chunkY), 20, `episode ${episode} late-story danger`);
    }
});

test('nest generation is deterministic for the same seed/chunk/context', () => {
    const ctx: SpawnContext = { realm: 'mortal', chunkX: 45, chunkY: 41, biome: 'grass', seed: 'server:7' };
    const a = pickNestForChunk(ctx, true);
    const b = pickNestForChunk(ctx, true);
    assert.deepEqual(a, b);
    assert.ok(a && a.monsters.length >= 3 && a.monsters.length <= 6, 'danger-scaled pack size');
});

test('starter danger nests use level 1 small packs near Kaosia', () => {
    const ctx: SpawnContext = { realm: 'mortal', chunkX: 37, chunkY: 41, biome: 'grass', seed: 'server:start' };
    assert.ok(getFieldDanger(ctx.chunkX, ctx.chunkY, ctx.realm) <= 2);

    const nest = pickNestForChunk(ctx, true);
    assert.ok(nest);
    assert.ok(nest.monsters.length >= 1 && nest.monsters.length <= 2, 'starter pack size 1-2');
    assert.deepEqual([...new Set(nest.monsters.map((monster) => monster.level))], [1]);
});

test('no nests spawn on ocean or town chunks', () => {
    assert.equal(pickNestForChunk({ realm: 'mortal', chunkX: 5, chunkY: 5, biome: 'ocean', seed: 's' }, true), null);
    assert.equal(pickNestForChunk({ realm: 'mortal', chunkX: 37, chunkY: 44, biome: 'town', seed: 's' }, true), null);
});

test('nest centre tiles land inside the requested chunk', () => {
    const ctx: SpawnContext = { realm: 'mortal', chunkX: 50, chunkY: 50, biome: 'forest', seed: 'world' };
    const nest = pickNestForChunk(ctx, true);
    assert.ok(nest);
    assert.ok(nest.centerTile.x >= 50 * 32 && nest.centerTile.x < 51 * 32);
    assert.ok(nest.centerTile.y >= 50 * 32 && nest.centerTile.y < 51 * 32);
});
