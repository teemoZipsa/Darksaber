/**
 * TransitionManager — Black overlay fade between game states.
 *
 * Usage:
 *   tm.requestTransition({
 *     midCallback: () => gameManager.setStateImmediate(GameState.WORLD),
 *     fadeOutMs: 280,
 *     fadeInMs: 280,
 *     holdMs: 60,
 *   });
 *
 * Game loop:
 *   tm.update(performance.now());
 *   if (tm.isInputLocked()) skip-input;
 *   ...render...
 *   tm.render(ctx, w, h);    // last, on top of everything
 *
 * Also supports a one-shot `fadeInFromBlack()` for the initial app boot.
 */

import { easeOutCubic, easeInOutCubic, type EasingFn } from './Tween';

type Phase = 'idle' | 'fadingOut' | 'holding' | 'fadingIn';

interface TransitionRequest {
    midCallback?: () => void;
    fadeOutMs: number;
    holdMs: number;
    fadeInMs: number;
    color: string;
    fadeOutEasing: EasingFn;
    fadeInEasing: EasingFn;
}

const DEFAULT_FADE_OUT_MS = 240;
const DEFAULT_FADE_IN_MS = 280;
const DEFAULT_HOLD_MS = 60;
const DEFAULT_COLOR = 'rgba(8, 6, 4, 1)';

export class TransitionManager {
    private phase: Phase = 'idle';
    private alpha = 0;
    private phaseStart = 0;
    private current: TransitionRequest | null = null;
    private midCallbackFired = false;

    /** Trigger a fade-out → mid → fade-in sequence. Ignored if already mid-transition. */
    public requestTransition(opts: {
        midCallback?: () => void;
        fadeOutMs?: number;
        holdMs?: number;
        fadeInMs?: number;
        color?: string;
        easing?: EasingFn;
    } = {}): boolean {
        if (this.phase !== 'idle') return false;

        this.current = {
            midCallback: opts.midCallback,
            fadeOutMs: opts.fadeOutMs ?? DEFAULT_FADE_OUT_MS,
            holdMs: opts.holdMs ?? DEFAULT_HOLD_MS,
            fadeInMs: opts.fadeInMs ?? DEFAULT_FADE_IN_MS,
            color: opts.color ?? DEFAULT_COLOR,
            fadeOutEasing: opts.easing ?? easeInOutCubic,
            fadeInEasing: opts.easing ?? easeOutCubic,
        };
        this.midCallbackFired = false;
        this.phase = 'fadingOut';
        this.phaseStart = performance.now();
        this.alpha = 0;
        return true;
    }

    /** One-shot fade-in from solid black (use at app boot). */
    public fadeInFromBlack(ms: number = 480): void {
        this.current = {
            midCallback: undefined,
            fadeOutMs: 0,
            holdMs: 0,
            fadeInMs: ms,
            color: DEFAULT_COLOR,
            fadeOutEasing: easeOutCubic,
            fadeInEasing: easeOutCubic,
        };
        this.midCallbackFired = true; // no mid step
        this.phase = 'fadingIn';
        this.phaseStart = performance.now();
        this.alpha = 1;
    }

    public update(now: number): void {
        if (this.phase === 'idle' || !this.current) return;
        const elapsed = now - this.phaseStart;
        const c = this.current;

        if (this.phase === 'fadingOut') {
            const t = c.fadeOutMs > 0 ? Math.min(1, elapsed / c.fadeOutMs) : 1;
            this.alpha = c.fadeOutEasing(t);
            if (t >= 1) {
                this.alpha = 1;
                if (!this.midCallbackFired && c.midCallback) {
                    c.midCallback();
                    this.midCallbackFired = true;
                }
                this.phase = 'holding';
                this.phaseStart = now;
            }
        } else if (this.phase === 'holding') {
            if (elapsed >= c.holdMs) {
                this.phase = 'fadingIn';
                this.phaseStart = now;
            }
        } else if (this.phase === 'fadingIn') {
            const t = c.fadeInMs > 0 ? Math.min(1, elapsed / c.fadeInMs) : 1;
            this.alpha = 1 - c.fadeInEasing(t);
            if (t >= 1) {
                this.alpha = 0;
                this.phase = 'idle';
                this.current = null;
            }
        }
    }

    /** Draw the overlay. Call after all other rendering. */
    public render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        if (this.alpha <= 0 || !this.current) return;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.current.color;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    /** True while the screen is fully or mostly covered — input should be ignored. */
    public isInputLocked(): boolean {
        return this.phase === 'fadingOut' || this.phase === 'holding';
    }

    public isActive(): boolean {
        return this.phase !== 'idle';
    }
}
