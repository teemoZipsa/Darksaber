/**
 * EffectManager — Visual particle effects for spell casts and kills.
 * Renders canvas-based particle animations tied to grid positions.
 */

import { Camera } from '../engine/Camera';

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

export class EffectManager {
    private effects: ActiveEffect[] = [];
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
}
