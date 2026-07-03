import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldEngineWorldControllers } from '../../src/engine/world/WorldEngineWorldControllers';
import { TileType } from '../../src/map/Tile';
import { FusionTempleUI } from '../../src/ui/FusionTempleUI';

test('world controller factory wires support controller ports', () => {
    let worldTime = 17;
    const shakes: { amount: number; durationMs: number }[] = [];
    const player = { gridX: 4, gridY: 5 };
    const worldMap = {
        extractionZones: [],
        loot: [],
        getTileAt: () => TileType.GRASS,
        getBoundsTiles: () => ({ width: 10, height: 10 }),
        getMapLandmarks: () => [],
        getRealm: () => 'mortal',
    };

    const controllers = createWorldEngineWorldControllers({
        camera: {
            shake: (amount: number, durationMs: number) => shakes.push({ amount, durationMs }),
        } as any,
        party: {} as any,
        raidSession: {} as any,
        fusionTempleUI: new FusionTempleUI(),
        floatingText: {
            spawnHeal: () => undefined,
            spawnStatus: () => undefined,
        } as any,
        effectManager: { spawnHealEffect: () => undefined } as any,
        getWorldTime: () => worldTime,
        getWorldMap: () => worldMap as any,
        getPlayer: () => player as any,
        setPlayer: () => undefined,
        getControlledActor: () => null,
        getPartyActors: () => [],
        getFieldEnemies: () => [],
        setFieldEnemies: () => undefined,
        isNetworkRaid: () => false,
        getPhase: () => 'lobby',
        setPhase: () => undefined,
        beginRaidFromCurrentHub: () => undefined,
        closeFieldOverlays: () => undefined,
        clearFieldTurnState: () => undefined,
        placePartyNear: () => undefined,
        clearWorldLoot: () => undefined,
        selectActor: () => undefined,
        addCombatLog: () => undefined,
    });

    assert.ok(controllers.minimapUI.isVisible());
    assert.ok(controllers.templeController);
    assert.ok(controllers.restingController);

    const groupId = controllers.combatFeedbackController.beginGroup();
    assert.match(groupId, /^world:17:/);
    controllers.combatFeedbackController.register('normal', groupId);
    controllers.combatFeedbackController.flush(groupId);
    assert.deepEqual(shakes, [{ amount: 6, durationMs: 180 }]);

    worldTime = 23;
    assert.match(controllers.combatFeedbackController.beginGroup(), /^world:23:/);
});
