import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldMap } from '../../src/map/WorldMap';
import { getKaosiaHuntingGrounds, huntingEnemyPrefix, huntingNestKey } from '../../src/field/KaosiaHuntingGrounds';
import { findPath, manhattan } from '../../src/field/FieldPathing';
import { WorldSession } from '../../server/WorldSession';
import { createBaseStats } from '../../src/data/Stats';
import { canTraverseTownTile } from '../../src/field/TownTravel';

test('outdoor travel routes around town boundaries while deliberate return remains possible', () => {
    const world = new WorldMap();
    const town = world.getTowns().find((entry) => entry.id === 'central_castle')!;
    const exit = world.getTownExitTile(town);
    const start = { x: exit.x - 1, y: exit.y };
    const target = getKaosiaHuntingGrounds(world)[0].approach;
    const passable = (query: Parameters<typeof canTraverseTownTile>[0]) => world.isWalkable(query.x, query.y)
        && canTraverseTownTile(query, (x, y) => world.getTownAtTile(x, y));
    const path = findPath(start, target, passable);
    assert.ok(path.length > 0);
    assert.ok(path.every((tile) => !world.getTownAtTile(tile.x, tile.y)));
    const returning = findPath(start, world.getTownSpawnTile(town), passable);
    assert.ok(returning.some((tile) => world.getTownAtTile(tile.x, tile.y)?.id === town.id));
});

test('Kaosia offers three reachable outdoor encounters with a gentle difficulty progression', () => {
    const world = new WorldMap();
    const exit = world.getTownExitTile(world.getTowns().find((town) => town.id === 'central_castle')!);
    const grounds = getKaosiaHuntingGrounds(world);
    assert.equal(grounds.length, 3);
    assert.deepEqual(grounds.map((ground) => [ground.level, ground.members.length]), [[1, 1], [1, 2], [2, 2]]);
    for (const ground of grounds) {
        const path = findPath(exit, ground.center, (tile) => world.isWalkable(tile.x, tile.y)
            && !world.getTownAtTile(tile.x, tile.y), { maxNodes: 8000, maxDistance: 90 });
        assert.ok(path.length > 0 && path.length <= 70);
        assert.ok(manhattan(exit, ground.center) >= 24, 'the exit stays safe');
        for (const member of ground.members) {
            assert.ok(world.isWalkable(member.tile.x, member.tile.y));
            assert.equal(world.getTownAtTile(member.tile.x, member.tile.y), null);
            assert.equal(world.getDungeonAtTile(member.tile.x, member.tile.y), null);
            assert.ok(manhattan(ground.approach, member.tile) >= 6);
        }
    }
    world.setRealm('master');
    assert.deepEqual(getKaosiaHuntingGrounds(world), []);
});

function join(session: WorldSession, id: string, now = 0) {
    return session.join({ type: 'WORLD_JOIN', originHubId: 'central_castle', clientVersion: 'test',
        partyComposition: [{ id, localActorId: id, name: id, classLineId: 'infantry', currentTier: 1,
            level: 1, tile: { x: 0, y: 0 }, stats: createBaseStats({ spd: 100 }),
            statuses: [], actionGauge: 0, remainingAp: 0, facing: 'down', isDead: false }],
    }, now);
}

test('authored hunting grounds exist on arrival and joining players cannot refill cleared encounters', () => {
    const session = new WorldSession();
    const joined = join(session, 'first');
    const state = session.getDebugState();
    const hunts = () => [...state.enemies.values()].filter((entry) => entry.enemy.id.startsWith('hunt_kaosia_'));
    assert.equal(hunts().length, 5);
    assert.ok(hunts().every((entry) => manhattan(joined.welcome.spawnTile, entry.home) >= 24));
    const nest = state.nestStates.get(huntingNestKey('gate'))!;
    const enemy = state.enemies.get(nest.monsterIds[0])!;
    enemy.enemy.stats.hp = 0;
    nest.monsterIds = [];
    nest.cleared = true;
    nest.respawnAt = 300_000;
    join(session, 'second', 1000);
    session.tick(2000);
    assert.equal(nest.monsterIds.length, 0, 'joining cannot bypass a cleared nest cooldown');
    assert.equal(hunts().filter((entry) => entry.enemy.id.startsWith(huntingEnemyPrefix('gate')) && entry.enemy.stats.hp > 0).length, 0);
    session.tick(301_000);
    assert.equal(nest.monsterIds.length, 0, 'respawning must not appear in an existing player viewport');
});
