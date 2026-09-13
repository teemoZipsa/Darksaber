import { expect, type Page } from '@playwright/test';

/** Exercise normal AP movement and town arrival, never teleport or end the run. */
export async function walkToTown(page: Page) {
    await page.waitForFunction(() => {
        const gm = (window as any).__gm;
        const engine = gm?.worldEngine;
        return engine && !gm.transitions.isInputLocked()
            && !engine.getFieldTravel().active
            && engine.partyActors.every((actor: any) => actor.path.length === 0);
    });
    const started = await page.evaluate(() => {
        const engine = (window as any).__gm.worldEngine;
        const session = engine.getRaidSession();
        const town = engine.worldMap.getTowns().find((entry: any) => entry.id === session.departureTownId);
        return engine.tryFieldTravel(engine.worldMap.getTownSpawnTile(town));
    });
    expect(started).toBe(true);
    await expect(page.getByRole('button', { name: /마을로 귀환|Return to town/ })).toHaveCount(0);
    await expect(page.getByTestId('raid-result')).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => (window as any).__gm.worldEngine.getRaidOutcome().result)).toBe('SURVIVED');
}
