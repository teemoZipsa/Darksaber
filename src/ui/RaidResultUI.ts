import { InputManager } from '../engine/InputManager';
import { RaidOutcome } from '../raid/RaidOutcome';
import { UI, Parchment, drawParchmentPanel, drawParchmentButton, renderGameTitle } from './UITheme';

function formatTime(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
    const ss = (seconds % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
}

function resultTitle(result: RaidOutcome['result']): string {
    if (result === 'SURVIVED') return '생환 성공';
    if (result === 'MIA') return '시간 초과';
    return '출격 실패';
}

export class RaidResultUI {
    private visible = false;
    private outcome: RaidOutcome | null = null;
    private confirmRect = { x: 0, y: 0, w: 0, h: 0 };
    public onClose: (() => void) | null = null;

    public show(outcome: RaidOutcome): void {
        this.outcome = outcome;
        this.visible = true;
    }

    public hide(): void {
        this.visible = false;
        this.outcome = null;
    }

    public isVisible(): boolean {
        return this.visible;
    }

    public updateInput(input: InputManager): void {
        if (!this.visible) return;
        if (input.justPressed('Enter') || input.justPressed('Space')) {
            this.confirm();
            return;
        }
        if (!input.mouseJustDown) return;
        const mx = input.uiMouseX;
        const my = input.uiMouseY;
        if (
            mx >= this.confirmRect.x && mx <= this.confirmRect.x + this.confirmRect.w &&
            my >= this.confirmRect.y && my <= this.confirmRect.y + this.confirmRect.h
        ) {
            this.confirm();
        }
    }

    private confirm(): void {
        this.hide();
        this.onClose?.();
    }

    public render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        if (!this.visible || !this.outcome) return;

        ctx.fillStyle = 'rgba(4, 6, 10, 0.92)';
        ctx.fillRect(0, 0, w, h);
        renderGameTitle(ctx, 16, 12, { scale: 0.75, subtitle: '' });

        const panelW = Math.min(860, w - 48);
        const panelH = Math.min(560, h - 72);
        const px = Math.floor((w - panelW) / 2);
        const py = Math.floor((h - panelH) / 2);
        drawParchmentPanel(ctx, px, py, panelW, panelH, { radius: 8, headerH: 88 });
        // result-flavored border accent on top edge
        ctx.save();
        ctx.strokeStyle = this.outcome.result === 'SURVIVED' ? '#2d6a3d' : '#8a1818';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px + 16, py + 88);
        ctx.lineTo(px + panelW - 16, py + 88);
        ctx.stroke();
        ctx.restore();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `bold 30px ${UI.fontPrimary}`;
        ctx.fillStyle = this.outcome.result === 'SURVIVED' ? '#2d6a3d' : '#8a1818';
        ctx.fillText(resultTitle(this.outcome.result), px + panelW / 2, py + 24);

        ctx.font = `bold 14px ${UI.fontPrimary}`;
        ctx.fillStyle = Parchment.textDark;
        const destination = this.outcome.extractionTownId ?? '-';
        ctx.fillText(
            `출발 ${this.outcome.departureTownId}  ->  도착 ${destination}  |  ${formatTime(this.outcome.elapsedSeconds)}  |  처치 ${this.outcome.kills}`,
            px + panelW / 2,
            py + 64
        );

        const colGap = 24;
        const colW = Math.floor((panelW - 72 - colGap) / 2);
        const leftX = px + 24;
        const rightX = leftX + colW + colGap;
        const contentY = py + 104;
        const contentH = panelH - 184;

        this.renderHeroes(ctx, leftX, contentY, colW, contentH);
        this.renderRewardsAndLosses(ctx, rightX, contentY, colW, contentH);
        this.renderConfirm(ctx, px + panelW / 2 - 90, py + panelH - 58);

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    private renderSectionTitle(ctx: CanvasRenderingContext2D, title: string, x: number, y: number): void {
        ctx.font = `bold 18px ${UI.fontPrimary}`;
        ctx.fillStyle = Parchment.textDark;
        ctx.textAlign = 'left';
        ctx.fillText(title, x, y);
    }

    private renderHeroes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
        drawParchmentPanel(ctx, x, y, w, h, { radius: 6, shadow: false, compact: true });
        this.renderSectionTitle(ctx, '출격 영웅', x + 16, y + 16);

        const heroes = this.outcome?.heroStatuses ?? [];
        ctx.font = `bold 14px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        if (heroes.length === 0) {
            ctx.fillStyle = Parchment.textMuted;
            ctx.fillText('기록된 영웅 상태가 없습니다.', x + 16, y + 52);
            return;
        }

        for (let i = 0; i < heroes.length; i++) {
            const hero = heroes[i];
            const rowY = y + 52 + i * 38;
            if (rowY > y + h - 28) break;
            ctx.fillStyle = hero.isDead ? '#8a1818' : Parchment.textDark;
            ctx.fillText(hero.characterName, x + 16, rowY);
            ctx.textAlign = 'right';
            ctx.fillStyle = hero.isDead ? '#8a1818' : '#2d6a3d';
            ctx.fillText(hero.isDead ? 'DOWN' : `HP ${hero.hp}/${hero.maxHp}`, x + w - 16, rowY);
            ctx.textAlign = 'left';
        }
    }

    private renderRewardsAndLosses(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
        drawParchmentPanel(ctx, x, y, w, h, { radius: 6, shadow: false, compact: true });
        this.renderSectionTitle(ctx, '보상 / 손실', x + 16, y + 16);

        const lines: Array<{ text: string; color: string }> = [];
        const outcome = this.outcome!;

        if (outcome.secured.length > 0) {
            lines.push({ text: '[확보 전리품]', color: '#2d6a3d' });
            for (const item of outcome.secured) {
                lines.push({ text: `${item.nameKr} x${item.quantity}`, color: Parchment.textDark });
            }
        }
        if ((outcome.goldReward ?? 0) > 0) lines.push({ text: `보상 골드 +${outcome.goldReward}G`, color: '#7a5410' });
        for (const quest of outcome.questRewards ?? []) lines.push({ text: quest, color: Parchment.textLabel });

        if (outcome.lost.length > 0) {
            lines.push({ text: '[잃은 배낭]', color: '#8a1818' });
            for (const item of outcome.lost) {
                lines.push({ text: `${item.nameKr} x${item.quantity}`, color: Parchment.textDark });
            }
        }
        if (outcome.equipmentLost.length > 0) {
            lines.push({ text: '[잃은 장비]', color: '#8a1818' });
            for (const loss of outcome.equipmentLost) {
                lines.push({ text: `${loss.characterName}: ${loss.item.nameKr}`, color: Parchment.textDark });
            }
        }
        for (const note of outcome.notes ?? []) lines.push({ text: note, color: Parchment.textMid });
        if (lines.length === 0) lines.push({ text: '변동된 보상이나 손실이 없습니다.', color: Parchment.textMuted });

        ctx.font = `13px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        let rowY = y + 52;
        for (const line of lines) {
            if (rowY > y + h - 18) break;
            ctx.fillStyle = line.color;
            ctx.fillText(line.text, x + 16, rowY);
            rowY += 22;
        }
    }

    private renderConfirm(ctx: CanvasRenderingContext2D, x: number, y: number): void {
        this.confirmRect = { x, y, w: 180, h: 42 };
        drawParchmentButton(ctx, x, y, 180, 42, '확인', 'default');
    }
}
