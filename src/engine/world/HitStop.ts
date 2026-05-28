/**
 * HitStop — Brief global time-freeze on impact for combat "weight".
 *
 * Call HitStop.freeze(ms) on a hit. While the freeze is active, the game
 * loop's dt is scaled to zero, so animations and turns pause for a beat
 * before resuming. Particles, tweens, UI inputs all honor this.
 *
 * Stacks "max-wins": a stronger freeze extends the duration; a weaker
 * one during an active freeze is ignored.
 */

class HitStopClass {
    private endMs: number = 0;

    /** Freeze the world clock for the given duration. */
    public freeze(durationMs: number): void {
        const target = performance.now() + durationMs;
        if (target > this.endMs) this.endMs = target;
    }

    /** Returns 0 during a freeze, 1 otherwise. Multiply dt by this in the loop. */
    public get timeScale(): number {
        return performance.now() < this.endMs ? 0 : 1;
    }

    public get isFrozen(): boolean {
        return performance.now() < this.endMs;
    }
}

export const HitStop = new HitStopClass();
