/**
 * PartyUI — Modern vertical layout.
 * Top: 3 active squad cards side-by-side.
 * Bottom: Roster grid of available characters.
 * Drag & drop for deploy/undeploy/reorder.
 */

import { PartyManager } from '../character/PartyManager';
import { Character } from '../character/Character';
import { t } from '../i18n/LanguageManager';
import { UI } from './UITheme';

const PORT = 60;
const GAP = 14;

export class PartyUI {
    private pm: PartyManager;
    private visible = false;

    // Panel geometry
    private cx = 0;
    private cy = 0;
    private w = 660;
    private h = 380;   // dynamic — adjusted at render time

    // Hover
    private hoverChar: Character | null = null;
    private hoverAction: 'deploy' | 'undeploy' | null = null;
    private lastMx = 0;
    private lastMy = 0;
    private errorMessage = '';
    private errorTimer = 0;

    // Hit zones
    private rosterZones: { x: number; y: number; w: number; h: number; char: Character; rosterIdx: number }[] = [];
    private activeZones: { x: number; y: number; char: Character }[] = [];
    private activeSlotRects: { x: number; y: number; w: number; h: number; index: number }[] = [];

    // Drag
    private dragChar: Character | null = null;
    private dragSource: 'roster' | 'active' | null = null;
    private dragSourceIndex = -1;
    private dragStartX = 0;
    private dragStartY = 0;
    private isDragging = false;

    // RAID mode: hides roster, only shows active squad, dead chars dimmed
    public isRaidMode = false;
    // Callback when a character card is clicked (for opening char info)
    public onCharClick: ((char: Character) => void) | null = null;

    constructor(partyManager: PartyManager) {
        this.pm = partyManager;
    }

    public toggle(): void { this.visible = !this.visible; this.errorMessage = ''; }
    public isVisible(): boolean { return this.visible; }
    public setVisible(v: boolean): void { this.visible = v; }
    public show(): void { this.visible = true; }
    public hide(): void { this.visible = false; this.errorMessage = ''; }

    private showError(msg: string): void {
        this.errorMessage = msg;
        this.errorTimer = 120;
    }

    // ─── Input ──────────────────────────────────────────
    public onMouseMove(mx: number, my: number): void {
        if (!this.visible) return;
        this.lastMx = mx;
        this.lastMy = my;

        if (this.dragChar && !this.isDragging) {
            if (Math.hypot(mx - this.dragStartX, my - this.dragStartY) > 5) {
                this.isDragging = true;
            }
        }

        if (!this.isDragging) {
            this.hoverChar = null;
            this.hoverAction = null;
            for (const z of this.activeZones) {
                if (mx >= z.x && mx <= z.x + PORT && my >= z.y && my <= z.y + PORT) {
                    this.hoverChar = z.char; this.hoverAction = 'undeploy'; return;
                }
            }
            if (!this.isRaidMode) {
                for (const z of this.rosterZones) {
                    if (mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
                        this.hoverChar = z.char; this.hoverAction = 'deploy'; return;
                    }
                }
            }
        }
    }

    public onMouseDown(mx: number, my: number): void {
        if (!this.visible) return;
        // Close button (only active in Raid Mode)
        if (this.isRaidMode) {
            const closeX = this.cx + this.w / 2 - 36;
            const closeY = this.cy - this.h / 2 + 12;
            if (mx >= closeX && mx <= closeX + 24 && my >= closeY && my <= closeY + 24) {
                this.toggle(); return;
            }
        }
        if (this.hoverChar) {
            this.dragChar = this.hoverChar;
            this.dragStartX = mx;
            this.dragStartY = my;
            this.isDragging = false;
            this.dragSource = this.hoverAction === 'undeploy' ? 'active' : 'roster';
            if (this.dragSource === 'active') {
                this.dragSourceIndex = this.pm.getCharacters().findIndex(c => c === this.hoverChar);
            } else {
                // Roster — find index in the FULL roster
                this.dragSourceIndex = this.pm.getRoster().indexOf(this.hoverChar);
            }
        }
    }

    public onMouseUp(mx: number, my: number): void {
        if (!this.visible) return;
        if (!this.dragChar) return;

        if (!this.isDragging) {
            // Click = deploy/undeploy or switch active
            if (this.isRaidMode && this.dragSource === 'active' && this.dragChar) {
                // In RAID: click switches active controlled character
                if (!this.dragChar.isDead) {
                    const idx = this.pm.getCharacters().indexOf(this.dragChar);
                    if (idx >= 0) this.pm.switchTo(idx);
                }
                // Also open char info panel
                if (this.onCharClick) this.onCharClick(this.dragChar);
            } else if (!this.isRaidMode) {
                if (this.dragSource === 'roster') {
                    const ok = this.pm.deployCharacter(this.dragChar!);
                    if (!ok && this.pm.isFull()) this.showError(t('party.full'));
                } else if (this.dragSource === 'active') {
                    if (this.dragSourceIndex === 0) this.showError(t('party.cannotRemoveLead'));
                    else this.pm.unDeployCharacter(this.dragChar!.id);
                }
            }
        } else {
            // Drag & drop
            // 1. Check if dropped on an active slot
            let slot = -1;
            for (const s of this.activeSlotRects) {
                if (mx >= s.x && mx <= s.x + s.w && my >= s.y && my <= s.y + s.h) {
                    slot = s.index; break;
                }
            }
            if (slot !== -1) {
                if (this.dragSource === 'active') this.pm.swapActiveSlots(this.dragSourceIndex, slot);
                else this.pm.replaceActiveSlot(slot, this.dragChar);
            } else {
                // 2. Check if dropped on a roster zone (reorder)
                let rosterTarget = -1;
                for (const z of this.rosterZones) {
                    if (mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
                        rosterTarget = z.rosterIdx; break;
                    }
                }
                if (rosterTarget !== -1 && this.dragSource === 'roster' && this.dragSourceIndex !== rosterTarget) {
                    this.pm.swapRoster(this.dragSourceIndex, rosterTarget);
                } else if (this.dragSource === 'active') {
                    // Dropped somewhere in roster area → undeploy
                    const x0 = this.cx - this.w / 2;
                    const y0 = this.cy - this.h / 2;
                    if (mx >= x0 && mx <= x0 + this.w && my >= y0 + 170) {
                        if (this.dragSourceIndex === 0) this.showError(t('party.cannotRemoveLead'));
                        else this.pm.unDeployCharacter(this.dragChar.id);
                    }
                }
            }
        }

        this.dragChar = null;
        this.isDragging = false;
        this.dragSource = null;
        this.dragSourceIndex = -1;
        this.onMouseMove(mx, my);
    }

    // ─── Render ─────────────────────────────────────────
    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;

        const roster = this.pm.getRoster();
        const active = this.pm.getCharacters();
        const available = this.isRaidMode ? [] : roster.filter(c => !active.includes(c));

        // Dynamic height: active section + roster section
        const activeH = 130;                         // 3 cards top
        if (this.isRaidMode) {
            this.h = 56 + activeH + 30;  // compact: title + active + bottom pad
        } else {
            const rosterCols = Math.max(3, Math.floor((this.w - 40) / (PORT + GAP)));
            const rosterRows = Math.max(1, Math.ceil(available.length / rosterCols));
            const rosterH = rosterRows * (PORT + GAP + 22) + 10;
            this.h = 56 + activeH + 34 + rosterH + 30;  // title + active + gap + roster + bottom pad
        }

        this.cx = canvasW / 2;
        this.cy = canvasH / 2;
        const x0 = this.cx - this.w / 2;
        const y0 = this.cy - this.h / 2;




        // Main glass panel
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 8;
        ctx.fillStyle = 'rgba(20, 22, 30, 0.90)';
        ctx.beginPath();
        ctx.roundRect(x0, y0, this.w, this.h, 14);
        ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = 'rgba(200,170,80,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // Title
        ctx.fillStyle = '#c8a84e';
        ctx.font = `bold 20px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.fillText(t('party.title'), this.cx, y0 + 30);

        // Close button (only visible in Raid Mode)
        if (this.isRaidMode) {
            const closeX = x0 + this.w - 36;
            const closeY = y0 + 12;
            ctx.beginPath();
            ctx.arc(closeX + 12, closeY + 12, 12, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(180,50,50,0.7)';
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px "DOSMyungjo", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✕', closeX + 12, closeY + 12);
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'start';
        }

        this.rosterZones = [];
        this.activeZones = [];
        this.activeSlotRects = [];

        // ═══ ACTIVE SQUAD (top) ═══════════════════════
        const squadY = y0 + 44;
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = `bold 11px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.fillText(t('party.active'), this.cx, squadY);
        ctx.textAlign = 'start';

        const cardW = Math.floor((this.w - 40 - GAP * 2) / 3);
        const cardH = 96;
        const cardY = squadY + 10;

        for (let i = 0; i < 3; i++) {
            const cardX = x0 + 20 + i * (cardW + GAP);
            this.activeSlotRects.push({ x: cardX, y: cardY, w: cardW, h: cardH, index: i });

            const char = active[i];
            const isLeader = i === 0;

            // Card bg
            ctx.fillStyle = isLeader ? 'rgba(200,170,80,0.10)' : 'rgba(255,255,255,0.04)';
            ctx.beginPath();
            ctx.roundRect(cardX, cardY, cardW, cardH, 8);
            ctx.fill();
            ctx.strokeStyle = isLeader ? 'rgba(200,170,80,0.35)' : 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            ctx.stroke();

            if (char) {
                this.activeZones.push({ x: cardX + 8, y: cardY + 8, char });
                const dragged = this.isDragging && this.dragChar === char;
                ctx.globalAlpha = dragged ? 0.3 : char.isDead ? 0.4 : 1;

                // Portrait
                this.drawMiniPortrait(ctx, cardX + 8, cardY + 8, char, this.hoverChar === char && !dragged);

                // Info
                const infoX = cardX + PORT + 16;
                if (isLeader) {
                    ctx.fillStyle = '#c8a84e';
                    ctx.font = `bold 10px ${UI.fontPrimary}`;
                ctx.fillText('★ ' + t('party.leader'), infoX, cardY + 20);
                }
                ctx.fillStyle = '#fff';
                ctx.font = `bold 14px ${UI.fontPrimary}`;
                ctx.fillText(char.name, infoX, cardY + (isLeader ? 38 : 30));

                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.font = `11px ${UI.fontPrimary}`;
                ctx.fillText(`레벨${char.level}`, infoX, cardY + (isLeader ? 52 : 44));

                // HP bar
                const barY = cardY + (isLeader ? 64 : 56); // Adjusted from 58/50
                const barW = cardW - PORT - 24;
                const hpR = Math.max(0, Math.min(1, char.stats.hp / char.stats.maxHp));
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.beginPath(); ctx.roundRect(infoX, barY, barW, 6, 3); ctx.fill();
                if (hpR > 0) {
                    ctx.fillStyle = hpR > 0.3 ? '#4caf50' : '#ff5252';
                    ctx.beginPath(); ctx.roundRect(infoX, barY, barW * hpR, 6, 3); ctx.fill();
                }
                // MP bar
                const mpR = Math.max(0, Math.min(1, char.stats.mp / char.stats.maxMp));
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.beginPath(); ctx.roundRect(infoX, barY + 9, barW, 5, 2); ctx.fill();
                if (mpR > 0) {
                    ctx.fillStyle = '#42a5f5';
                    ctx.beginPath(); ctx.roundRect(infoX, barY + 9, barW * mpR, 5, 2); ctx.fill();
                }

                ctx.globalAlpha = 1;

                // Dead overlay
                if (char.isDead) {
                    ctx.fillStyle = 'rgba(180,30,30,0.5)';
                    ctx.beginPath();
                    ctx.roundRect(cardX, cardY, cardW, cardH, 8);
                    ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 24px "DOSMyungjo", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('💀', cardX + cardW / 2, cardY + cardH / 2);
                    ctx.textBaseline = 'alphabetic';
                    ctx.textAlign = 'start';
                }
                // Active indicator (current controlled char)
                if (i === this.pm.getActiveIndex() && !char.isDead) {
                    ctx.strokeStyle = '#4caf50';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.roundRect(cardX - 1, cardY - 1, cardW + 2, cardH + 2, 9);
                    ctx.stroke();
                }
            } else {
                // Empty slot
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.font = `11px ${UI.fontPrimary}`;
                ctx.textAlign = 'center';
                ctx.fillText('빈 슬롯', cardX + cardW / 2, cardY + cardH / 2 + 4);
                ctx.textAlign = 'start';
            }
        }

        // ═══ ROSTER — only in Lobby ══════════════════
        if (!this.isRaidMode) {
            // ═══ Divider ══════════════════════════════════
            const divY = cardY + cardH + 12;
            ctx.strokeStyle = 'rgba(200,170,80,0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x0 + 20, divY);
            ctx.lineTo(x0 + this.w - 20, divY);
            ctx.stroke();

            // ═══ ROSTER (bottom) ══════════════════════════
            const rosterLabelY = divY + 16;
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.font = `bold 11px ${UI.fontPrimary}`;
            ctx.textAlign = 'center';
            ctx.fillText(t('party.roster'), this.cx, rosterLabelY);
            ctx.textAlign = 'start';

            const rosterCols = Math.max(3, Math.floor((this.w - 40) / (PORT + GAP)));
            const rosterStartY = rosterLabelY + 10;
            const rosterStartX = x0 + 20;
            const cellW = PORT + GAP;
            const cellH = PORT + 22;

            for (let i = 0; i < available.length; i++) {
                const char = available[i];
                const col = i % rosterCols;
                const row = Math.floor(i / rosterCols);
                const px = rosterStartX + col * cellW;
                const py = rosterStartY + row * (cellH + GAP);
                const fullRosterIdx = roster.indexOf(char);

                this.rosterZones.push({ x: px - 4, y: py - 4, w: PORT + 8, h: cellH + 4, char, rosterIdx: fullRosterIdx });

                const dragged = this.isDragging && this.dragChar === char;
                ctx.globalAlpha = dragged ? 0.3 : 1;
                this.drawRosterCard(ctx, px, py, char, this.hoverChar === char && !dragged);
                ctx.globalAlpha = 1;
            }
        }

        // Error
        if (this.errorTimer > 0 && this.errorMessage) {
            this.errorTimer--;
            ctx.fillStyle = `rgba(255,100,100,${Math.min(1, this.errorTimer / 60)})`;
            ctx.font = `bold 13px ${UI.fontPrimary}`;
            ctx.textAlign = 'center';
            ctx.fillText(this.errorMessage, this.cx, y0 + this.h - 10);
            ctx.textAlign = 'start';
        }

        // Tooltip
        if (this.hoverChar && !this.isDragging) this.renderTooltip(ctx);

        // Drag ghost
        if (this.isDragging && this.dragChar) {
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 20;
            ctx.globalAlpha = 0.85;
            this.drawRosterCard(ctx, this.lastMx - PORT / 2, this.lastMy - PORT / 2, this.dragChar, true);
            ctx.restore();
        }
    }

    // ─── Helpers ────────────────────────────────────────

    private drawRosterCard(ctx: CanvasRenderingContext2D, x: number, y: number, char: Character, hover: boolean): void {
        // Glass card wrapper
        ctx.fillStyle = hover ? 'rgba(200,170,80,0.12)' : 'rgba(255,255,255,0.04)';
        ctx.beginPath();
        ctx.roundRect(x - 4, y - 4, PORT + 8, PORT + 26, 6);
        ctx.fill();
        ctx.strokeStyle = hover ? 'rgba(200,170,80,0.4)' : 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();

        this.drawMiniPortrait(ctx, x, y, char, hover);

        ctx.fillStyle = '#ccc';
        ctx.font = `11px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.fillText(char.name, x + PORT / 2, y + PORT + 16);
        ctx.textAlign = 'start';
    }

    private drawMiniPortrait(ctx: CanvasRenderingContext2D, x: number, y: number, char: Character, hover: boolean): void {
        ctx.fillStyle = hover ? 'rgba(50,45,35,0.9)' : 'rgba(30,28,22,0.9)';
        ctx.beginPath();
        ctx.roundRect(x, y, PORT, PORT, 5);
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, PORT - 4, PORT - 4, 3);
        ctx.clip();

        // Use real portrait image if loaded
        if (char.portraitImage && char.portraitLoaded) {
            ctx.drawImage(char.portraitImage, x + 2, y + 2, PORT - 4, PORT - 4);
        } else {
            // Fallback: placeholder
            const cx = x + PORT / 2;
            const cy = y + PORT / 2;
            const s = 1.3;
            const px = (ox: number, oy: number, ow: number, oh: number, color: string) => {
                ctx.fillStyle = color;
                ctx.fillRect(cx + ox * s, cy - 8 + oy * s, ow * s, oh * s);
            };
            px(-3, -2, 6, 5, '#d4a574');
            px(-4, -3, 8, 2, '#3a2a1a');
            px(-4, 4, 8, 9, '#4a3a28');
        }
        ctx.restore();

        // Level badge
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(x, y + PORT - 14, PORT, 14, [0, 0, 5, 5]);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold 9px ${UI.fontMono}`;
        ctx.textAlign = 'center';
        ctx.fillText(`레벨${char.level}`, x + PORT / 2, y + PORT - 3);
        ctx.textAlign = 'start';
    }

    private renderTooltip(ctx: CanvasRenderingContext2D): void {
        if (!this.hoverChar) return;
        const pad = 8;
        const lh = 15;
        const lines = [
            `${this.hoverChar.name} (레벨${this.hoverChar.level})`,
            `HP: ${this.hoverChar.stats.hp}/${this.hoverChar.stats.maxHp}`,
            `MP: ${this.hoverChar.stats.mp}/${this.hoverChar.stats.maxMp}`,
            `공격: ${this.hoverChar.stats.atk} | 방어: ${this.hoverChar.stats.def}`
        ];

        ctx.font = `12px ${UI.fontPrimary}`;
        let maxW = 0;
        for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width);

        const bw = maxW + pad * 2;
        const bh = lines.length * lh + pad * 2;
        let tx = this.lastMx + 15;
        let ty = this.lastMy + 15;
        if (tx + bw > this.cx * 2) tx = this.lastMx - bw - 15;
        if (ty + bh > this.cy * 2) ty = this.lastMy - bh - 15;

        ctx.fillStyle = 'rgba(15,18,24,0.92)';
        ctx.beginPath();
        ctx.roundRect(tx, ty, bw, bh, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,170,80,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = 'start';
        for (let i = 0; i < lines.length; i++) {
            ctx.fillStyle = i === 0 ? '#c8a84e' : '#bbb';
            ctx.fillText(lines[i], tx + pad, ty + pad + i * lh + 11);
        }
    }
}
