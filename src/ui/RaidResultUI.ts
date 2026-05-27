import { InputManager } from '../engine/InputManager';
import { RaidOutcome } from '../raid/RaidOutcome';
import { UI, drawGlassPanel, renderGameTitle } from './UITheme';

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
        drawGlassPanel(ctx, px, py, panelW, panelH, {
            bg: 'rgba(13, 15, 24, 0.96)',
            border: this.outcome.result === 'SURVIVED' ? 'rgba(90, 210, 120, 0.55)' : 'rgba(230, 80, 70, 0.55)',
            radius: 8,
        });

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `bold 30px ${UI.fontPrimary}`;
        ctx.fillStyle = this.outcome.result === 'SURVIVED' ? '#8ee69c' : '#e66f66';
        ctx.fillText(resultTitle(this.outcome.result), px + panelW / 2, py + 24);

        ctx.font = `13px ${UI.fontMono}`;
        ctx.fillStyle = 'rgba(255,255,255,0.62)';
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
        ctx.font = `bold 17px ${UI.fontPrimary}`;
        ctx.fillStyle = '#f0c050';
        ctx.textAlign = 'left';
        ctx.fillText(title, x, y);
    }

    private renderHeroes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
        drawGlassPanel(ctx, x, y, w, h, { bg: 'rgba(20, 20, 28, 0.75)', border: 'rgba(200,170,80,0.24)', radius: 6 });
        this.renderSectionTitle(ctx, '출격 영웅', x + 16, y + 16);

        const heroes = this.outcome?.heroStatuses ?? [];
        ctx.font = `13px ${UI.fontMono}`;
        ctx.textAlign = 'left';
        if (heroes.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillText('기록된 영웅 상태가 없습니다.', x + 16, y + 52);
            return;
        }

        for (let i = 0; i < heroes.length; i++) {
            const hero = heroes[i];
            const rowY = y + 52 + i * 38;
            if (rowY > y + h - 28) break;
            ctx.fillStyle = hero.isDead ? '#e66f66' : '#d8d0b8';
            ctx.fillText(hero.characterName, x + 16, rowY);
            ctx.textAlign = 'right';
            ctx.fillStyle = hero.isDead ? '#e66f66' : '#8ee69c';
            ctx.fillText(hero.isDead ? 'DOWN' : `HP ${hero.hp}/${hero.maxHp}`, x + w - 16, rowY);
            ctx.textAlign = 'left';
        }
    }

    private renderRewardsAndLosses(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
        drawGlassPanel(ctx, x, y, w, h, { bg: 'rgba(20, 20, 28, 0.75)', border: 'rgba(200,170,80,0.24)', radius: 6 });
        this.renderSectionTitle(ctx, '보상 / 손실', x + 16, y + 16);

        const lines: Array<{ text: string; color: string }> = [];
        const outcome = this.outcome!;

        if (outcome.secured.length > 0) {
            lines.push({ text: '[확보 전리품]', color: '#8ee69c' });
            for (const item of outcome.secured) {
                lines.push({ text: `${item.nameKr} x${item.quantity}`, color: '#d8d0b8' });
            }
        }
        if ((outcome.goldReward ?? 0) > 0) lines.push({ text: `보상 골드 +${outcome.goldReward}G`, color: '#ffd700' });
        for (const quest of outcome.questRewards ?? []) lines.push({ text: quest, color: '#f0c050' });

        if (outcome.lost.length > 0) {
            lines.push({ text: '[잃은 배낭]', color: '#e66f66' });
            for (const item of outcome.lost) {
                lines.push({ text: `${item.nameKr} x${item.quantity}`, color: '#d8d0b8' });
            }
        }
        if (outcome.equipmentLost.length > 0) {
            lines.push({ text: '[잃은 장비]', color: '#e66f66' });
            for (const loss of outcome.equipmentLost) {
                lines.push({ text: `${loss.characterName}: ${loss.item.nameKr}`, color: '#d8d0b8' });
            }
        }
        for (const note of outcome.notes ?? []) lines.push({ text: note, color: 'rgba(255,255,255,0.5)' });
        if (lines.length === 0) lines.push({ text: '변동된 보상이나 손실이 없습니다.', color: 'rgba(255,255,255,0.48)' });

        ctx.font = `12px ${UI.fontMono}`;
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
        ctx.fillStyle = 'rgba(140, 30, 30, 0.92)';
        ctx.fillRect(x, y, 180, 42);
        ctx.strokeStyle = '#c8a84e';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, 180, 42);
        ctx.font = `bold 17px ${UI.fontPrimary}`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('확인', x + 90, y + 21);
    }
}
