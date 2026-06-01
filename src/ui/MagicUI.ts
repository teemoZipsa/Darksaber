/**
 * MagicUI — Spell selection panel that appears when "Magic" is clicked
 * in the action menu. Shows learned skills based on character class & tier.
 * Supports drag-to-move by grabbing the header.
 */

import { Skill, SkillGroup, getLearnedSkills, getSkillGroup } from '../data/SkillDB';
import { i18n, t } from '../i18n/LanguageManager';
import { getSkillIconCell } from './DarksaberIconRegistry';
import { DarksaberSpriteAtlas } from './DarksaberSpriteAtlas';
import { UI, drawParchmentPanel, Parchment } from './UITheme';

type MagicUiRow =
    | { kind: 'section'; group: SkillGroup }
    | { kind: 'skill'; skill: Skill };

export class MagicUI {
    private visible = false;
    private skills: Skill[] = [];
    private rows: MagicUiRow[] = [];
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

    public show(classId: string, characterTier: number, mp: number, maxMp: number, unlockedSkillIds?: string[]): void {
        this.skills = getLearnedSkills(classId, characterTier, unlockedSkillIds);
        this.rows = this.buildRows(this.skills);
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
            if (idx >= 0 && idx < this.rows.length && this.rows[idx].kind === 'skill') {
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
        if (this.hoveredIndex >= 0 && this.hoveredIndex < this.rows.length) {
            const row = this.rows[this.hoveredIndex];
            if (row.kind !== 'skill') return true;
            const skill = row.skill;
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
        const maxScroll = Math.max(0, this.rows.length - this.MAX_VISIBLE);
        this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset + (delta > 0 ? 1 : -1)));
        return true;
    }

    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;
        if (this.skills.length === 0) {
            this.hide();
            return;
        }

        const visibleCount = Math.min(this.rows.length, this.MAX_VISIBLE);
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

        // ── Parchment panel backdrop with header band ──
        drawParchmentPanel(ctx, px, py, this.PANEL_W, this.panelH, {
            radius: 10, headerH: this.HEADER_H,
        });

        // Drag handle dots (3 vertical dots)
        ctx.fillStyle = 'rgba(58, 38, 24, 0.45)';
        for (let d = 0; d < 3; d++) {
            ctx.fillRect(px + 6, py + 10 + d * 6, 2, 2);
        }

        // Title
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 15px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        ctx.fillText(t('magic.title'), px + 14, py + 22);

        // MP indicator (dark on gold header for contrast)
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 13px ${UI.fontPrimary}`;
        ctx.textAlign = 'right';
        ctx.fillText(`MP ${this.currentMp}/${this.maxMp}`, px + this.PANEL_W - 30, py + 22);
        ctx.textAlign = 'left';

        // Close button
        ctx.fillStyle = '#a01818';
        ctx.font = `bold 14px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.fillText('✕', px + this.PANEL_W - 14, py + 19);
        ctx.textAlign = 'left';

        // ── Skill rows ──
        const listY = py + this.HEADER_H;

        for (let i = 0; i < visibleCount; i++) {
            const idx = i + this.scrollOffset;
            if (idx >= this.rows.length) break;

            const row = this.rows[idx];
            const rowY = listY + i * this.ROW_H;
            if (row.kind === 'section') {
                ctx.fillStyle = 'rgba(58, 38, 24, 0.14)';
                ctx.fillRect(px + 2, rowY + 4, this.PANEL_W - 4, this.ROW_H - 8);
                ctx.fillStyle = Parchment.textMuted;
                ctx.font = `bold 11px ${UI.fontPrimary}`;
                ctx.fillText(this.getGroupLabel(row.group), px + 12, rowY + 23);
                continue;
            }

            const skill = row.skill;
            const canCast = this.currentMp >= skill.mpCost;
            const isHovered = idx === this.hoveredIndex;

            // Row highlight
            if (isHovered && canCast) {
                ctx.fillStyle = 'rgba(196, 142, 60, 0.28)';
                ctx.fillRect(px + 2, rowY, this.PANEL_W - 4, this.ROW_H);
            }

            // Icon
            const iconCell = getSkillIconCell(skill);
            const iconSize = 22;
            const iconDrawn = iconCell
                ? DarksaberSpriteAtlas.drawIconCell(ctx, iconCell.col, iconCell.row, px + 7, rowY + 7, iconSize, {
                    alpha: canCast ? 1 : 0.38,
                })
                : false;
            if (!iconDrawn) {
                ctx.save();
                ctx.globalAlpha *= canCast ? 1 : 0.45;
                ctx.font = `14px serif`;
                ctx.fillStyle = Parchment.textDark;
                ctx.fillText(skill.icon, px + 10, rowY + 24);
                ctx.restore();
            }

            // Skill name
            ctx.font = `bold 13px ${UI.fontPrimary}`;
            ctx.fillStyle = canCast
                ? Parchment.textDark
                : Parchment.textMuted;
            ctx.fillText(this.getSkillName(skill), px + 34, rowY + 16);

            // Tier badge
            ctx.font = `11px ${UI.fontPrimary}`;
            ctx.fillStyle = this.getTierColor(skill.tier);
            ctx.fillText(`T${skill.tier}`, px + 34, rowY + 30);

            // Element tag
            ctx.fillStyle = this.getElementColor(skill.element);
            ctx.fillText(this.getElementLabel(skill.element), px + 56, rowY + 30);

            // Type tag
            ctx.fillStyle = Parchment.textMuted;
            ctx.fillText(this.getTypeLabel(skill.type), px + 100, rowY + 30);

            // MP cost (right side)
            ctx.font = `bold 13px ${UI.fontPrimary}`;
            ctx.textAlign = 'right';
            ctx.fillStyle = canCast ? '#1f4878' : '#a01818';
            ctx.fillText(`${skill.mpCost} MP`, px + this.PANEL_W - 12, rowY + 16);

            // Power (right side small)
            ctx.font = `11px ${UI.fontPrimary}`;
            ctx.fillStyle = Parchment.textDark;
            ctx.fillText(`×${skill.power}`, px + this.PANEL_W - 12, rowY + 30);
            ctx.textAlign = 'left';

            // Row divider
            if (i < visibleCount - 1) {
                ctx.strokeStyle = 'rgba(58, 38, 24, 0.15)';
                ctx.beginPath();
                ctx.moveTo(px + 10, rowY + this.ROW_H);
                ctx.lineTo(px + this.PANEL_W - 10, rowY + this.ROW_H);
                ctx.stroke();
            }
        }

        // ── Scroll indicator ──
        if (this.rows.length > this.MAX_VISIBLE) {
            const totalH = visibleCount * this.ROW_H;
            const thumbH = Math.max(16, totalH * (this.MAX_VISIBLE / this.rows.length));
            const maxScroll = this.rows.length - this.MAX_VISIBLE;
            const thumbY = listY + (this.scrollOffset / maxScroll) * (totalH - thumbH);

            ctx.fillStyle = 'rgba(58, 38, 24, 0.35)';
            ctx.fillRect(px + this.PANEL_W - 5, thumbY, 3, thumbH);
        }

        // ── Tooltip on hover ──
        const hoveredRow = this.hoveredIndex >= 0 && this.hoveredIndex < this.rows.length
            ? this.rows[this.hoveredIndex]
            : undefined;
        if (hoveredRow?.kind === 'skill') {
            const skill = hoveredRow.skill;
            const tipW = 200;
            const tipH = 44;
            let tipX = px + this.PANEL_W + 6;
            let tipY = listY + (this.hoveredIndex - this.scrollOffset) * this.ROW_H;

            // Keep tooltip on screen
            if (tipX + tipW > canvasW) tipX = px - tipW - 6;
            if (tipY + tipH > canvasH) tipY = canvasH - tipH - 4;

            drawParchmentPanel(ctx, tipX, tipY, tipW, tipH, { radius: 6, compact: true });

            ctx.fillStyle = Parchment.textDark;
            ctx.font = `12px ${UI.fontPrimary}`;
            ctx.fillText(this.getSkillDesc(skill), tipX + 8, tipY + 16);

            ctx.fillStyle = Parchment.textDark;
            ctx.font = `11px ${UI.fontPrimary}`;
            ctx.fillText(`${t('magic.range')}: ${skill.range} | ${t('magic.radius')}: ${skill.aoeRadius} | ${t('magic.power')}: ×${skill.power}`, tipX + 8, tipY + 32);
        }

        ctx.restore();
    }

    // ─── Helper functions ───

    private buildRows(skills: Skill[]): MagicUiRow[] {
        const order: SkillGroup[] = ['classSkill', 'classStance', 'classCommand', 'classAura', 'commonMagic'];
        const rows: MagicUiRow[] = [];
        for (const group of order) {
            const groupSkills = skills.filter((skill) => getSkillGroup(skill) === group);
            if (groupSkills.length === 0) continue;
            rows.push({ kind: 'section', group });
            rows.push(...groupSkills.map((skill) => ({ kind: 'skill' as const, skill })));
        }
        return rows;
    }

    private getSkillName(skill: Skill): string {
        return i18n.lang === 'en' ? skill.nameEn : skill.nameKr;
    }

    private getSkillDesc(skill: Skill): string {
        return i18n.lang === 'en' ? skill.descEn : skill.descKr;
    }

    private getGroupLabel(group: SkillGroup): string {
        return t(`magic.group.${group}`);
    }

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
        return t(`magic.element.${el}`);
    }

    private getTypeLabel(type: string): string {
        return t(`magic.type.${type}`);
    }
}
