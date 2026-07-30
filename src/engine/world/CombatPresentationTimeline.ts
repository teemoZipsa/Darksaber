export const COMBAT_IMPACT_DELAY_SECONDS = 0.1;
export const COMBAT_COUNTER_START_DELAY_SECONDS = 0.17;
export const COMBAT_COUNTER_IMPACT_DELAY_SECONDS = 0.27;

interface ScheduledCombatPresentation {
    dueAt: number;
    order: number;
    action: () => void;
}

/**
 * Small deterministic scheduler for combat presentation.
 *
 * Damage and turn state remain authoritative and synchronous. Only animation,
 * floating text, impact effects, sound, and hit-stop are queued here.
 */
export class CombatPresentationTimeline {
    private elapsed = 0;
    private nextOrder = 0;
    private readonly scheduled: ScheduledCombatPresentation[] = [];

    public schedule(delaySeconds: number, action: () => void): void {
        const delay = Number.isFinite(delaySeconds) ? Math.max(0, delaySeconds) : 0;
        if (delay === 0) {
            action();
            return;
        }
        this.scheduled.push({
            dueAt: this.elapsed + delay,
            order: this.nextOrder++,
            action,
        });
    }

    public update(dt: number): void {
        this.elapsed += Number.isFinite(dt) ? Math.max(0, dt) : 0;

        while (true) {
            let nextIndex = -1;
            for (let index = 0; index < this.scheduled.length; index++) {
                const candidate = this.scheduled[index];
                if (candidate.dueAt > this.elapsed) continue;
                const current = nextIndex >= 0 ? this.scheduled[nextIndex] : null;
                if (
                    !current
                    || candidate.dueAt < current.dueAt
                    || (candidate.dueAt === current.dueAt && candidate.order < current.order)
                ) {
                    nextIndex = index;
                }
            }
            if (nextIndex < 0) return;
            const [next] = this.scheduled.splice(nextIndex, 1);
            next.action();
        }
    }

    public clear(): void {
        this.scheduled.length = 0;
    }

    public get pendingCount(): number {
        return this.scheduled.length;
    }
}
