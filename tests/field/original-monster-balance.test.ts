import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { CombatFormulas } from '../../src/combat/CombatFormulas';
import {
    createFallbackMonsterStats,
    createMonsterBalanceReport,
    getNormalizedMonsterBalance,
} from '../../src/data/original/originalMonsterBalance';
import { STORY_SCENARIOS } from '../../src/data/StoryScenarioData';
import { getStoryScenarioMonsterLayout } from '../../src/data/StoryScenarioMonsterData';
import { TileType } from '../../src/map/Tile';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

test('original monster normalization keeps early monsters below a fresh fighter', () => {
    const fighter = new Character('fighter', 'Fighter', 'infantry');
    const monster = getNormalizedMonsterBalance('304R', 1);

    assert.equal(monster.source, 'original');
    assert.ok(monster.stats.maxHp < fighter.stats.maxHp);
    assert.ok(monster.stats.atk < fighter.stats.atk);
    assert.ok(monster.stats.def < fighter.stats.def);

    const playerHit = CombatFormulas.calcPhysicalDamage(
        fighter.stats,
        monster.stats,
        TileType.GRASS,
        { random: () => 0.1 }
    );
    const monsterHit = CombatFormulas.calcPhysicalDamage(
        monster.stats,
        fighter.stats,
        TileType.GRASS,
        { random: () => 0.1 }
    );

    assert.ok(playerHit.damage > 0);
    assert.ok(monsterHit.damage > 0);
    assert.ok(Math.ceil(monster.stats.maxHp / playerHit.damage) <= 2);
    assert.ok(Math.ceil(fighter.stats.maxHp / monsterHit.damage) >= 20);
});

test('normalization preserves original raw stat ordering within the starter band', () => {
    const m304 = getNormalizedMonsterBalance('304R', 1).stats;
    const m311 = getNormalizedMonsterBalance('311R', 1).stats;
    const m346 = getNormalizedMonsterBalance('346R', 1).stats;

    assert.ok(m304.atk < m311.atk);
    assert.ok(m311.atk < m346.atk);
    assert.ok(m304.def < m311.def);
    assert.ok(m311.def < m346.def);
});

test('normalization falls back for catalog monsters without original rows', () => {
    const balance = getNormalizedMonsterBalance('634R', 16);
    const fallback = createFallbackMonsterStats(16);

    assert.equal(balance.source, 'fallback');
    assert.equal(balance.original, null);
    assert.deepEqual(balance.stats, fallback);
    assert.ok(fallback.maxHp < 400);
    assert.ok(fallback.atk < 125);
    assert.ok(fallback.def < 90);
});

test('custom early story bosses use their original special boss rows', () => {
    const burgos = getNormalizedMonsterBalance('burgos_wolf_boss', 3);
    const fenris = getNormalizedMonsterBalance('zamora_fenris_boss', 4);

    assert.equal(burgos.source, 'original');
    assert.equal(burgos.original?.id, 701);
    assert.equal(burgos.original?.label, '키스라');
    assert.notDeepEqual(burgos.stats, createFallbackMonsterStats(3));

    assert.equal(fenris.source, 'original');
    assert.equal(fenris.original?.id, 702);
    assert.equal(fenris.original?.label, '펜리스');
    assert.notDeepEqual(fenris.stats, createFallbackMonsterStats(4));
});

test('late story scenario monsters use original balance rows through episode 31', () => {
    for (const scenario of STORY_SCENARIOS.filter((entry) => entry.episode >= 23 && entry.episode <= 31)) {
        const layout = getStoryScenarioMonsterLayout(scenario);
        const ids = [layout.bossMonsterId, ...layout.guardMonsterIds];
        for (const id of ids) {
            if (!id) continue;
            assert.equal(
                getNormalizedMonsterBalance(id, scenario.bossLevel).source,
                'original',
                `${scenario.dungeonId}:${id}`
            );
        }
    }
});

test('story scenario fallback balance is limited to documented 600-series authored sprites', () => {
    const allowedFallbackIds = new Set(['634R', '635R', '636R', '637R', '638R', '639R']);
    const fallbackIds = new Set<string>();

    for (const scenario of STORY_SCENARIOS) {
        const layout = getStoryScenarioMonsterLayout(scenario);
        for (const id of [layout.bossMonsterId, ...layout.guardMonsterIds]) {
            if (!id) continue;
            if (getNormalizedMonsterBalance(id, scenario.bossLevel).source === 'fallback') {
                assert.equal(allowedFallbackIds.has(id), true, `${scenario.dungeonId}:${id}`);
                fallbackIds.add(id);
            }
        }
    }

    assert.deepEqual([...fallbackIds].sort(), [...allowedFallbackIds].sort());
});

test('monster balance report exposes raw and normalized values side by side', () => {
    const report = createMonsterBalanceReport([
        { id: '304R', level: 1 },
        { id: '346R', level: 1 },
        { id: '634R', level: 16 },
    ]);

    assert.deepEqual(report.map((row) => row.id), ['304R', '346R', '634R']);
    assert.equal(report[0].source, 'original');
    assert.equal(report[0].rawAtk, 103);
    assert.equal(report[1].source, 'original');
    assert.equal(report[1].rawAtk, 230.5);
    assert.equal(report[2].source, 'fallback');
    assert.equal(report[2].rawAtk, null);
    assert.ok(report[0].atk < report[1].atk);
});
