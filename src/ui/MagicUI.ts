/**
 * MagicUI — Spell selection panel that appears when "Magic" is clicked
 * in the action menu. Shows learned skills based on character class & tier.
 * Glass-panel style consistent with the game's UI theme.
 * Supports drag-to-move by grabbing the header.
 */

import { Skill, getLearnedSkills } from '../data/SkillDB';
import { UI, drawGlassPanel } from './UITheme';

export class MagicUI {
    private visible = false;
    private skills: Skill[] = [];
    private hoveredIndex = -1;
    private scrollOffset = 0;
    private currentMp = 0;
    private maxMp = 0;

    // Layout constants
    private readonly PANEL_W = 260;
    private readonly ROW_H = 36;
    private readonly MAX_VISIBLE = 7;
    private readonly HEADER_H = 34;

    // Cached position
    private panelX = 0;
    private panelY = 0;
    private panelH = 0;
    private positionSet = false; // true after first show or drag

    // Drag state
    private dragging = false;
    private dragOffX = 0;
    private dragOffY = 0;

    // Callback
    public onSkillSelect: ((skill: Skill) => void) | null = null;

    public show(classId: string, characterTier: number, mp: number, maxMp: number): void {
        this.skills = getLearnedSkills(classId, characterTier);
        this.currentMp = mp;
        this.maxMp = maxMp;
        this.hoveredIndex = -1;
        this.scrollOffset = 0;
        this.visible = true;
        // Don't reset position if user already dragged
    }

    public hide(): void {
        this.visible = false;
        this.hoveredIndex = -1;
        this.dragging = false;
    }

    public isVisible(): boolean { return this.visible; }

    public updateMp(mp: number): void {
        this.currentMp = mp;
    }

    public onMouseMove(mx: number, my: number): void {
        if (!this.visible) return;

        // Handle drag
        if (this.dragging) {
            this.panelX = mx - this.dragOffX;
            this.panelY = my - this.dragOffY;
            this.positionSet = true;
            return;
        }

        this.hoveredIndex = -1;
        const listY = this.panelY + this.HEADER_H;
        if (mx >= this.panelX && mx <= this.panelX + this.PANEL_W &&
            my >= listY && my <= listY + this.MAX_VISIBLE * this.ROW_H) {
            const row = Math.floor((my - listY) / this.ROW_H);
            const idx = row + this.scrollOffset;
            if (idx >= 0 && idx < this.skills.length) {
                this.hoveredIndex = idx;
            }
        }
    }

    public onMouseDown(mx: number, my: number): boolean {
        if (!this.visible) return false;

        // Check if click is inside panel
        if (mx < this.panelX || mx > this.panelX + this.PANEL_W ||
            my < this.panelY || my > this.panelY + this.panelH) {
            this.hide();
            return false;
        }

        // Close button (top-right of header)
        const closeBtnX = this.panelX + this.PANEL_W - 24;
        const closeBtnY = this.panelY + 4;
        if (mx >= closeBtnX && mx <= closeBtnX + 20 &&
            my >= closeBtnY && my <= closeBtnY + 20) {
            this.hide();
            return true;
        }

        // Header drag
        if (my >= this.panelY && my <= this.panelY + this.HEADER_H &&
            mx >= this.panelX && mx <= this.panelX + this.PANEL_W - 24) {
            this.dragging = true;
            this.dragOffX = mx - this.panelX;
            this.dragOffY = my - this.panelY;
            return true;
        }

        // Skill row click
        if (this.hoveredIndex >= 0 && this.hoveredIndex < this.skills.length) {
            const skill = this.skills[this.hoveredIndex];
            if (this.currentMp >= skill.mpCost) {
                if (this.onSkillSelect) {
                    this.onSkillSelect(skill);
                }
                this.hide();
            }
            return true;
        }

        return true; // consume click
    }

    public onMouseUp(): void {
        this.dragging = false;
    }

    public onScroll(delta: number): boolean {
        if (!this.visible) return false;
        const maxScroll = Math.max(0, this.skills.length - this.MAX_VISIBLE);
        this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset + (delta > 0 ? 1 : -1)));
        return true;
    }

    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;
        if (this.skills.length === 0) {
            this.hide();
            return;
        }

        const visibleCount = Math.min(this.skills.length, this.MAX_VISIBLE);
        this.panelH = this.HEADER_H + visibleCount * this.ROW_H + 12;

        // Center panel on first open (if not dragged before)
        if (!this.positionSet) {
            this.panelX = Math.floor((canvasW - this.PANEL_W) / 2);
            this.panelY = Math.floor((canvasH - this.panelH) / 2);
            this.positionSet = true;
        }

        const px = this.panelX;
        const py = this.panelY;

        ctx.save();

        // ── Glass panel backdrop ──
        drawGlassPanel(ctx, px, py, this.PANEL_W, this.panelH, {
            radius: 10, shadow: true, bg: 'rgba(8, 10, 24, 0.92)'
        });

        // ── Header ──
        ctx.fillStyle = 'rgba(240, 192, 80, 0.12)';
        ctx.fillRect(px + 1, py + 1, this.PANEL_W - 2, this.HEADER_H);

        // Drag handle dots (3 vertical dots)
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        for (let d = 0; d < 3; d++) {
            ctx.fillRect(px + 6, py + 10 + d * 6, 2, 2);
        }

        // Title
        ctx.fillStyle = UI.textAccent;
        ctx.font = `bold 13px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        ctx.fillText('✦ 마법', px + 14, py + 22);

        // MP indicator
        ctx.fillStyle = UI.textSecondary;
        ctx.font = `11px ${UI.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText(`MP ${this.currentMp}/${this.maxMp}`, px + this.PANEL_W - 30, py + 22);
        ctx.textAlign = 'left';

        // Close button
        ctx.fillStyle = 'rgba(255,80,80,0.7)';
        ctx.font = `bold 14px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.fillText('✕', px + this.PANEL_W - 14, py + 19);
        ctx.textAlign = 'left';

        // ── Divider ──
        ctx.strokeStyle = UI.borderSubtle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 8, py + this.HEADER_H);
        ctx.lineTo(px + this.PANEL_W - 8, py + this.HEADER_H);
        ctx.stroke();

        // ── Skill rows ──
        const listY = py + this.HEADER_H;

        for (let i = 0; i < visibleCount; i++) {
            const idx = i + this.scrollOffset;
            if (idx >= this.skills.length) break;

            const skill = this.skills[idx];
            const rowY = listY + i * this.ROW_H;
            const canCast = this.currentMp >= skill.mpCost;
            const isHovered = idx === this.hoveredIndex;

            // Row highlight
            if (isHovered && canCast) {
                ctx.fillStyle = 'rgba(240, 192, 80, 0.12)';
                ctx.fillRect(px + 2, rowY, this.PANEL_W - 4, this.ROW_H);
            }

            // Icon
            ctx.font = `14px serif`;
            ctx.fillText(skill.icon, px + 10, rowY + 24);

            // Skill name
            ctx.font = `12px ${UI.fontPrimary}`;
            ctx.fillStyle = canCast
                ? (isHovered ? UI.textAccent : '#e0e0e0')
                : 'rgba(255,255,255,0.3)';
            ctx.fillText(skill.nameKr, px + 34, rowY + 16);

            // Tier badge
            ctx.font = `9px ${UI.fontMono}`;
            ctx.fillStyle = this.getTierColor(skill.tier);
            ctx.fillText(`T${skill.tier}`, px + 34, rowY + 30);

            // Element tag
            ctx.fillStyle = this.getElementColor(skill.element);
            ctx.fillText(this.getElementLabel(skill.element), px + 56, rowY + 30);

            // Type tag
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillText(this.getTypeLabel(skill.type), px + 100, rowY + 30);

            // MP cost (right side)
            ctx.font = `11px ${UI.fontMono}`;
            ctx.textAlign = 'right';
            ctx.fillStyle = canCast ? '#66bbff' : '#ff4444';
            ctx.fillText(`${skill.mpCost} MP`, px + this.PANEL_W - 12, rowY + 16);

            // Power (right side small)
            ctx.font = `9px ${UI.fontMono}`;
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillText(`×${skill.power}`, px + this.PANEL_W - 12, rowY + 30);
            ctx.textAlign = 'left';

            // Row divider
            if (i < visibleCount - 1) {
                ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                ctx.beginPath();
                ctx.moveTo(px + 10, rowY + this.ROW_H);
                ctx.lineTo(px + this.PANEL_W - 10, rowY + this.ROW_H);
                ctx.stroke();
            }
        }

        // ── Scroll indicator ──
        if (this.skills.length > this.MAX_VISIBLE) {
            const totalH = visibleCount * this.ROW_H;
            const thumbH = Math.max(16, totalH * (this.MAX_VISIBLE / this.skills.length));
            const maxScroll = this.skills.length - this.MAX_VISIBLE;
            const thumbY = listY + (this.scrollOffset / maxScroll) * (totalH - thumbH);

            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(px + this.PANEL_W - 5, thumbY, 3, thumbH);
        }

        // ── Tooltip on hover ──
        if (this.hoveredIndex >= 0 && this.hoveredIndex < this.skills.length) {
            const skill = this.skills[this.hoveredIndex];
            const tipW = 200;
            const tipH = 44;
            let tipX = px + this.PANEL_W + 6;
            let tipY = listY + (this.hoveredIndex - this.scrollOffset) * this.ROW_H;

            // Keep tooltip on screen
            if (tipX + tipW > canvasW) tipX = px - tipW - 6;
            if (tipY + tipH > canvasH) tipY = canvasH - tipH - 4;

            drawGlassPanel(ctx, tipX, tipY, tipW, tipH, {
                radius: 6, shadow: true, bg: 'rgba(8, 10, 24, 0.95)'
            });

            ctx.fillStyle = '#ccc';
            ctx.font = `10px ${UI.fontPrimary}`;
            ctx.fillText(skill.descKr, tipX + 8, tipY + 16);

            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = `9px ${UI.fontMono}`;
            ctx.fillText(`범위: ${skill.range} | 반경: ${skill.aoeRadius} | 위력: ×${skill.power}`, tipX + 8, tipY + 32);
        }

        ctx.restore();
    }

    // ─── Helper functions ───

    private getTierColor(tier: number): string {
        const colors = ['#aaa', '#8bc', '#6d8', '#cc8', '#da6', '#e66', '#f4f'];
        return colors[tier - 1] || '#aaa';
    }

    private getElementColor(el: string): string {
        const map: Record<string, string> = {
            fire: '#ff6633', ice: '#44aaff', lightning: '#ffdd44',
            holy: '#ffeeaa', dark: '#aa66cc', earth: '#aa8844',
            wind: '#66ddaa', physical: '#ccbbaa', none: '#999'
        };
        return map[el] || '#999';
    }

    private getElementLabel(el: string): string {
        const map: Record<string, string> = {
            fire: '화', ice: '빙', lightning: '뇌',
            holy: '성', dark: '암', earth: '지',
            wind: '풍', physical: '물', none: '-'
        };
        return map[el] || '-';
    }

    private getTypeLabel(type: string): string {
        const map: Record<string, string> = {
            damage: '공격', heal: '회복', buff: '버프',
            debuff: '디버프', aoe: '범위'
        };
        return map[type] || type;
    }
}
