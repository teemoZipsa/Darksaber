/**
 * PauseMenuUI — Modal overlay shown when the player presses ESC during WORLD play
 * with no other UI open. Items: Resume, Return to Title.
 *
 * Owns its own visibility state. Input is routed in only while visible.
 */

import type { InputManager } from '../engine/InputManager';
import { UI, Parchment, drawParchmentPanel, drawParchmentButton } from './UITheme';
import { t } from '../i18n/LanguageManager';
import { Tween, easeOutCubic } from './Tween';

interface MenuButton {
    label: string;
    action: 'resume' | 'title';
    rect: { x: number; y: number; w: number; h: number };
}

export class PauseMenuUI {
    private visible = false;
    private buttons: MenuButton[] = [];
    private hovered: MenuButton | null = null;
    private openTween: Tween;

    public onResume: () => void = () => undefined;
    public onReturnToTitle: () => void = () => undefined;

    constructor() {
        this.openTween = new Tween(0, 1, 200, easeOutCubic);
    }

    public open(): void {
        if (this.visible) return;
        this.visible = true;
        this.openTween = new Tween(0, 1, 200, easeOutCubic);
        this.openTween.start(performance.now());
    }

    public close(): void {
        this.visible = false;
        this.hovered = null;
    }

    public isVisible(): boolean {
        return this.visible;
    }

    public updateInput(input: InputManager): void {
        if (!this.visible) return;

        if (input.justPressed('Escape')) {
            this.close();
            this.onResume();
            return;
        }

        this.hovered = this.buttons.find((b) =>
            input.uiMouseX >= b.rect.x && input.uiMouseX <= b.rect.x + b.rect.w &&
            input.uiMouseY >= b.rect.y && input.uiMouseY <= b.rect.y + b.rect.h
        ) ?? null;

        if (input.mouseJustDown && this.hovered) {
            const action = this.hovered.action;
            if (action === 'resume') {
                this.close();
                this.onResume();
            } else if (action === 'title') {
                this.close();
                this.onReturnToTitle();
            }
        }
    }

    public render(ctx: CanvasRenderingContext2D, vw: number, vh: number): void {
        if (!this.visible) return;
        const progress = this.openTween.value(performance.now());

        // Backdrop (darken everything behind)
        ctx.save();
        ctx.fillStyle = `rgba(8, 6, 4, ${0.65 * progress})`;
        ctx.fillRect(0, 0, vw, vh);

        const panelW = 320;
        const panelH = 240;
        const px = Math.floor((vw - panelW) / 2);
        // Slide-in from above by a few px
        const py = Math.floor((vh - panelH) / 2) + Math.round((1 - progress) * -16);

        ctx.globalAlpha = progress;
        drawParchmentPanel(ctx, px, py, panelW, panelH, { headerH: 44 });

        // Title in header band
        ctx.fillStyle = Parchment.textDark;
        ctx.font = `bold 20px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('pause.title') || '일시정지', px + panelW / 2, py + 22);

        // Buttons stacked
        const btnW = 220;
        const btnH = 44;
        const btnX = px + (panelW - btnW) / 2;
        const btnGap = 12;
        let btnY = py + 76;

        this.buttons = [];
        const items: { label: string; action: MenuButton['action'] }[] = [
            { label: t('pause.resume') || '이어하기',      action: 'resume' },
            { label: t('pause.toTitle') || '타이틀로 돌아가기', action: 'title' },
        ];

        for (const item of items) {
            const rect = { x: btnX, y: btnY, w: btnW, h: btnH };
            const button: MenuButton = { label: item.label, action: item.action, rect };
            this.buttons.push(button);
            const state = this.hovered === button || (this.hovered && this.hovered.action === button.action) ? 'hover' : 'default';
            drawParchmentButton(ctx, rect.x, rect.y, rect.w, rect.h, item.label, state);
            btnY += btnH + btnGap;
        }

        // Footer hint
        ctx.fillStyle = Parchment.textMuted;
        ctx.font = `12px ${UI.fontPrimary}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('ESC 또는 이어하기를 눌러 복귀', px + panelW / 2, py + panelH - 24);

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
    }
}
