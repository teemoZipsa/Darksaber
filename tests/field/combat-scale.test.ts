import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_STAT_SCALE, scaleCombatValue } from '../../src/data/combatScale';
import { Character } from '../../src/character/Character';
import { getNormalizedMonsterBalance } from '../../src/data/original/originalMonsterBalance';
import { CombatFormulas } from '../../src/combat/CombatFormulas';
import { getPlacedItemStatBonus } from '../../src/inventory/Socketing';
import { getItemDef } from '../../src/data/ItemDB';
import { TileType } from '../../src/map/Tile';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}
(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

test('combat scale compresses original-era values to readable early-game numbers', () => {
    assert.equal(COMBAT_STAT_SCALE, 0.35);
    assert.equal(scaleCombatValue(200), 70);
    assert.equal(scaleCombatValue(65), 23);
});

test('starter equipment bonuses scale with combat stats', () => {
    const sword = getItemDef('short_sword');
    assert.ok(sword);
    const bonus = getPlacedItemStatBonus({
        item: sword,
        x: 0,
        y: 0,
        durability: sword.maxDurability,
        sockets: [],
    });
    assert.equal(bonus.atk, 3);
});

test('scaled classes and monsters keep the infantry vs ratman early duel shape', () => {
    const fighter = new Character('fighter', 'Fighter', 'infantry');
    const monster = getNormalizedMonsterBalance('304R', 1);

    assert.ok(fighter.stats.maxHp >= 60 && fighter.stats.maxHp <= 90);
    assert.ok(monster.stats.atk < fighter.stats.atk);

    const playerHit = CombatFormulas.calcPhysicalDamage(
        fighter.stats,
        monster.stats,
        TileType.GRASS,
        { random: () => 0.1 },
    );
    const monsterHit = CombatFormulas.calcPhysicalDamage(
        monster.stats,
        fighter.stats,
        TileType.GRASS,
        { random: () => 0.1 },
    );

    assert.ok(playerHit.damage > 0);
    assert.ok(monsterHit.damage > 0);
    assert.ok(Math.ceil(monster.stats.maxHp / playerHit.damage) <= 2);
    assert.ok(Math.ceil(fighter.stats.maxHp / monsterHit.damage) >= 20);
});
