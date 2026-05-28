/**
 * SettingsUI — Parchment-style settings modal reachable from the pause menu.
 *
 * Sections: 사운드 (BGM/SFX mute + volumes), 화면 (UI scale, FPS limit, grid, FPS),
 *           접근성 (모션 감소), 언어 (KO/EN).
 *
 * Controls land in three flavors — toggle (binary ON/OFF), cycle (parchment
 * button showing the current preset), and slider (horizontal track with a
 * draggable thumb). All state writes go through SettingsManager so changes
 * persist across reloads.
 */

import type { InputManager } from '../engine/InputManager';
import { SettingsManager } from '../engine/SettingsManager';
import { AudioManager } from '../engine/AudioManager';
import { UI, Parchment, drawParchmentPanel, drawParchmentButton } from './UITheme';
import { i18n, t } from '../i18n/LanguageManager';
import { Tween, easeOutCubic } from './Tween';

type ControlKind = 'toggle' | 'cycle' | 'slider';

interface BaseControl {
    label: string;
    kind: ControlKind;
    rect: { x: number; y: number; w: number; h: number };
}

interface ToggleControl extends BaseControl {
    kind: 'toggle';
    get: () => boolean;
    set: (v: boolean) => void;
}

interface CycleControl extends BaseControl {
    kind: 'cycle';
    valueLabel: () => string;
    onActivate: () => void;
}

interface SliderControl extends BaseControl {
    kind: 'slider';
    get: () => number;     // 0..1
    set: (v: number) => void;
    /** Optional preview SFX key fired on release. */
    previewSfx?: string;
}

type Control = ToggleControl | CycleControl | SliderControl;

const PANEL_W = 460;
const PANEL_H = 540;
const HEADER_H = 48;
const ROW_H = 32;
const ROW_GAP = 6;
const SECTION_GAP = 18;
const PAD_X = 24;

export class SettingsUI {
    private visible = false;
    private controls: Control[] = [];
    private hovered: Control | null = null;
    private draggingSlider: SliderControl | null = null;
    private openTween = new Tween(0, 1, 220, easeOutCubic);
    private closeRect = { x: 0, y: 0, w: 0, h: 0 };
    private closeHovered = false;

    public onClose: () => void = () => undefined;

    public open(): void {
        if (this.visible) return;
        this.visible = true;
        this.openTween = new Tween(0, 1, 220, easeOutCubic);
        this.openTween.start(performance.now());
    }

    public close(): void {
        this.visible = false;
        this.hovered = null;
        this.draggingSlider = null;
    }

    public isVisible(): boolean { return this.visible; }

    public updateInput(input: InputManager): void {
        if (!this.visible) return;

        if (input.justPressed('Escape')) {
            this.handleClose();
            return;
        }

        const mx = input.uiMouseX;
        const my = input.uiMouseY;

        // Active slider drag has priority.
        if (this.draggingSlider) {
            if (!input.mouseIsDown) {
                if (this.draggingSlider.previewSfx) AudioManager.playUi(this.draggingSlider.previewSfx);
                this.draggingSlider = null;
            } else {
                this.applySliderFromMouse(this.draggingSlider, mx);
            }
            return;
        }

        // Hover detection
        this.hovered = this.controls.find((c) => pointInRect(mx, my, c.rect)) ?? null;
        this.closeHovered = pointInRect(mx, my, this.closeRect);

        if (input.mouseJustDown) {
            if (this.closeHovered) {
                this.handleClose();
                return;
            }
            if (!this.hovered) return;

            if (this.hovered.kind === 'toggle') {
                this.hovered.set(!this.hovered.get());
                AudioManager.playUi('ui.confirm');
            } else if (this.hovered.kind === 'cycle') {
                this.hovered.onActivate();
                AudioManager.playUi('ui.confirm');
            } else if (this.hovered.kind === 'slider') {
                this.draggingSlider = this.hovered;
                this.applySliderFromMouse(this.hovered, mx);
            }
        }
    }

    public render(ctx: CanvasRenderingContext2D, vw: number, vh: number): void {
        if (!this.visible) return;
        const now = performance.now();
        const progress = this.openTween.value(now);

        ctx.save();
        ctx.fillStyle = `rgba(8, 6, 4, ${0.68 * progress})`;
        ctx.fillRect(0, 0, vw, vh);

        const px = Math.floor((vw - PANEL_W) / 2);
        const py = Math.floor((vh - PANEL_H) / 2) + Math.round((1 - progress) * -16);

        ctx.globalAlpha = progress;
        drawParchmentPanel(ctx, px, py, PANEL_W, PANEL_H, { headerH: HEADER_H, radius: 10 });

        // Title
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 20px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('settings.title') || '설정', px + PANEL_W / 2, py + HEADER_H / 2);

        // Close button in header
        const closeSize = 26;
        this.closeRect = {
            x: px + PANEL_W - closeSize - 14,
            y: py + (HEADER_H - closeSize) / 2,
            w: closeSize, h: closeSize,
        };
        drawParchmentButton(ctx, this.closeRect.x, this.closeRect.y, this.closeRect.w, this.closeRect.h, '✕',
            this.closeHovered ? 'hover' : 'default');

        // Build controls fresh each frame (cheap, makes layout/labels live).
        this.controls = [];
        let cursorY = py + HEADER_H + 18;

        cursorY = this.renderSection(ctx, '사운드', px, cursorY, [
            this.toggle('BGM 음소거', SettingsManager.getMuteBGM, SettingsManager.setMuteBGM),
            this.toggle('SFX 음소거', SettingsManager.getMuteSFX, SettingsManager.setMuteSFX),
            this.slider('BGM 볼륨',   SettingsManager.getBgmVolume, SettingsManager.setBgmVolume),
            this.slider('SFX 볼륨',   SettingsManager.getSfxVolume, SettingsManager.setSfxVolume, 'ui.confirm'),
            this.slider('UI 볼륨',    SettingsManager.getUiVolume,  SettingsManager.setUiVolume,  'ui.hover'),
        ]);

        cursorY = this.renderSection(ctx, '화면', px, cursorY, [
            this.cycle('UI 크기', SettingsManager.getScaleLabel, SettingsManager.cycleUIScale),
            this.cycle('FPS 제한', SettingsManager.getFPSLimitLabel, SettingsManager.cycleFPSLimit),
            this.toggle('격자 표시', SettingsManager.getGrid, SettingsManager.setGrid),
            this.toggle('FPS 표시', SettingsManager.getFPS, SettingsManager.setFPS),
        ]);

        cursorY = this.renderSection(ctx, '접근성', px, cursorY, [
            this.toggle('모션 감소', SettingsManager.getMotionReduce, SettingsManager.setMotionReduce),
        ]);

        cursorY = this.renderSection(ctx, '언어', px, cursorY, [
            this.cycle('언어 / Language',
                () => i18n.lang === 'ko' ? '한국어' : 'English',
                () => i18n.toggleLanguage()),
        ]);

        // Footer hint
        ctx.fillStyle = Parchment.textMuted;
        ctx.font = `12px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('ESC 또는 ✕ 로 닫기', px + PANEL_W / 2, py + PANEL_H - 28);

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    }

    // ─── Section + control builders ──────────────────────────────

    private renderSection(
        ctx: CanvasRenderingContext2D,
        title: string,
        panelX: number,
        startY: number,
        controls: Control[]
    ): number {
        // Section title
        ctx.fillStyle = Parchment.textLabel;
        ctx.font = `bold 13px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, panelX + PAD_X, startY + 8);

        // Section divider
        const dividerX = panelX + PAD_X + ctx.measureText(title).width + 10;
        ctx.strokeStyle = Parchment.borderDark;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.moveTo(dividerX, startY + 8);
        ctx.lineTo(panelX + PANEL_W - PAD_X, startY + 8);
        ctx.stroke();
        ctx.globalAlpha = 1;

        let y = startY + 22;
        for (const c of controls) {
            c.rect = {
                x: panelX + PAD_X,
                y,
                w: PANEL_W - PAD_X * 2,
                h: ROW_H,
            };
            this.renderControl(ctx, c);
            this.controls.push(c);
            y += ROW_H + ROW_GAP;
        }
        return y + SECTION_GAP - ROW_GAP;
    }

    private renderControl(ctx: CanvasRenderingContext2D, c: Control): void {
        // Row label (left)
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `13px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.label, c.rect.x + 6, c.rect.y + ROW_H / 2);

        const controlW = 140;
        const controlH = ROW_H - 4;
        const controlX = c.rect.x + c.rect.w - controlW;
        const controlY = c.rect.y + 2;
        const hovered = this.hovered === c;

        if (c.kind === 'toggle') {
            const on = c.get();
            const label = on ? 'ON' : 'OFF';
            drawParchmentButton(ctx, controlX, controlY, controlW, controlH, label,
                hovered ? 'hover' : (on ? 'active' : 'default'));
        } else if (c.kind === 'cycle') {
            drawParchmentButton(ctx, controlX, controlY, controlW, controlH, c.valueLabel(),
                hovered ? 'hover' : 'default');
        } else if (c.kind === 'slider') {
            this.renderSlider(ctx, controlX, controlY, controlW, controlH, c, hovered);
        }
    }

    private renderSlider(
        ctx: CanvasRenderingContext2D,
        x: number, y: number, w: number, h: number,
        c: SliderControl,
        hovered: boolean
    ): void {
        const trackH = 6;
        const trackY = y + (h - trackH) / 2;
        const value = Math.max(0, Math.min(1, c.get()));

        // Track background
        ctx.fillStyle = 'rgba(58, 38, 24, 0.4)';
        ctx.fillRect(x, trackY, w, trackH);

        // Filled portion
        ctx.fillStyle = hovered || this.draggingSlider === c ? Parchment.borderGold : '#a68240';
        ctx.fillRect(x, trackY, w * value, trackH);

        // Border
        ctx.strokeStyle = Parchment.borderDark;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, trackY, w, trackH);

        // Thumb
        const thumbX = x + w * value;
        const thumbR = hovered ? 9 : 7;
        ctx.fillStyle = Parchment.panelBgLight;
        ctx.beginPath();
        ctx.arc(thumbX, trackY + trackH / 2, thumbR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = Parchment.borderDark;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Value text on the right
        const valuePct = Math.round(value * 100);
        ctx.fillStyle = Parchment.textMid;
        ctx.font = `11px ${UI.fontPrimary}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`${valuePct}%`, x + w, y - 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'middle';
    }

    private applySliderFromMouse(c: SliderControl, mx: number): void {
        const v = (mx - c.rect.x - (c.rect.w - 140)) / 140;
        c.set(Math.max(0, Math.min(1, v)));
    }

    private toggle(label: string, get: () => boolean, set: (v: boolean) => void): ToggleControl {
        return { kind: 'toggle', label, get, set, rect: { x: 0, y: 0, w: 0, h: 0 } };
    }

    private cycle(label: string, valueLabel: () => string, onActivate: () => void): CycleControl {
        return { kind: 'cycle', label, valueLabel, onActivate, rect: { x: 0, y: 0, w: 0, h: 0 } };
    }

    private slider(
        label: string,
        get: () => number,
        set: (v: number) => void,
        previewSfx?: string
    ): SliderControl {
        return { kind: 'slider', label, get, set, previewSfx, rect: { x: 0, y: 0, w: 0, h: 0 } };
    }

    private handleClose(): void {
        AudioManager.playUi('ui.cancel');
        this.close();
        this.onClose();
    }
}

function pointInRect(px: number, py: number, r: { x: number; y: number; w: number; h: number }): boolean {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
