/**
 * Tween — Lightweight animation primitives for UI feel.
 *
 * Usage:
 *   const t = new Tween(0, 1, 200, easeOutCubic);
 *   ... in render loop ...
 *   const v = t.value(now);
 *   if (t.done(now)) ...
 */

export type EasingFn = (t: number) => number;

export const linear: EasingFn = (t) => t;
export const easeOutCubic: EasingFn = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic: EasingFn = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack: EasingFn = (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeInOutSine: EasingFn = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutQuint: EasingFn = (t) => 1 - Math.pow(1 - t, 5);

export class Tween {
    private startTime: number = -1;

    constructor(
        public from: number,
        public to: number,
        public durationMs: number,
        public easing: EasingFn = easeOutCubic
    ) {}

    /** Start (or restart) the tween at the given timestamp. */
    start(now: number): void {
        this.startTime = now;
    }

    /** Replace the target and restart from current value. */
    retargetTo(newTo: number, now: number): void {
        const current = this.value(now);
        this.from = current;
        this.to = newTo;
        this.startTime = now;
    }

    /** Current eased value at `now`. Auto-starts if not started yet. */
    value(now: number): number {
        if (this.startTime < 0) this.startTime = now;
        const elapsed = now - this.startTime;
        if (elapsed >= this.durationMs) return this.to;
        if (elapsed <= 0) return this.from;
        const t = elapsed / this.durationMs;
        return this.from + (this.to - this.from) * this.easing(t);
    }

    done(now: number): boolean {
        if (this.startTime < 0) return false;
        return now - this.startTime >= this.durationMs;
    }

    progress(now: number): number {
        if (this.startTime < 0) return 0;
        return Math.min(1, Math.max(0, (now - this.startTime) / this.durationMs));
    }
}

/**
 * Pulsing sine value in [0, 1] — useful for "press start" blinks, turn ready glows.
 */
export function pulse(now: number, periodMs: number, phase: number = 0): number {
    return 0.5 + 0.5 * Math.sin((now / periodMs + phase) * Math.PI * 2);
}

/**
 * Spring-style damped follow: each frame, move `current` toward `target` by `stiffness * dt`.
 * Returns the new value. Use for smoothly following a moving target (HP bar, camera focus).
 */
export function damp(current: number, target: number, stiffness: number, dtMs: number): number {
    const t = 1 - Math.exp(-stiffness * dtMs / 1000);
    return current + (target - current) * t;
}
