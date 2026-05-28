/**
 * EffectManager — Visual particle effects for spell casts and kills.
 * Renders canvas-based particle animations tied to grid positions.
 */

import { Camera } from '../engine/Camera';
import { DarksaberSpriteAtlas, type SpriteRect } from './DarksaberSpriteAtlas';

const TILE_SIZE = 48;

interface Particle {
    x: number; y: number;       // world pixel position
    vx: number; vy: number;     // velocity
    life: number;               // seconds remaining
    maxLife: number;
    size: number;
    color: string;
    alpha: number;
    kind: 'circle' | 'spark' | 'ring' | 'star';
}

interface ActiveEffect {
    particles: Particle[];
    timer: number;              // elapsed seconds
    duration: number;           // total seconds
}

interface SpriteEffectFrame {
    rect: SpriteRect;
    duration: number;
    alpha?: number;
    flipX?: boolean;
    offsetX?: number;
    offsetY?: number;
    rotation?: number;
    scale?: number;
}

interface ActiveSpriteEffect {
    frames: SpriteEffectFrame[];
    gridX: number;
    gridY: number;
    timer: number;
    duration: number;
    size: number;
}

// Kill fade-out tracking
interface KillFade {
    gridX: number;
    gridY: number;
    alpha: number;
    color: string;
    image?: HTMLImageElement;
    timer: number;
    expText: string;
    expAlpha: number;
    expY: number;
}

const fx = (x: number, y: number, w: number, h: number): SpriteRect => ({ sheet: 'fx2', x, y, w, h });

const SPRITE_FX = {
    hit: [
        { rect: fx(73, 68, 46, 40), duration: 0.08, scale: 0.95 },
        { rect: fx(123, 68, 44, 40), duration: 0.08, scale: 1.1 },
        { rect: fx(73, 138, 46, 40), duration: 0.09, scale: 1.2, alpha: 0.9 },
    ],
    critHit: [
        { rect: fx(73, 68, 46, 40), duration: 0.06, scale: 1.1 },
        { rect: fx(123, 68, 44, 40), duration: 0.06, scale: 1.35 },
        { rect: fx(73, 138, 46, 40), duration: 0.08, scale: 1.55 },
        { rect: fx(123, 138, 44, 40), duration: 0.08, scale: 1.65, alpha: 0.85 },
    ],
    fire: [
        { rect: fx(631, 581, 49, 62), duration: 0.08, scale: 0.95 },
        { rect: fx(695, 582, 56, 60), duration: 0.08, scale: 1.05 },
        { rect: fx(769, 581, 49, 61), duration: 0.08, scale: 1.12 },
        { rect: fx(833, 582, 56, 60), duration: 0.1, scale: 1.18 },
    ],
    ice: [
        { rect: fx(135, 489, 31, 53), duration: 0.08, scale: 0.75 },
        { rect: fx(254, 461, 42, 80), duration: 0.08, scale: 0.92 },
        { rect: fx(365, 437, 70, 110), duration: 0.1, scale: 1.08 },
        { rect: fx(474, 425, 102, 122), duration: 0.12, scale: 1.14 },
    ],
    lightning: [
        { rect: fx(645, 70, 210, 116), duration: 0.07, scale: 0.78 },
        { rect: fx(645, 70, 210, 116), duration: 0.07, scale: 0.92, flipX: true },
        { rect: fx(645, 70, 210, 116), duration: 0.1, scale: 1.02, alpha: 0.82 },
    ],
    wind: [
        { rect: fx(3, 828, 64, 68), duration: 0.07, scale: 0.92 },
        { rect: fx(71, 830, 66, 66), duration: 0.07, scale: 1 },
        { rect: fx(138, 832, 69, 63), duration: 0.07, scale: 1.08 },
        { rect: fx(210, 828, 64, 69), duration: 0.08, scale: 1.16 },
    ],
    heal: [
        { rect: fx(541, 34, 22, 22), duration: 0.07, scale: 0.75, offsetY: -10 },
        { rect: fx(541, 64, 22, 22), duration: 0.08, scale: 0.92, offsetY: -16 },
        { rect: fx(541, 94, 23, 23), duration: 0.09, scale: 1.08, offsetY: -22 },
        { rect: fx(541, 125, 25, 25), duration: 0.1, scale: 1.18, offsetY: -26 },
    ],
    dark: [
        { rect: fx(16, 745, 46, 54), duration: 0.08, scale: 0.95 },
        { rect: fx(86, 745, 47, 54), duration: 0.08, scale: 1.05 },
        { rect: fx(154, 745, 48, 54), duration: 0.1, scale: 1.16 },
    ],
    buff: [
        { rect: fx(589, 224, 32, 32), duration: 0.08, scale: 0.85, offsetY: -12 },
        { rect: fx(622, 224, 32, 32), duration: 0.08, scale: 1.02, offsetY: -18 },
        { rect: fx(657, 224, 32, 32), duration: 0.1, scale: 1.14, offsetY: -24 },
    ],
    debuff: [
        { rect: fx(281, 745, 43, 37), duration: 0.08, scale: 0.9 },
        { rect: fx(348, 745, 42, 39), duration: 0.08, scale: 1.05 },
        { rect: fx(417, 745, 46, 39), duration: 0.1, scale: 1.18 },
    ],
} satisfies Record<string, SpriteEffectFrame[]>;

export class EffectManager {
    private effects: ActiveEffect[] = [];
    private spriteEffects: ActiveSpriteEffect[] = [];
    private killFades: KillFade[] = [];

    public update(dt: number): void {
        // Update effects
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const eff = this.effects[i];
            eff.timer += dt;
            for (const p of eff.particles) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.life -= dt;
                p.alpha = Math.max(0, p.life / p.maxLife);
            }
            eff.particles = eff.particles.filter(p => p.life > 0);
            if (eff.timer >= eff.duration && eff.particles.length === 0) {
                this.effects.splice(i, 1);
            }
        }

        // Update sprite-sheet effects
        for (let i = this.spriteEffects.length - 1; i >= 0; i--) {
            const eff = this.spriteEffects[i];
            eff.timer += dt;
            if (eff.timer >= eff.duration) {
                this.spriteEffects.splice(i, 1);
            }
        }

        // Update kill fades
        for (let i = this.killFades.length - 1; i >= 0; i--) {
            const kf = this.killFades[i];
            kf.timer += dt;
            kf.alpha = Math.max(0, 1 - kf.timer / 0.6);
            kf.expAlpha = Math.max(0, 1 - kf.timer / 1.2);
            kf.expY -= 30 * dt;
            if (kf.timer > 1.2) {
                this.killFades.splice(i, 1);
            }
        }
    }

    public render(ctx: CanvasRenderingContext2D, camera: Camera): void {
        ctx.save();

        // Render particles
        for (const eff of this.effects) {
            for (const p of eff.particles) {
                const sx = p.x - camera.x;
                const sy = p.y - camera.y;
                ctx.globalAlpha = p.alpha;

                if (p.kind === 'circle') {
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
                    ctx.fill();
                } else if (p.kind === 'spark') {
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = p.size * 0.5;
                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(sx + p.vx * 0.05, sy + p.vy * 0.05);
                    ctx.stroke();
                } else if (p.kind === 'ring') {
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = 2;
                    const progress = 1 - p.life / p.maxLife;
                    const radius = p.size * (0.5 + progress * 1.5);
                    ctx.beginPath();
                    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
                    ctx.stroke();
                } else if (p.kind === 'star') {
                    ctx.fillStyle = p.color;
                    ctx.font = `${Math.floor(p.size)}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('✦', sx, sy);
                }
            }
        }

        this.renderSpriteEffects(ctx, camera);

        // Render kill fades
        for (const kf of this.killFades) {
            const sx = kf.gridX * TILE_SIZE - camera.x;
            const sy = kf.gridY * TILE_SIZE - camera.y;
            ctx.globalAlpha = kf.alpha;

            // Ghost silhouette
            if (kf.image && kf.image.complete) {
                ctx.drawImage(kf.image, sx, sy, TILE_SIZE, TILE_SIZE);
            } else {
                ctx.fillStyle = kf.color;
                ctx.fillRect(sx + 8, sy + 8, TILE_SIZE - 16, TILE_SIZE - 16);
            }

            // EXP text floating up
            if (kf.expText) {
                ctx.globalAlpha = kf.expAlpha;
                ctx.fillStyle = '#ffdd00';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.font = 'bold 14px "DOSMyungjo", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const tx = sx + TILE_SIZE / 2;
                const ty = sy + kf.expY;
                ctx.strokeText(kf.expText, tx, ty);
                ctx.fillText(kf.expText, tx, ty);
            }
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════
    //  Kill Fade-Out + EXP Pop
    // ═══════════════════════════════════════════════════════════

    public spawnKillEffect(gridX: number, gridY: number, color: string, expGained: number, image?: HTMLImageElement): void {
        this.killFades.push({
            gridX, gridY, color, image,
            alpha: 1, timer: 0,
            expText: expGained > 0 ? `+${expGained} EXP` : '',
            expAlpha: 1,
            expY: 0,
        });
    }

    public spawnHitEffect(gridX: number, gridY: number, isCrit: boolean = false): void {
        this.spawnSpriteEffect(gridX, gridY, isCrit ? SPRITE_FX.critHit : SPRITE_FX.hit, isCrit ? 74 : 58);

        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        const particles: Particle[] = [];
        const count = isCrit ? 18 : 10;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (isCrit ? 90 : 55) + Math.random() * 55;
            particles.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.18 + Math.random() * 0.2,
                maxLife: 0.38,
                size: isCrit ? 4 + Math.random() * 3 : 3 + Math.random() * 2,
                color: isCrit
                    ? ['#ffdd55', '#ff6633', '#ffffff'][Math.floor(Math.random() * 3)]
                    : ['#ffd0a0', '#ff7755', '#ffffff'][Math.floor(Math.random() * 3)],
                alpha: 1,
                kind: 'spark',
            });
        }
        particles.push({
            x: cx,
            y: cy,
            vx: 0,
            vy: 0,
            life: isCrit ? 0.28 : 0.18,
            maxLife: isCrit ? 0.28 : 0.18,
            size: isCrit ? TILE_SIZE * 0.75 : TILE_SIZE * 0.45,
            color: isCrit ? '#ffcc44' : '#ffffff',
            alpha: 1,
            kind: 'ring',
        });
        this.effects.push({ particles, timer: 0, duration: isCrit ? 0.55 : 0.35 });
    }

    // ═══════════════════════════════════════════════════════════
    //  Spell Effects by Element
    // ═══════════════════════════════════════════════════════════

    public spawnFireEffect(gridX: number, gridY: number): void {
        this.spawnSpriteEffect(gridX, gridY, SPRITE_FX.fire, 80);

        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        const particles: Particle[] = [];
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 30 + Math.random() * 80;
            particles.push({
                x: cx + (Math.random() - 0.5) * 10,
                y: cy + (Math.random() - 0.5) * 10,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 40,
                life: 0.3 + Math.random() * 0.4,
                maxLife: 0.7,
                size: 3 + Math.random() * 4,
                color: ['#ff4400', '#ff8800', '#ffcc00', '#ff6600'][Math.floor(Math.random() * 4)],
                alpha: 1, kind: 'circle',
            });
        }
        this.effects.push({ particles, timer: 0, duration: 0.8 });
    }

    public spawnIceEffect(gridX: number, gridY: number): void {
        this.spawnSpriteEffect(gridX, gridY, SPRITE_FX.ice, 92);

        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        const particles: Particle[] = [];
        // Ice crystals
        for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 20 + Math.random() * 50;
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.4 + Math.random() * 0.4,
                maxLife: 0.8,
                size: 12 + Math.random() * 6,
                color: ['#88ddff', '#aaeeff', '#66ccff', '#ffffff'][Math.floor(Math.random() * 4)],
                alpha: 1, kind: 'star',
            });
        }
        // Frost ring
        particles.push({
            x: cx, y: cy, vx: 0, vy: 0,
            life: 0.6, maxLife: 0.6,
            size: TILE_SIZE * 0.6,
            color: '#88ddff', alpha: 1, kind: 'ring',
        });
        this.effects.push({ particles, timer: 0, duration: 0.9 });
    }

    public spawnThunderEffect(gridX: number, gridY: number): void {
        this.spawnSpriteEffect(gridX, gridY, SPRITE_FX.lightning, 92);

        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        const particles: Particle[] = [];
        // Lightning bolts (sparks going outward from center)
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 120;
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.15 + Math.random() * 0.2,
                maxLife: 0.35,
                size: 2 + Math.random() * 3,
                color: ['#ffff00', '#ffee88', '#ffffff'][Math.floor(Math.random() * 3)],
                alpha: 1, kind: 'spark',
            });
        }
        // Central flash
        particles.push({
            x: cx, y: cy, vx: 0, vy: 0,
            life: 0.15, maxLife: 0.15,
            size: TILE_SIZE * 0.8,
            color: '#ffff88', alpha: 1, kind: 'ring',
        });
        this.effects.push({ particles, timer: 0, duration: 0.5 });
    }

    public spawnWindEffect(gridX: number, gridY: number): void {
        this.spawnSpriteEffect(gridX, gridY, SPRITE_FX.wind, 78);

        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        const particles: Particle[] = [];
        for (let i = 0; i < 16; i++) {
            const angle = (Math.PI * 2 / 16) * i + Math.random() * 0.3;
            const dist = 5 + Math.random() * 15;
            const speed = 80 + Math.random() * 40;
            // Spiral outward
            particles.push({
                x: cx + Math.cos(angle) * dist,
                y: cy + Math.sin(angle) * dist,
                vx: Math.cos(angle + Math.PI / 2) * speed,
                vy: Math.sin(angle + Math.PI / 2) * speed,
                life: 0.3 + Math.random() * 0.3,
                maxLife: 0.6,
                size: 2 + Math.random() * 2,
                color: ['#aaffaa', '#ccffcc', '#88ff88'][Math.floor(Math.random() * 3)],
                alpha: 1, kind: 'circle',
            });
        }
        this.effects.push({ particles, timer: 0, duration: 0.7 });
    }

    public spawnEarthEffect(gridX: number, gridY: number): void {
        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        const particles: Particle[] = [];
        // Rock chunks flying up
        for (let i = 0; i < 14; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 60;
            particles.push({
                x: cx + (Math.random() - 0.5) * 20,
                y: cy + (Math.random() - 0.5) * 10,
                vx: Math.cos(angle) * speed,
                vy: -30 - Math.random() * 60,
                life: 0.4 + Math.random() * 0.3,
                maxLife: 0.7,
                size: 4 + Math.random() * 5,
                color: ['#8B7355', '#A08060', '#6B5340', '#D4A574'][Math.floor(Math.random() * 4)],
                alpha: 1, kind: 'circle',
            });
        }
        // Dust ring
        particles.push({
            x: cx, y: cy, vx: 0, vy: 0,
            life: 0.5, maxLife: 0.5,
            size: TILE_SIZE * 0.7,
            color: '#A08060', alpha: 1, kind: 'ring',
        });
        this.effects.push({ particles, timer: 0, duration: 0.8 });
    }

    public spawnHealEffect(gridX: number, gridY: number): void {
        this.spawnSpriteEffect(gridX, gridY, SPRITE_FX.heal, 64);

        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        const particles: Particle[] = [];
        // Green/golden sparkles rising
        for (let i = 0; i < 12; i++) {
            particles.push({
                x: cx + (Math.random() - 0.5) * 30,
                y: cy + 10,
                vx: (Math.random() - 0.5) * 20,
                vy: -40 - Math.random() * 30,
                life: 0.5 + Math.random() * 0.4,
                maxLife: 0.9,
                size: 14 + Math.random() * 6,
                color: ['#44ff44', '#88ff44', '#ffdd00', '#aaffaa'][Math.floor(Math.random() * 4)],
                alpha: 1, kind: 'star',
            });
        }
        // Healing ring
        particles.push({
            x: cx, y: cy, vx: 0, vy: 0,
            life: 0.6, maxLife: 0.6,
            size: TILE_SIZE * 0.5,
            color: '#44ff88', alpha: 1, kind: 'ring',
        });
        this.effects.push({ particles, timer: 0, duration: 1.0 });
    }

    public spawnDarkEffect(gridX: number, gridY: number): void {
        this.spawnSpriteEffect(gridX, gridY, SPRITE_FX.dark, 72);

        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        const particles: Particle[] = [];
        // Dark spiraling particles
        for (let i = 0; i < 14; i++) {
            const angle = (Math.PI * 2 / 14) * i;
            const speed = 30 + Math.random() * 40;
            particles.push({
                x: cx + Math.cos(angle) * 20,
                y: cy + Math.sin(angle) * 20,
                vx: -Math.cos(angle) * speed,     // inward spiral
                vy: -Math.sin(angle) * speed - 10,
                life: 0.4 + Math.random() * 0.3,
                maxLife: 0.7,
                size: 3 + Math.random() * 3,
                color: ['#8844aa', '#664488', '#aa44cc', '#cc66ff'][Math.floor(Math.random() * 4)],
                alpha: 1, kind: 'circle',
            });
        }
        this.effects.push({ particles, timer: 0, duration: 0.8 });
    }

    public spawnBuffEffect(gridX: number, gridY: number): void {
        this.spawnSpriteEffect(gridX, gridY, SPRITE_FX.buff, 54);

        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        const particles: Particle[] = [];
        // Golden sparkles rising
        for (let i = 0; i < 8; i++) {
            particles.push({
                x: cx + (Math.random() - 0.5) * 24,
                y: cy + 10,
                vx: (Math.random() - 0.5) * 15,
                vy: -50 - Math.random() * 20,
                life: 0.4 + Math.random() * 0.3,
                maxLife: 0.7,
                size: 12 + Math.random() * 6,
                color: '#ffcc00',
                alpha: 1, kind: 'star',
            });
        }
        this.effects.push({ particles, timer: 0, duration: 0.8 });
    }

    public spawnDebuffEffect(gridX: number, gridY: number): void {
        this.spawnSpriteEffect(gridX, gridY, SPRITE_FX.debuff, 62);

        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        const particles: Particle[] = [];
        // Dark particles falling down
        for (let i = 0; i < 10; i++) {
            particles.push({
                x: cx + (Math.random() - 0.5) * 30,
                y: cy - 20,
                vx: (Math.random() - 0.5) * 10,
                vy: 20 + Math.random() * 30,
                life: 0.4 + Math.random() * 0.3,
                maxLife: 0.7,
                size: 3 + Math.random() * 3,
                color: ['#aa3333', '#884488', '#666666'][Math.floor(Math.random() * 3)],
                alpha: 1, kind: 'circle',
            });
        }
        this.effects.push({ particles, timer: 0, duration: 0.8 });
    }

    /** Spawn effect by element string */
    public spawnByElement(element: string, gridX: number, gridY: number): void {
        switch (element) {
            case 'fire': this.spawnFireEffect(gridX, gridY); break;
            case 'ice': this.spawnIceEffect(gridX, gridY); break;
            case 'lightning': this.spawnThunderEffect(gridX, gridY); break;
            case 'wind': this.spawnWindEffect(gridX, gridY); break;
            case 'earth': this.spawnEarthEffect(gridX, gridY); break;
            case 'holy': this.spawnHealEffect(gridX, gridY); break;
            case 'dark': this.spawnDarkEffect(gridX, gridY); break;
            default: this.spawnFireEffect(gridX, gridY); break;
        }
    }

    private spawnSpriteEffect(gridX: number, gridY: number, frames: SpriteEffectFrame[], size: number): void {
        const duration = frames.reduce((sum, frame) => sum + frame.duration, 0);
        this.spriteEffects.push({ frames, gridX, gridY, timer: 0, duration, size });
    }

    private renderSpriteEffects(ctx: CanvasRenderingContext2D, camera: Camera): void {
        for (const effect of this.spriteEffects) {
            const frame = this.getSpriteFrame(effect);
            if (!frame) continue;

            const progress = effect.duration > 0 ? effect.timer / effect.duration : 1;
            const fadeAlpha = progress > 0.78 ? Math.max(0, 1 - (progress - 0.78) / 0.22) : 1;
            const alpha = (frame.alpha ?? 1) * fadeAlpha;
            const h = effect.size * (frame.scale ?? 1);
            const w = h * (frame.rect.w / frame.rect.h);
            const cx = effect.gridX * TILE_SIZE + TILE_SIZE / 2 - camera.x + (frame.offsetX ?? 0);
            const cy = effect.gridY * TILE_SIZE + TILE_SIZE / 2 - camera.y + (frame.offsetY ?? 0);

            DarksaberSpriteAtlas.drawSprite(ctx, frame.rect, cx - w / 2, cy - h / 2, w, h, {
                alpha,
                flipX: frame.flipX,
                rotation: frame.rotation,
            });
        }
    }

    private getSpriteFrame(effect: ActiveSpriteEffect): SpriteEffectFrame | null {
        let elapsed = effect.timer;
        for (const frame of effect.frames) {
            if (elapsed <= frame.duration) return frame;
            elapsed -= frame.duration;
        }
        return effect.frames[effect.frames.length - 1] ?? null;
    }
}
