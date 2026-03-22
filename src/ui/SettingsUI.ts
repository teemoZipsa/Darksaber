import { t, i18n } from '../i18n/LanguageManager';
import { SettingsManager } from '../engine/SettingsManager';
import { KeyBindManager } from '../engine/KeyBindManager';

const BG = '#be8550';
const BG_DARK = '#a06e3c';
const BORDER = '#2d1f12';
const BORDER_LIGHT = '#e2b485';
const TEXT = '#2d1f12';
const FONT = '"DOSMyungjo", sans-serif';

type TabId = 'general' | 'display' | 'keybinds';

export class SettingsUI {
    private visible = false;
    private x = 0;
    private y = 0;
    private w = 420;
    private h = 440;
    private activeTab: TabId = 'general';
    
    private zones: { rect: number[], action: () => void }[] = [];

    public show(): void { this.visible = true; }
    public hide(): void { this.visible = false; }
    public isVisible(): boolean { return this.visible; }

    public onMouseMove(_mx: number, _my: number): void {}

    public onMouseDown(mx: number, my: number): boolean {
        if (!this.visible) return false;
        
        // If waiting for key rebind, ignore clicks
        if (KeyBindManager.isWaitingForKey()) return true;

        for (const zone of this.zones) {
            const [zx, zy, zw, zh] = zone.rect;
            if (mx >= zx && mx <= zx + zw && my >= zy && my <= zy + zh) {
                zone.action();
                return true;
            }
        }

        if (mx < this.x || mx > this.x + this.w || my < this.y || my > this.y + this.h) {
            this.hide();
            return true;
        }

        return true; 
    }

    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;

        this.x = Math.floor((canvasW - this.w) / 2);
        this.y = Math.floor((canvasH - this.h) / 2);
        this.zones = [];

        // ─── DIM BACKGROUND ──────────────────
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // ─── MAIN PANEL ─────────────────────
        ctx.fillStyle = BG;
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.strokeStyle = BORDER_LIGHT;
        ctx.lineWidth = 4;
        ctx.strokeRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4);
        ctx.strokeStyle = BORDER;
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.w, this.h);

        // ─── TITLE BAR ─────────────────────
        ctx.fillStyle = TEXT;
        ctx.font = `bold 20px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(t('settings.title'), this.x + this.w / 2, this.y + 32);
        ctx.textAlign = 'start';

        // Close button
        const closeX = this.x + this.w - 40;
        const closeY = this.y + 10;
        ctx.fillStyle = '#a03030';
        ctx.beginPath();
        ctx.roundRect(closeX, closeY, 28, 28, 4);
        ctx.fill();
        ctx.strokeStyle = BORDER;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(closeX, closeY, 28, 28, 4);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold 16px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('X', closeX + 14, closeY + 21);
        ctx.textAlign = 'start';
        this.zones.push({ rect: [closeX, closeY, 28, 28], action: () => this.hide() });

        // ─── TABS ───────────────────────────
        const tabs: { id: TabId, label: string }[] = [
            { id: 'general', label: i18n.lang === 'ko' ? '일반' : 'General' },
            { id: 'display', label: i18n.lang === 'ko' ? '화면' : 'Display' },
            { id: 'keybinds', label: i18n.lang === 'ko' ? '키 설정' : 'Keys' },
        ];
        const tabY = this.y + 48;
        const tabH = 30;
        const tabW = Math.floor((this.w - 20) / tabs.length);

        for (let i = 0; i < tabs.length; i++) {
            const tx = this.x + 10 + i * tabW;
            const isActive = this.activeTab === tabs[i].id;

            ctx.fillStyle = isActive ? BG : BG_DARK;
            ctx.beginPath();
            ctx.roundRect(tx, tabY, tabW, tabH, [6, 6, 0, 0]);
            ctx.fill();

            if (isActive) {
                ctx.strokeStyle = BORDER_LIGHT;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(tx, tabY, tabW, tabH, [6, 6, 0, 0]);
                ctx.stroke();
            }

            ctx.fillStyle = isActive ? TEXT : '#6b5030';
            ctx.font = `${isActive ? 'bold ' : ''}14px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.fillText(tabs[i].label, tx + tabW / 2, tabY + 21);
            ctx.textAlign = 'start';

            this.zones.push({ rect: [tx, tabY, tabW, tabH], action: () => { this.activeTab = tabs[i].id; } });
        }

        // Tab separator line
        ctx.strokeStyle = BORDER_LIGHT;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x + 6, tabY + tabH);
        ctx.lineTo(this.x + this.w - 6, tabY + tabH);
        ctx.stroke();

        // ─── TAB CONTENT ────────────────────
        const contentY = tabY + tabH + 12;
        let cy = contentY;

        const drawLabel = (label: string, yOff: number = 18) => {
            ctx.fillStyle = TEXT;
            ctx.font = `15px ${FONT}`;
            ctx.fillText(label, this.x + 30, cy + yOff);
        };

        const drawToggle = (label: string, isON: boolean, onToggle: () => void) => {
            drawLabel(label);
            const btnW = 60;
            const btnH = 26;
            const btnX = this.x + this.w - btnW - 30;
            const btnY = cy;
            ctx.fillStyle = isON ? '#408040' : '#804040';
            ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 4); ctx.fill();
            ctx.strokeStyle = BORDER; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 4); ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.font = `bold 13px ${FONT}`;
            ctx.fillText(isON ? t('settings.on') : t('settings.off'), btnX + btnW / 2, btnY + 18);
            ctx.textAlign = 'start';
            this.zones.push({ rect: [btnX, btnY, btnW, btnH], action: onToggle });
            cy += 34;
        };

        const drawButton = (label: string, btnText: string, action: () => void) => {
            drawLabel(label);
            ctx.font = `bold 13px ${FONT}`;
            const textW = ctx.measureText(btnText).width;
            const btnW = Math.max(60, textW + 24);
            const btnH = 26;
            const btnX = this.x + this.w - btnW - 30;
            const btnY = cy;
            ctx.fillStyle = '#5a4a38';
            ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 4); ctx.fill();
            ctx.strokeStyle = BORDER_LIGHT; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(btnX, btnY, btnW, btnH, 4); ctx.stroke();
            ctx.fillStyle = BORDER_LIGHT;
            ctx.textAlign = 'center';
            ctx.fillText(btnText, btnX + btnW / 2, btnY + 18);
            ctx.textAlign = 'start';
            this.zones.push({ rect: [btnX, btnY, btnW, btnH], action });
            cy += 34;
        };

        const drawDivider = () => {
            cy += 2;
            ctx.strokeStyle = 'rgba(90, 58, 24, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(this.x + 30, cy);
            ctx.lineTo(this.x + this.w - 30, cy);
            ctx.stroke();
            cy += 6;
        };

        // ━━━━━━━━━━━━━ TAB: GENERAL ━━━━━━━━━━━━━
        if (this.activeTab === 'general') {
            drawButton(t('settings.lang'), t('settings.langValue'), () => i18n.toggleLanguage());
            drawDivider();
            drawButton('UI 스케일', SettingsManager.getScaleLabel(), () => SettingsManager.cycleUIScale());
            drawDivider();
            drawToggle(t('settings.bgm'), !SettingsManager.getMuteBGM(), () => SettingsManager.setMuteBGM(!SettingsManager.getMuteBGM()));
            drawToggle(t('settings.sfx'), !SettingsManager.getMuteSFX(), () => SettingsManager.setMuteSFX(!SettingsManager.getMuteSFX()));
        }
        
        // ━━━━━━━━━━━━━ TAB: DISPLAY ━━━━━━━━━━━━━
        else if (this.activeTab === 'display') {
            drawToggle(t('settings.showGrid'), SettingsManager.getGrid(), () => SettingsManager.setGrid(!SettingsManager.getGrid()));
            drawToggle(t('settings.showFPS'), SettingsManager.getFPS(), () => SettingsManager.setFPS(!SettingsManager.getFPS()));
            drawDivider();
            drawButton(
                i18n.lang === 'ko' ? '최대 프레임' : 'FPS Limit',
                SettingsManager.getFPSLimitLabel(),
                () => SettingsManager.cycleFPSLimit()
            );
            drawToggle(
                i18n.lang === 'ko' ? '수직동기화' : 'VSync',
                SettingsManager.getVSync(),
                () => SettingsManager.setVSync(!SettingsManager.getVSync())
            );
        }
        
        // ━━━━━━━━━━━━━ TAB: KEYBINDS ━━━━━━━━━━━━
        else if (this.activeTab === 'keybinds') {
            const isKo = i18n.lang === 'ko';
            const allBinds = KeyBindManager.getAll();
            const waitingAction = KeyBindManager.getWaitingAction();

            // Header
            ctx.fillStyle = '#5a3a18';
            ctx.font = `bold 12px ${FONT}`;
            ctx.fillText(isKo ? '동작' : 'Action', this.x + 30, cy + 12);
            ctx.textAlign = 'right';
            ctx.fillText(isKo ? '키 (클릭하여 변경)' : 'Key (click to change)', this.x + this.w - 30, cy + 12);
            ctx.textAlign = 'start';
            cy += 18;

            ctx.strokeStyle = 'rgba(90, 58, 24, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(this.x + 20, cy);
            ctx.lineTo(this.x + this.w - 20, cy);
            ctx.stroke();
            cy += 4;

            for (const bind of allBinds) {
                const isWaiting = waitingAction === bind.action;
                const rowH = 24;

                // Row background for waiting state
                if (isWaiting) {
                    ctx.fillStyle = 'rgba(255, 200, 50, 0.25)';
                    ctx.fillRect(this.x + 20, cy, this.w - 40, rowH);
                }

                // Action label
                ctx.fillStyle = TEXT;
                ctx.font = `13px ${FONT}`;
                ctx.fillText(isKo ? bind.labelKo : bind.label, this.x + 30, cy + 16);

                // Key button
                const kbW = 80;
                const kbH = 20;
                const kbX = this.x + this.w - kbW - 30;
                const kbY = cy + 2;

                ctx.fillStyle = isWaiting ? '#e8c040' : '#5a4a38';
                ctx.beginPath(); ctx.roundRect(kbX, kbY, kbW, kbH, 3); ctx.fill();
                ctx.strokeStyle = isWaiting ? '#c8a030' : BORDER_LIGHT;
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.roundRect(kbX, kbY, kbW, kbH, 3); ctx.stroke();

                ctx.fillStyle = isWaiting ? TEXT : BORDER_LIGHT;
                ctx.font = `bold 12px ${FONT}`;
                ctx.textAlign = 'center';
                const displayText = isWaiting
                    ? (isKo ? '키를 누르세요' : 'Press key...')
                    : KeyBindManager.keyDisplayName(bind.code);
                ctx.fillText(displayText, kbX + kbW / 2, kbY + 15);
                ctx.textAlign = 'start';

                if (!isWaiting) {
                    this.zones.push({
                        rect: [kbX, kbY, kbW, kbH],
                        action: () => KeyBindManager.startRebind(bind.action)
                    });
                }

                cy += rowH;
            }

            // Reset button at bottom
            cy += 10;
            const resetW = 120;
            const resetH = 28;
            const resetX = this.x + (this.w - resetW) / 2;
            ctx.fillStyle = '#804040';
            ctx.beginPath(); ctx.roundRect(resetX, cy, resetW, resetH, 4); ctx.fill();
            ctx.strokeStyle = BORDER; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(resetX, cy, resetW, resetH, 4); ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = `bold 13px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.fillText(isKo ? '기본값으로 초기화' : 'Reset Defaults', resetX + resetW / 2, cy + 19);
            ctx.textAlign = 'start';
            this.zones.push({ rect: [resetX, cy, resetW, resetH], action: () => KeyBindManager.resetAll() });
        }
    }
}
