/**
 * FloatingTextManager — Classic RPG-style floating combat text.
 *
 * Spawns text (damage, heal, miss, critical) at entity positions
 * that floats upward and fades out over ~1.2 seconds.
 */

import { TILE_SIZE } from '../map/Chunk';
import { DarksaberSpriteAtlas, type DamageNumberVariant } from './DarksaberSpriteAtlas';
import { UI } from './UITheme';
import { easeOutBack } from './Tween';

export type FloatingTextType = 'damage' | 'heal' | 'miss' | 'crit' | 'status';

interface FloatingText {
    text: string;
    gridX: number;
    gridY: number;
    type: FloatingTextType;
    /** Remaining lifetime in seconds */
    timer: number;
    /** Current vertical offset (pixels, grows upward as negative) */
    offsetY: number;
    /** Small random horizontal jitter so overlapping texts don't stack */
    offsetX: number;
}

/** Style configuration per text type */
const STYLE: Record<FloatingTextType, { color: string; outline: string; fontSize: number }> = {
    damage: { color: '#ff3a3a', outline: '#3a0808', fontSize: 18 },
    crit:   { color: '#ff9020', outline: '#3a1a08', fontSize: 26 },
    heal:   { color: '#ffd400', outline: '#3a2a08', fontSize: 18 },
    miss:   { color: '#f0e8d8', outline: '#1a1a1a', fontSize: 15 },
    status: { color: '#7ddcff', outline: '#0a2030', fontSize: 15 },
};

const POP_DURATION = 0.18;       // seconds for scale-pop to settle

const LIFETIME = 1.2;       // total duration in seconds
const FADE_START = 0.3;     // start fading when this much time remains
const FLOAT_SPEED = 35;     // pixels per second upward

export class FloatingTextManager {
    private texts: FloatingText[] = [];

    /**
     * Spawn a new floating text at the given grid position.
     */
    public spawn(text: string, gridX: number, gridY: number, type: FloatingTextType): void {
        this.texts.push({
            text,
            gridX,
            gridY,
            type,
            timer: LIFETIME,
            offsetY: 0,
            offsetX: (Math.random() - 0.5) * 16, // ±8px jitter
        });
    }

    /**
     * Convenience: spawn damage text. Shows "-N" for damage, "-N!" for crit, "MISS" for miss.
     */
    public spawnDamage(gridX: number, gridY: number, damage: number, isCrit: boolean, isMiss: boolean): void {
        if (isMiss) {
            this.spawn('MISS', gridX, gridY, 'miss');
        } else if (isCrit) {
            this.spawn(`-${damage}!`, gridX, gridY, 'crit');
        } else {
            this.spawn(`-${damage}`, gridX, gridY, 'damage');
        }
    }

    /**
     * Convenience: spawn heal text. Shows "+N".
     */
    public spawnHeal(gridX: number, gridY: number, amount: number): void {
        this.spawn(`+${amount}`, gridX, gridY, 'heal');
    }

    /**
     * Convenience: spawn short status text such as BUFF, GUARD, or DOWN.
     */
    public spawnStatus(gridX: number, gridY: number, text: string): void {
        this.spawn(text, gridX, gridY, 'status');
    }

    /**
     * Update all floating texts — float upward and tick timers.
     */
    public update(dt: number): void {
        for (let i = this.texts.length - 1; i >= 0; i--) {
            const ft = this.texts[i];
            ft.timer -= dt;
            ft.offsetY -= FLOAT_SPEED * dt; // float upward

            if (ft.timer <= 0) {
                this.texts.splice(i, 1);
            }
        }
    }

    /**
     * Render all active floating texts.
     * Call after entities / fog-of-war, before HUD.
     */
    public render(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        if (this.texts.length === 0) return;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const ft of this.texts) {
            const style = STYLE[ft.type];

            // World position → screen position
            const screenX = ft.gridX * TILE_SIZE - camX + TILE_SIZE / 2 + ft.offsetX;
            const screenY = ft.gridY * TILE_SIZE - camY + ft.offsetY;

            // Fade out near end of life
            let alpha = 1.0;
            if (ft.timer < FADE_START) {
                alpha = Math.max(0, ft.timer / FADE_START);
            }

            // Scale: ease-out-back pop from 0 → peak → 1.0. Crit pops harder.
            const age = LIFETIME - ft.timer;
            let scale = 1.0;
            if (age < POP_DURATION) {
                const t = age / POP_DURATION;
                const eased = easeOutBack(t);
                const peakOvershoot = ft.type === 'crit' ? 0.55 : 0.25;
                // easeOutBack peaks just above 1; we map [0..1] eased -> 0 → peak → settle
                scale = eased * (1 + peakOvershoot * (1 - t));
            }

            if (this.renderSpriteNumber(ctx, ft, screenX, screenY, alpha, scale)) {
                continue;
            }

            const fontSize = Math.round(style.fontSize * scale);
            ctx.font = `bold ${fontSize}px ${UI.fontPrimary}`;
            ctx.globalAlpha = alpha;

            // Outline (stroke) for readability
            ctx.strokeStyle = style.outline;
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.strokeText(ft.text, screenX, screenY);

            // Fill
            ctx.fillStyle = style.color;
            ctx.fillText(ft.text, screenX, screenY);
        }

        ctx.globalAlpha = 1.0;
        ctx.restore();
    }

    /** Clear all floating texts (e.g. on state change) */
    public clear(): void {
        this.texts.length = 0;
    }

    private renderSpriteNumber(
        ctx: CanvasRenderingContext2D,
        ft: FloatingText,
        screenX: number,
        screenY: number,
        alpha: number,
        popScale: number
    ): boolean {
        const variant = this.getNumberVariant(ft.type);
        if (!variant) return false;

        const baseScale = ft.type === 'crit' ? 2.45 : 2.15;
        return DarksaberSpriteAtlas.drawNumberText(ctx, ft.text, screenX, screenY, variant, {
            alpha,
            align: 'center',
            scale: baseScale * popScale,
            spacing: 1,
        });
    }

    private getNumberVariant(type: FloatingTextType): DamageNumberVariant | null {
        switch (type) {
            case 'damage':
                return 'damage';
            case 'crit':
                return 'crit';
            case 'heal':
                return 'heal';
            default:
                return null;
        }
    }
}
