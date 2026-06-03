/**
 * EffectManager — Visual particle effects for spell casts and kills.
 * Renders canvas-based particle animations tied to grid positions.
 */

import { Camera } from '../engine/Camera';
import type { Skill } from '../data/SkillDB';
import { getSkillVisualProfile, type SkillVisualPhase, type SkillVisualProfile } from '../data/SkillVisualProfiles';
import { DarksaberSpriteAtlas, type DarksaberSheetId, type SpriteRect } from './DarksaberSpriteAtlas';

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
    glyph?: {
        text: string;
        color: string;
        gridX: number;
        gridY: number;
        size: number;
        offsetY: number;
    };
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

interface KillSpriteSource {
    image?: HTMLImageElement;
    imageLoaded?: boolean;
    walkSprite?: {
        image: HTMLImageElement;
        frameWidth: number;
        frameHeight: number;
        frameCount: number;
        rowByFacing: Record<string, number>;
        renderScale: number;
    };
    walkSpriteLoaded?: boolean;
    facing?: string;
}

interface KillSpriteFrame {
    image: HTMLImageElement;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    renderScale: number;
}

interface KillShard {
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    dx: number;
    dy: number;
    dw: number;
    dh: number;
    vx: number;
    vy: number;
    spin: number;
}

// Kill fade-out tracking
interface KillFade {
    gridX: number;
    gridY: number;
    alpha: number;
    color: string;
    sprite?: KillSpriteFrame;
    shards: KillShard[];
    timer: number;
    expText: string;
    expAlpha: number;
    expY: number;
}

const spriteRect = (sheet: DarksaberSheetId, x: number, y: number, w: number, h: number): SpriteRect => ({ sheet, x, y, w, h });
const fx2 = (x: number, y: number, w: number, h: number): SpriteRect => spriteRect('fx2', x, y, w, h);
const fx = (x: number, y: number, w: number, h: number): SpriteRect => spriteRect('fx', x, y, w, h);
const micon = (col: number, row: number): SpriteRect => spriteRect('micon', col * 32, row * 32, 32, 32);

const SPRITE_EFFECTS = {
    hit: [
        { rect: fx2(73, 68, 46, 40), duration: 0.08, scale: 0.95 },
        { rect: fx2(123, 68, 44, 40), duration: 0.08, scale: 1.1 },
        { rect: fx2(73, 138, 46, 40), duration: 0.09, scale: 1.2, alpha: 0.9 },
    ],
    critHit: [
        { rect: fx2(73, 68, 46, 40), duration: 0.06, scale: 1.1 },
        { rect: fx2(123, 68, 44, 40), duration: 0.06, scale: 1.35 },
        { rect: fx2(73, 138, 46, 40), duration: 0.08, scale: 1.55 },
        { rect: fx2(123, 138, 44, 40), duration: 0.08, scale: 1.65, alpha: 0.85 },
    ],
    fire: [
        { rect: fx2(631, 581, 49, 62), duration: 0.08, scale: 0.95 },
        { rect: fx2(695, 582, 56, 60), duration: 0.08, scale: 1.05 },
        { rect: fx2(769, 581, 49, 61), duration: 0.08, scale: 1.12 },
        { rect: fx2(833, 582, 56, 60), duration: 0.1, scale: 1.18 },
        { rect: fx(480, 896, 72, 64), duration: 0.08, scale: 1.05, alpha: 0.82 },
    ],
    ice: [
        { rect: fx2(135, 489, 31, 53), duration: 0.08, scale: 0.75 },
        { rect: fx2(254, 461, 42, 80), duration: 0.08, scale: 0.92 },
        { rect: fx2(365, 437, 70, 110), duration: 0.1, scale: 1.08 },
        { rect: fx2(474, 425, 102, 122), duration: 0.12, scale: 1.14 },
    ],
    lightning: [
        { rect: fx(50, 208, 50, 280), duration: 0.06, scale: 0.86, offsetY: -50 },
        { rect: fx(100, 208, 47, 350), duration: 0.07, scale: 1, offsetY: -68 },
        { rect: fx(150, 208, 46, 350), duration: 0.07, scale: 1, offsetY: -68 },
        { rect: fx(200, 208, 46, 350), duration: 0.1, scale: 1.02, offsetY: -68, alpha: 0.82 },
    ],
    wind: [
        { rect: fx2(3, 828, 64, 68), duration: 0.07, scale: 0.92 },
        { rect: fx2(71, 830, 66, 66), duration: 0.07, scale: 1 },
        { rect: fx2(138, 832, 69, 63), duration: 0.07, scale: 1.08 },
        { rect: fx2(210, 828, 64, 69), duration: 0.08, scale: 1.16 },
    ],
    heal: [
        { rect: fx2(541, 34, 22, 22), duration: 0.07, scale: 0.75, offsetY: -10 },
        { rect: fx2(541, 64, 22, 22), duration: 0.08, scale: 0.92, offsetY: -16 },
        { rect: fx2(541, 94, 23, 23), duration: 0.09, scale: 1.08, offsetY: -22 },
        { rect: fx2(541, 125, 25, 25), duration: 0.1, scale: 1.18, offsetY: -26 },
        { rect: micon(11, 3), duration: 0.08, scale: 0.65, offsetY: -24, alpha: 0.9 },
    ],
    dark: [
        { rect: fx2(16, 745, 46, 54), duration: 0.08, scale: 0.95 },
        { rect: fx2(86, 745, 47, 54), duration: 0.08, scale: 1.05 },
        { rect: fx2(154, 745, 48, 54), duration: 0.1, scale: 1.16 },
    ],
    buff: [
        { rect: micon(7, 0), duration: 0.08, scale: 0.74, offsetY: -24 },
        { rect: fx(440, 480, 96, 96), duration: 0.12, scale: 1.04, alpha: 0.82 },
        { rect: micon(11, 2), duration: 0.1, scale: 0.82, offsetY: -26, alpha: 0.9 },
    ],
    debuff: [
        { rect: micon(17, 2), duration: 0.08, scale: 0.72, offsetY: -18 },
        { rect: fx(536, 384, 96, 96), duration: 0.12, scale: 1.06, alpha: 0.8 },
        { rect: micon(10, 1), duration: 0.1, scale: 0.84, offsetY: -10, alpha: 0.9 },
    ],
    earth: [
        { rect: fx(771, 264, 130, 129), duration: 0.1, scale: 0.9, alpha: 0.85 },
        { rect: fx(733, 451, 216, 215), duration: 0.14, scale: 0.96, alpha: 0.78 },
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
            kf.alpha = Math.max(0, 1 - kf.timer / 0.72);
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

            if (eff.glyph) {
                const progress = eff.duration > 0 ? eff.timer / eff.duration : 1;
                const alpha = progress < 0.18
                    ? progress / 0.18
                    : progress > 0.72
                        ? Math.max(0, 1 - (progress - 0.72) / 0.28)
                        : 1;
                const sx = eff.glyph.gridX * TILE_SIZE + TILE_SIZE / 2 - camera.x;
                const sy = eff.glyph.gridY * TILE_SIZE + TILE_SIZE / 2 - camera.y + eff.glyph.offsetY - progress * 14;
                ctx.globalAlpha = alpha;
                ctx.font = `bold ${Math.floor(eff.glyph.size)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
                ctx.lineWidth = Math.max(3, eff.glyph.size * 0.1);
                ctx.strokeText(eff.glyph.text, sx, sy);
                ctx.fillStyle = eff.glyph.color;
                ctx.fillText(eff.glyph.text, sx, sy);
            }
        }

        this.renderSpriteEffects(ctx, camera);

        // Render kill fades
        for (const kf of this.killFades) {
            const sx = kf.gridX * TILE_SIZE - camera.x;
            const sy = kf.gridY * TILE_SIZE - camera.y;
            const progress = Math.min(1, kf.timer / 0.72);
            const ease = 1 - Math.pow(1 - progress, 2);

            if (kf.sprite && kf.shards.length > 0) {
                const renderW = TILE_SIZE * kf.sprite.renderScale;
                const renderH = TILE_SIZE * kf.sprite.renderScale;
                const baseX = sx + (TILE_SIZE - renderW) / 2;
                const baseY = sy + (TILE_SIZE - renderH) / 2;
                ctx.imageSmoothingEnabled = false;
                for (const shard of kf.shards) {
                    const dx = baseX + shard.dx + shard.vx * ease;
                    const dy = baseY + shard.dy + shard.vy * ease + 10 * progress * progress;
                    const cx = dx + shard.dw / 2;
                    const cy = dy + shard.dh / 2;
                    ctx.save();
                    ctx.globalAlpha = kf.alpha;
                    ctx.translate(cx, cy);
                    ctx.rotate(shard.spin * ease);
                    ctx.drawImage(
                        kf.sprite.image,
                        shard.sx,
                        shard.sy,
                        shard.sw,
                        shard.sh,
                        -shard.dw / 2,
                        -shard.dh / 2,
                        shard.dw,
                        shard.dh
                    );
                    ctx.restore();
                }
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

    public spawnKillEffect(
        gridX: number,
        gridY: number,
        color: string,
        expGained: number,
        source?: HTMLImageElement | KillSpriteSource
    ): void {
        const sprite = this.resolveKillSpriteFrame(source);
        this.killFades.push({
            gridX, gridY, color, sprite,
            shards: sprite ? this.createKillShards(sprite) : [],
            alpha: 1, timer: 0,
            expText: expGained > 0 ? `+${expGained} EXP` : '',
            expAlpha: 1,
            expY: 0,
        });
        this.spawnDeathBurst(gridX, gridY, color, !!sprite);
    }

    private resolveKillSpriteFrame(source?: HTMLImageElement | KillSpriteSource): KillSpriteFrame | undefined {
        if (!source) return undefined;

        if (this.isImageElement(source)) {
            if (!source.complete || source.naturalWidth <= 0 || source.naturalHeight <= 0) return undefined;
            return {
                image: source,
                sx: 0,
                sy: 0,
                sw: source.naturalWidth,
                sh: source.naturalHeight,
                renderScale: 1,
            };
        }

        const walk = source.walkSprite;
        if (walk && source.walkSpriteLoaded && walk.image.complete) {
            const frame = Math.min(1, Math.max(0, walk.frameCount - 1));
            const row = walk.rowByFacing[source.facing ?? 'down'] ?? walk.rowByFacing.down ?? 0;
            return {
                image: walk.image,
                sx: frame * walk.frameWidth,
                sy: row * walk.frameHeight,
                sw: walk.frameWidth,
                sh: walk.frameHeight,
                renderScale: walk.renderScale,
            };
        }

        const image = source.image;
        if (image && source.imageLoaded !== false && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
            return {
                image,
                sx: 0,
                sy: 0,
                sw: image.naturalWidth,
                sh: image.naturalHeight,
                renderScale: 1,
            };
        }

        return undefined;
    }

    private isImageElement(source: HTMLImageElement | KillSpriteSource): source is HTMLImageElement {
        return typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement;
    }

    private createKillShards(sprite: KillSpriteFrame): KillShard[] {
        const shards: KillShard[] = [];
        const cols = 2;
        const rows = 3;
        const renderW = TILE_SIZE * sprite.renderScale;
        const renderH = TILE_SIZE * sprite.renderScale;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const sw = sprite.sw / cols;
                const sh = sprite.sh / rows;
                const dx = (renderW / cols) * col;
                const dy = (renderH / rows) * row;
                const side = col === 0 ? -1 : 1;
                const verticalBias = row - 1;
                shards.push({
                    sx: sprite.sx + sw * col,
                    sy: sprite.sy + sh * row,
                    sw,
                    sh,
                    dx,
                    dy,
                    dw: renderW / cols,
                    dh: renderH / rows,
                    vx: side * (8 + row * 2),
                    vy: -10 + verticalBias * 6,
                    spin: side * (0.18 + row * 0.06),
                });
            }
        }
        return shards;
    }

    private spawnDeathBurst(gridX: number, gridY: number, color: string, hasSprite: boolean): void {
        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        const particles: Particle[] = [{
            x: cx,
            y: cy,
            vx: 0,
            vy: 0,
            life: 0.34,
            maxLife: 0.34,
            size: hasSprite ? 18 : 14,
            color: 'rgba(70, 40, 28, 0.9)',
            alpha: 1,
            kind: 'ring',
        }];

        const count = hasSprite ? 18 : 24;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 28 + Math.random() * 58;
            particles.push({
                x: cx + Math.cos(angle) * 6,
                y: cy + Math.sin(angle) * 5,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 18,
                life: 0.22 + Math.random() * 0.28,
                maxLife: 0.5,
                size: 2 + Math.random() * 2.5,
                color: Math.random() > 0.35 ? color : '#2b1712',
                alpha: 1,
                kind: Math.random() > 0.45 ? 'spark' : 'circle',
            });
        }

        this.effects.push({ particles, timer: 0, duration: 0.52 });
    }

    public spawnHitEffect(gridX: number, gridY: number, isCrit: boolean = false): void {
        this.spawnSpriteEffect(gridX, gridY, isCrit ? SPRITE_EFFECTS.critHit : SPRITE_EFFECTS.hit, isCrit ? 74 : 58);

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
        this.spawnSpriteEffect(gridX, gridY, SPRITE_EFFECTS.fire, 80);

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
        this.spawnSpriteEffect(gridX, gridY, SPRITE_EFFECTS.ice, 92);

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
        this.spawnSpriteEffect(gridX, gridY, SPRITE_EFFECTS.lightning, 154);

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
        this.spawnSpriteEffect(gridX, gridY, SPRITE_EFFECTS.wind, 78);

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
        this.spawnSpriteEffect(gridX, gridY, SPRITE_EFFECTS.earth, 86);

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
        this.spawnSpriteEffect(gridX, gridY, SPRITE_EFFECTS.heal, 64);

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
        this.spawnSpriteEffect(gridX, gridY, SPRITE_EFFECTS.dark, 72);

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
        this.spawnSpriteEffect(gridX, gridY, SPRITE_EFFECTS.buff, 58);

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
        this.spawnSpriteEffect(gridX, gridY, SPRITE_EFFECTS.debuff, 62);

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

    public spawnSkillEffect(skill: Skill, gridX: number, gridY: number, phase: SkillVisualPhase = 'impact'): void {
        const profile = getSkillVisualProfile(skill);
        const phaseScale = phase === 'cast' ? 0.72 : 1;
        const spriteFrames = SPRITE_EFFECTS[profile.spriteEffect] ?? SPRITE_EFFECTS.hit;
        this.spawnSpriteEffect(gridX, gridY, spriteFrames, Math.max(42, Math.round(profile.spriteSize * phaseScale)));

        const particles = this.createSkillParticles(profile, gridX, gridY, phaseScale);
        for (let i = 0; i < Math.max(0, Math.round(profile.ringCount * phaseScale)); i++) {
            particles.push({
                x: gridX * TILE_SIZE + TILE_SIZE / 2,
                y: gridY * TILE_SIZE + TILE_SIZE / 2,
                vx: 0,
                vy: 0,
                life: profile.duration * (0.45 + i * 0.12),
                maxLife: profile.duration * (0.45 + i * 0.12),
                size: TILE_SIZE * (0.45 + i * 0.18 + skill.aoeRadius * 0.1) * phaseScale,
                color: profile.palette[i % profile.palette.length] ?? '#ffffff',
                alpha: 1,
                kind: 'ring',
            });
        }

        this.effects.push({
            particles,
            timer: 0,
            duration: profile.duration,
            glyph: {
                text: profile.glyph,
                color: profile.palette[0] ?? '#ffffff',
                gridX,
                gridY,
                size: Math.max(18, Math.round((skill.type === 'aoe' ? 28 : 22) * phaseScale)),
                offsetY: phase === 'cast' ? -24 : -32,
            },
        });
    }

    private createSkillParticles(profile: SkillVisualProfile, gridX: number, gridY: number, scale: number): Particle[] {
        const cx = gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = gridY * TILE_SIZE + TILE_SIZE / 2;
        const count = Math.max(4, Math.round(profile.particleCount * scale));
        const particles: Particle[] = [];
        const color = (index: number) => profile.palette[index % profile.palette.length] ?? '#ffffff';

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.45;
            const speed = (35 + Math.random() * 70) * scale;
            let x = cx + (Math.random() - 0.5) * 14;
            let y = cy + (Math.random() - 0.5) * 14;
            let vx = Math.cos(angle) * speed;
            let vy = Math.sin(angle) * speed;
            let kind: Particle['kind'] = 'circle';
            let size = (3 + Math.random() * 4) * scale;
            let life = 0.32 + Math.random() * 0.38;

            switch (profile.motion) {
                case 'slash':
                    x = cx - TILE_SIZE * 0.35 + Math.random() * TILE_SIZE * 0.7;
                    y = cy - TILE_SIZE * 0.22 + (x - cx) * 0.45 + (Math.random() - 0.5) * 10;
                    vx = 90 * scale + Math.random() * 70;
                    vy = 35 * scale + Math.random() * 35;
                    kind = 'spark';
                    size = (3 + Math.random() * 3) * scale;
                    life = 0.18 + Math.random() * 0.2;
                    break;
                case 'pierce':
                    x = cx - TILE_SIZE * 0.48 + Math.random() * TILE_SIZE * 0.18;
                    y = cy + (Math.random() - 0.5) * 14;
                    vx = (110 + Math.random() * 90) * scale;
                    vy = (Math.random() - 0.5) * 18;
                    kind = 'spark';
                    life = 0.22 + Math.random() * 0.22;
                    break;
                case 'charge':
                    x = cx - TILE_SIZE * 0.6 + Math.random() * TILE_SIZE * 0.25;
                    y = cy + (Math.random() - 0.5) * 26;
                    vx = (80 + Math.random() * 90) * scale;
                    vy = (Math.random() - 0.5) * 28;
                    kind = i % 3 === 0 ? 'spark' : 'circle';
                    break;
                case 'rain':
                    x = cx + (Math.random() - 0.5) * TILE_SIZE * 1.45;
                    y = cy - TILE_SIZE * (0.9 + Math.random() * 0.7);
                    vx = (Math.random() - 0.5) * 30;
                    vy = (95 + Math.random() * 110) * scale;
                    kind = i % 2 === 0 ? 'spark' : 'star';
                    life = 0.35 + Math.random() * 0.32;
                    size = (8 + Math.random() * 7) * scale;
                    break;
                case 'spiral':
                    x = cx + Math.cos(angle) * (8 + Math.random() * 18);
                    y = cy + Math.sin(angle) * (8 + Math.random() * 18);
                    vx = Math.cos(angle + Math.PI / 2) * speed;
                    vy = Math.sin(angle + Math.PI / 2) * speed - 12;
                    kind = i % 4 === 0 ? 'star' : 'circle';
                    size = (5 + Math.random() * 7) * scale;
                    break;
                case 'ward':
                    x = cx + (Math.random() - 0.5) * TILE_SIZE * 0.8;
                    y = cy + TILE_SIZE * 0.3;
                    vx = (Math.random() - 0.5) * 24;
                    vy = (-45 - Math.random() * 55) * scale;
                    kind = 'star';
                    size = (10 + Math.random() * 8) * scale;
                    life = 0.48 + Math.random() * 0.45;
                    break;
                case 'drain':
                    x = cx + Math.cos(angle) * (TILE_SIZE * (0.55 + Math.random() * 0.25));
                    y = cy + Math.sin(angle) * (TILE_SIZE * (0.55 + Math.random() * 0.25));
                    vx = (cx - x) * (1.7 + Math.random());
                    vy = (cy - y) * (1.7 + Math.random()) - 16;
                    kind = i % 5 === 0 ? 'star' : 'circle';
                    break;
                case 'mist':
                    x = cx + (Math.random() - 0.5) * TILE_SIZE;
                    y = cy - TILE_SIZE * 0.45 + Math.random() * TILE_SIZE * 0.5;
                    vx = (Math.random() - 0.5) * 22;
                    vy = (15 + Math.random() * 45) * scale;
                    kind = 'circle';
                    size = (5 + Math.random() * 8) * scale;
                    life = 0.5 + Math.random() * 0.45;
                    break;
                case 'quake':
                    x = cx + (Math.random() - 0.5) * TILE_SIZE;
                    y = cy + TILE_SIZE * 0.25 + Math.random() * 8;
                    vx = (Math.random() - 0.5) * 85 * scale;
                    vy = (-30 - Math.random() * 90) * scale;
                    kind = i % 4 === 0 ? 'spark' : 'circle';
                    size = (4 + Math.random() * 6) * scale;
                    break;
                case 'nova':
                case 'burst':
                default:
                    kind = i % 4 === 0 ? 'star' : i % 3 === 0 ? 'spark' : 'circle';
                    size = (profile.motion === 'nova' ? 5 : 3) + Math.random() * 6;
                    break;
            }

            particles.push({
                x,
                y,
                vx,
                vy,
                life,
                maxLife: life,
                size,
                color: color(i),
                alpha: 1,
                kind,
            });
        }

        return particles;
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
