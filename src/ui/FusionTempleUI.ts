import type { FusionCandidate } from '../character/FusionSystem';
import type { MasterBranch } from '../data/ClassTree';
import type { InputManager } from '../engine/InputManager';
import { i18n, t } from '../i18n/LanguageManager';
import type { WorldRealm } from '../map/BiomeMask';
import { UI, Parchment, drawParchmentPanel, drawParchmentButton, renderGameTitle } from './UITheme';

type TempleAction =
    | { kind: 'close' }
    | { kind: 'fuse'; branch: MasterBranch }
    | { kind: 'enterMasterWorld' }
    | { kind: 'returnToMortalWorld' };

interface TempleButton {
    rect: { x: number; y: number; w: number; h: number };
    label: string;
    disabled: boolean;
    action: TempleAction;
}

export interface FusionTempleState {
    realm: WorldRealm;
    candidates: FusionCandidate[];
    canEnterMasterWorld: boolean;
}

export class FusionTempleUI {
    private visible = false;
    private state: FusionTempleState | null = null;
    private buttons: TempleButton[] = [];
    private hoveredButton: TempleButton | null = null;

    public onFuse: (branch: MasterBranch) => void = () => undefined;
    public onEnterMasterWorld: () => void = () => undefined;
    public onReturnToMortalWorld: () => void = () => undefined;
    public onClose: () => void = () => undefined;

    public show(state: FusionTempleState): void {
        this.state = state;
        this.visible = true;
        this.hoveredButton = null;
    }

    public hide(): void {
        this.visible = false;
        this.state = null;
        this.buttons = [];
        this.hoveredButton = null;
    }

    public isVisible(): boolean {
        return this.visible;
    }

    public updateInput(input: InputManager): void {
        if (!this.visible) return;
        const mx = input.uiMouseX;
        const my = input.uiMouseY;
        this.hoveredButton = this.buttons.find((button) =>
            mx >= button.rect.x && mx <= button.rect.x + button.rect.w &&
            my >= button.rect.y && my <= button.rect.y + button.rect.h
        ) ?? null;

        if (input.justPressed('Escape')) {
            this.close();
            return;
        }

        if (!input.mouseJustDown || !this.hoveredButton || this.hoveredButton.disabled) return;
        const action = this.hoveredButton.action;
        if (action.kind === 'close') this.close();
        else if (action.kind === 'fuse') this.onFuse(action.branch);
        else if (action.kind === 'enterMasterWorld') this.onEnterMasterWorld();
        else if (action.kind === 'returnToMortalWorld') this.onReturnToMortalWorld();
    }

    public render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        if (!this.visible || !this.state) return;

        ctx.fillStyle = 'rgba(4, 5, 10, 0.9)';
        ctx.fillRect(0, 0, w, h);
        renderGameTitle(ctx, 16, 10, { scale: 0.68, subtitle: '' });

        const panelW = Math.min(860, w - 48);
        const panelH = Math.min(560, h - 64);
        const x = Math.floor((w - panelW) / 2);
        const y = Math.floor((h - panelH) / 2);
        drawParchmentPanel(ctx, x, y, panelW, panelH, { radius: 8, headerH: 82 });

        this.buttons = [];
        this.renderHeader(ctx, x, y, panelW);
        if (this.state.realm === 'master') {
            this.renderMasterGate(ctx, x, y, panelW, panelH);
        } else {
            this.renderFusionRows(ctx, x, y, panelW, panelH);
        }
        this.renderCloseButton(ctx, x, y, panelW);
    }

    private renderHeader(ctx: CanvasRenderingContext2D, x: number, y: number, panelW: number): void {
        if (!this.state) return;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `bold 28px ${UI.fontPrimary}`;
        ctx.fillStyle = this.state.realm === 'master' ? '#1f4878' : '#5a2d6e';
        ctx.fillText(this.state.realm === 'master' ? t('fusionTemple.masterGateTitle') : t('fusionTemple.title'), x + panelW / 2, y + 28);
        ctx.font = `13px ${UI.fontPrimary}`;
        ctx.fillStyle = Parchment.textMid;
        ctx.fillText(
            this.state.realm === 'master' ? t('fusionTemple.masterGateDesc') : t('fusionTemple.desc'),
            x + panelW / 2,
            y + 64
        );
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    private renderFusionRows(ctx: CanvasRenderingContext2D, x: number, y: number, panelW: number, panelH: number): void {
        if (!this.state) return;
        const rowX = x + 40;
        const rowW = panelW - 80;
        const rowH = 72;
        const rowGap = 14;
        let rowY = y + 108;

        for (const candidate of this.state.candidates) {
            drawParchmentPanel(ctx, rowX, rowY, rowW, rowH, { radius: 6, shadow: false, compact: true });
            if (candidate.canFuse) {
                ctx.strokeStyle = Parchment.borderGold;
                ctx.lineWidth = 2;
                ctx.strokeRect(rowX + 1, rowY + 1, rowW - 2, rowH - 2);
            }

            ctx.fillStyle = candidate.canFuse ? '#5a2d6e' : Parchment.textMuted;
            ctx.font = `bold 16px ${UI.fontPrimary}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(i18n.lang === 'en' ? candidate.masterNameEn : candidate.masterNameKr, rowX + 18, rowY + 14);

            ctx.font = `11px ${UI.fontPrimary}`;
            ctx.fillStyle = Parchment.textMid;
            const requirementText = candidate.requirements.map((requirement) => {
                const mark = requirement.ready ? 'OK' : '--';
                const className = i18n.lang === 'en' ? requirement.classNameEn : requirement.classNameKr;
                const name = requirement.character ? requirement.character.name : className;
                return `${mark} ${className}:${name}`;
            }).join('   ');
            ctx.fillText(requirementText, rowX + 18, rowY + 42);

            const button = {
                rect: { x: rowX + rowW - 126, y: rowY + 18, w: 96, h: 36 },
                label: t('fusionTemple.fuse'),
                disabled: !candidate.canFuse,
                action: { kind: 'fuse', branch: candidate.branch } as TempleAction,
            };
            this.buttons.push(button);
            this.renderButton(ctx, button);
            rowY += rowH + rowGap;
        }

        const enterButton = {
            rect: { x: x + panelW / 2 - 95, y: y + panelH - 86, w: 190, h: 42 },
            label: t('fusionTemple.enterMasterWorld'),
            disabled: !this.state.canEnterMasterWorld,
            action: { kind: 'enterMasterWorld' } as TempleAction,
        };
        this.buttons.push(enterButton);
        this.renderButton(ctx, enterButton);
    }

    private renderMasterGate(ctx: CanvasRenderingContext2D, x: number, y: number, panelW: number, panelH: number): void {
        ctx.save();
        const cx = x + panelW / 2;
        const cy = y + panelH / 2 + 8;
        const r = 96;
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 420);
        const gradient = ctx.createRadialGradient(cx, cy, 12, cx, cy, r);
        gradient.addColorStop(0, `rgba(160, 240, 255, ${0.55 + pulse * 0.25})`);
        gradient.addColorStop(0.55, 'rgba(80, 120, 255, 0.25)');
        gradient.addColorStop(1, 'rgba(20, 40, 90, 0.02)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#9defff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        const returnButton = {
            rect: { x: x + panelW / 2 - 86, y: y + panelH - 92, w: 172, h: 42 },
            label: t('fusionTemple.returnToMortalWorld'),
            disabled: false,
            action: { kind: 'returnToMortalWorld' } as TempleAction,
        };
        this.buttons.push(returnButton);
        this.renderButton(ctx, returnButton);
    }

    private renderCloseButton(ctx: CanvasRenderingContext2D, x: number, y: number, panelW: number): void {
        const closeButton = {
            rect: { x: x + panelW - 48, y: y + 16, w: 32, h: 32 },
            label: 'X',
            disabled: false,
            action: { kind: 'close' } as TempleAction,
        };
        this.buttons.push(closeButton);
        this.renderButton(ctx, closeButton);
    }

    private renderButton(ctx: CanvasRenderingContext2D, button: TempleButton): void {
        const state = button.disabled
            ? 'disabled'
            : this.isHoveredButton(button)
                ? 'hover'
                : 'default';
        drawParchmentButton(ctx, button.rect.x, button.rect.y, button.rect.w, button.rect.h, button.label, state);
    }

    private isHoveredButton(button: TempleButton): boolean {
        if (!this.hoveredButton) return false;
        return this.hoveredButton.label === button.label &&
            this.hoveredButton.action.kind === button.action.kind &&
            this.hoveredButton.rect.x === button.rect.x &&
            this.hoveredButton.rect.y === button.rect.y;
    }

    private close(): void {
        this.hide();
        this.onClose();
    }
}
