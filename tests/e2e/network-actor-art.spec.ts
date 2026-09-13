import { expect, test } from '@playwright/test';

test('remote snapshots load all eight advanced class sprites and keep them on repeated updates', async ({ page }, testInfo) => {
    await page.goto('/?devStart=raid&devLocal=1');
    await expect(page.getByTestId('field-hud')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__gm?.state)).toBe('WORLD');
    await expect.poll(() => page.evaluate(() => (window as any).__gm?.worldEngine?.partyActors?.length ?? 0)).toBeGreaterThan(0);
    await page.evaluate(() => {
        const engine = (window as any).__gm.worldEngine;
        const own = engine.partyActors.map((actor: any) => ({
            id: actor.id, localActorId: actor.character.id, name: actor.character.name,
            classLineId: actor.character.classLineId, currentTier: actor.character.currentTier,
            level: actor.character.level, tile: { x: actor.entity.gridX, y: actor.entity.gridY },
            stats: { ...actor.character.stats }, statuses: [], isDead: false, actionGauge: 0, facing: 'down',
        }));
        const classes: Array<[string, number]> = [
            ['master_battle', 10], ['master_tactics', 10], ['master_magic', 10], ['alchemist', 7],
            ['mage', 7], ['cultist', 7], ['master_healer', 8], ['master_healer', 9],
        ];
        const remote = classes.map(([classLineId, currentTier], i) => ({
            ...own[0], id: `art-check-${i}`, localActorId: `art-check-${i}`, ownerPlayerId: 'remote',
            name: `${classLineId} ${currentTier}`, classLineId, currentTier,
            tile: { x: own[0].tile.x + (i % 4) - 2, y: own[0].tile.y + Math.floor(i / 4) * 2 + 2 },
        }));
        const snapshot = {
            seq: 1, serverTime: 1000, players: [], partyActors: [...own, ...remote], enemies: [], loot: [],
            readyActors: [], remainingApByActor: {},
            raidTimer: { active: true, elapsedSeconds: 0, limitSeconds: 0, departureTownId: 'central_castle', modifier: null },
            scenario: { enteredDungeonIds: [], activeDungeonId: null, completedDungeonIds: [] },
        };
        const controller = engine.scenarioNetworkControllers.networkSyncController;
        controller.applySnapshot(snapshot);
        const sprites = [...engine.remotePartyActors.values()].map((actor: any) => actor.entity.walkSprite);
        controller.applySnapshot(snapshot);
        if (![...engine.remotePartyActors.values()].every((actor: any, i) => actor.entity.walkSprite === sprites[i])) {
            throw new Error('Repeated snapshot replaced the sprite');
        }
    });
    await expect.poll(() => page.evaluate(() => [...(window as any).__gm.worldEngine.remotePartyActors.values()]
        .filter((actor: any) => actor.entity.walkSpriteLoaded && actor.entity.imageLoaded).length)).toBe(8);
    await page.screenshot({ path: testInfo.outputPath('remote-advanced-classes.png') });
});
