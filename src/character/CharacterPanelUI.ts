/**
 * CharacterPanelUI — Classic Darksaber '자기 정보' (Self Info) UI.
 * Renders the character portrait, basic info, and the detailed 16-stat grid.
 */

import { PartyManager } from '../character/PartyManager';
import { Character } from '../character/Character';
import { t } from '../i18n/LanguageManager';

const PANEL_W = 540;
const PANEL_H = 360;

// Classic Colors
const BG_WOOD = '#ce9e67';
const BORDER_DARK = '#3c0a0a';
const BORDER_LIGHT = '#e6c397';
const BOX_BG = '#be8550';
const TEXT_DARK = '#28170b';
const PORTRAIT_BG = '#6e7786';

export class CharacterPanelUI {
    private party: PartyManager;
    private visible: boolean = false;
    private panelX = 0;
    private panelY = 0;
    
    // For engine integration
    public getGold?: () => number;

    constructor(party: PartyManager) {
        this.party = party;
    }

    public toggle(): void { this.visible = !this.visible; }
    public isVisible(): boolean { return this.visible; }
    
    // We can add simple party cycling on click for now, if needed
    public onMouseMove(_sx: number, _sy: number): void {}
    public onClick(sx: number, sy: number): boolean {
        if (!this.visible) return false;

        // Check close button
        const cx = this.panelX + PANEL_W - 20;
        const cy = this.panelY + 20;
        if (Math.hypot(sx - cx, sy - cy) <= 15) {
            this.toggle();
            return true;
        }

        // Simple click anywhere to cycle party just to keep multiplayer testing easy
        if (sx >= this.panelX && sx <= this.panelX + PANEL_W && sy >= this.panelY && sy <= this.panelY + PANEL_H) {
            const chars = this.party.getCharacters();
            if (chars.length > 1) {
                let nextIdx = this.party.getActiveIndex() + 1;
                if (nextIdx >= chars.length) nextIdx = 0;
                this.party.switchTo(nextIdx);
                return true;
            }
        }
        return false;
    }

    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;

        this.panelX = Math.floor((canvasW - PANEL_W) / 2);
        this.panelY = Math.floor((canvasH - PANEL_H) / 2);




        const px = this.panelX;
        const py = this.panelY;
        const w = PANEL_W;
        const h = PANEL_H;

        // 1. Main Background (Wood)
        this.drawWoodPanel(ctx, px, py, w, h);

        const char = this.party.getActive();
        if (!char) return;

        // 2. Title Bar
        this.drawTitleBar(ctx, px, py, w);

        // 2.5 Close Button
        this.drawCloseButton(ctx, px, py, w);

        // 3. Left Column: Portrait & Extra Info
        this.drawLeftColumn(ctx, char, px, py);

        // 4. Right Top: Basic Info Grid
        this.drawBasicInfo(ctx, char, px + 160, py + 45, w - 175);

        // 5. Right Bottom: Detailed Stats Grid (16 slots)
        this.draw16StatGrid(ctx, char, px + 160, py + 185, w - 175);
    }

    private drawWoodPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
        ctx.fillStyle = BG_WOOD;
        ctx.fillRect(x, y, w, h);

        // Wood texture lines (simple)
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = '#5a3212';
        ctx.lineWidth = 1;
        for (let i = 0; i < h; i += 4) {
            ctx.beginPath();
            ctx.moveTo(x, y + i);
            let cx = x;
            while(cx < x + w) {
                const seg = Math.random() * 20 + 10;
                const wave = (Math.random() - 0.5) * 2;
                cx += seg;
                ctx.lineTo(Math.min(cx, x + w), y + i + wave);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        // Outer borders (double border)
        ctx.strokeStyle = BORDER_DARK;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);
        
        ctx.strokeStyle = BORDER_LIGHT;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
        ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
    }

    private drawTitleBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
        ctx.fillStyle = TEXT_DARK;
        ctx.font = 'bold 18px "DOSMyungjo", Dotum, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('info.title'), x + w / 2, y + 30);
        ctx.textAlign = 'start';

        // Title separator line
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 40);
        ctx.lineTo(x + w - 10, y + 40);
        ctx.strokeStyle = BORDER_DARK;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    private drawCloseButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
        const cx = x + w - 20;
        const cy = y + 20;
        const r = 12;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#b32424';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#3c0a0a';
        ctx.stroke();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy - 5);
        ctx.lineTo(cx + 5, cy + 5);
        ctx.moveTo(cx + 5, cy - 5);
        ctx.lineTo(cx - 5, cy + 5);
        ctx.stroke();
    }

    private drawLeftColumn(ctx: CanvasRenderingContext2D, char: Character, x: number, y: number): void {
        const portX = x + 15;
        const portY = y + 50;
        const portW = 130;
        const portH = 140;

        // Portrait Outer Box
        ctx.fillStyle = '#dbb88e';
        ctx.fillRect(portX, portY, portW, portH);
        ctx.strokeStyle = BORDER_DARK;
        ctx.lineWidth = 1;
        ctx.strokeRect(portX, portY, portW, portH);

        // Portrait Inner Shadow
        ctx.fillStyle = PORTRAIT_BG;
        ctx.fillRect(portX + 5, portY + 5, portW - 10, portH - 10);
        
        // Draw Inner frame
        ctx.strokeStyle = '#2a3441';
        ctx.lineWidth = 2;
        ctx.strokeRect(portX + 5, portY + 5, portW - 10, portH - 10);

        // Render Pixel Character
        this.renderPixelPortrait(ctx, char, portX + portW / 2, portY + portH - 20);

        // "Stat Adjustment" mockup below portrait (능력조정)
        const adjY = portY + portH + 70;
        ctx.fillStyle = TEXT_DARK;
        ctx.font = 'bold 14px "DOSMyungjo", Gulim, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('info.statAdj'), portX + portW / 2, adjY + 35);
        ctx.textAlign = 'start';

        // Small black box next to it (like in the image)
        ctx.fillStyle = '#000';
        ctx.fillRect(portX + 10, adjY - 10, 45, 45);
        ctx.strokeStyle = '#2b449b';
        ctx.lineWidth = 2;
        ctx.strokeRect(portX + 10, adjY - 10, 45, 45);
        
        ctx.fillStyle = TEXT_DARK;
        ctx.font = '14px monospace';
        ctx.fillText('X 0', portX + 65, adjY + 15);
    }

    private drawBasicInfo(ctx: CanvasRenderingContext2D, char: Character, x: number, y: number, w: number): void {
        ctx.fillStyle = BOX_BG;
        ctx.fillRect(x, y, w, 125);
        ctx.strokeStyle = BORDER_DARK;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, 125);

        const rowH = 25;
        // Inner horizontal lines
        ctx.beginPath();
        for (let i = 1; i <= 4; i++) {
            ctx.moveTo(x, y + i * rowH);
            ctx.lineTo(x + w, y + i * rowH);
        }
        // Vertical dividers in row 4 and 5 (Age/Gender split)
        ctx.moveTo(x + 50, y);
        ctx.lineTo(x + 50, y + 125);

        ctx.moveTo(x + 190, y + rowH * 3);
        ctx.lineTo(x + 190, y + rowH * 4); // Split for Gender
        ctx.moveTo(x + w - 40, y + rowH * 3);
        ctx.lineTo(x + w - 40, y + rowH * 4); // Gender text area
        
        ctx.stroke();

        ctx.fillStyle = TEXT_DARK;
        ctx.font = '14px "DOSMyungjo", Gulim, sans-serif';

        const drawCell = (col1: string, val1: string, r: number) => {
            const rowY = y + 18 + r * rowH;
            ctx.fillText(col1, x + 5, rowY);
            ctx.fillText(val1, x + 55, rowY);
        };

        drawCell(t('info.name'), char.name, 0);
        drawCell(t('info.class'), char.getTierName(), 1);
        drawCell(t('info.level'), `${char.level}`, 2);
        
        // Custom EXP render
        ctx.fillText(t('info.exp'), x + 5, y + 18 + 3 * rowH);
        ctx.fillText(`${char.exp} / ${char.expToNext}`, x + 55, y + 18 + 3 * rowH);
        
        // Age and Gender
        ctx.fillText(t('info.age'), x + 5, y + 18 + 4 * rowH);
        ctx.fillText(`${char.age}`, x + 55, y + 18 + 4 * rowH);
        ctx.fillText(t('info.gender'), x + 195, y + 18 + 4 * rowH);
        ctx.fillText(char.gender, x + w - 35, y + 18 + 4 * rowH);
    }

    private draw16StatGrid(ctx: CanvasRenderingContext2D, char: Character, x: number, y: number, w: number): void {
        const st = char.stats;
        const gold = this.getGold?.() ?? 0;
        
        // First draw the Gold row separately right above it according to image layout 
        // Oh wait, Gold is physically right above the physical stats. Let's draw it here.
        ctx.fillStyle = BOX_BG;
        ctx.fillRect(x, y - 35, w, 25);
        ctx.strokeStyle = BORDER_DARK;
        ctx.strokeRect(x, y - 35, w, 25);
        ctx.beginPath();
        ctx.moveTo(x + 50, y - 35);
        ctx.lineTo(x + 50, y - 10);
        ctx.stroke();

        ctx.fillStyle = TEXT_DARK;
        ctx.font = '14px "DOSMyungjo", Gulim, sans-serif';
        ctx.fillText(t('info.money'), x + 5, y - 18);
        ctx.fillText(`${gold}`, x + 55, y - 18);


        // 8x2 Detailed Stats Grid
        const gridH = 155;
        ctx.fillStyle = BOX_BG;
        ctx.fillRect(x, y, w, gridH);
        ctx.strokeStyle = BORDER_DARK;
        ctx.strokeRect(x, y, w, gridH);

        const rowH = Math.floor(gridH / 8);
        const colW = Math.floor(w / 2);

        // Grid lines
        ctx.beginPath();
        for (let i = 1; i < 8; i++) {
            ctx.moveTo(x, y + i * rowH);
            ctx.lineTo(x + w, y + i * rowH);
        }
        ctx.moveTo(x + colW, y);
        ctx.lineTo(x + colW, y + gridH);
        
        // Label dividers
        ctx.moveTo(x + 70, y);
        ctx.lineTo(x + 70, y + gridH);
        ctx.moveTo(x + colW + 70, y);
        ctx.lineTo(x + colW + 70, y + gridH);
        ctx.stroke();

        ctx.fillStyle = TEXT_DARK; // Fix for invisible text

        const renderStat = (labelKey: string, val: string | number, r: number, c: number) => {
            const cellX = x + c * colW;
            const cellY = y + 14 + r * rowH;
            ctx.fillText(t(labelKey), cellX + 5, cellY);
            ctx.textAlign = 'right';
            ctx.fillText(`${val}`, cellX + colW - 10, cellY);
            ctx.textAlign = 'start';
        };

        // Left Col
        renderStat('stat.hp', st.maxHp, 0, 0); 
        renderStat('stat.mp', st.maxMp, 1, 0);
        renderStat('stat.atk', st.atk, 2, 0);
        renderStat('stat.def', st.def, 3, 0);
        renderStat('stat.actionLimit', st.actionLimit || 15, 4, 0);
        renderStat('stat.mov', st.mov, 5, 0);
        renderStat('stat.magAtk', st.magAtk, 6, 0);
        renderStat('stat.magDef', st.magDef, 7, 0);

        // Right Col
        renderStat('stat.hit', st.hitRate, 0, 1);
        renderStat('stat.eva', st.evasion || 0, 1, 1);
        renderStat('stat.crit', st.critRate, 2, 1);
        renderStat('stat.magHit', st.magHit || 100, 3, 1);
        renderStat('stat.magEva', st.magEva || 0, 4, 1);
        renderStat('stat.cmd', st.cmdRange || 6, 5, 1);
        renderStat('stat.atkMod', st.atkMod || 0, 6, 1);
        renderStat('stat.defMod', st.defMod || 0, 7, 1);
    }

    private renderPixelPortrait(ctx: CanvasRenderingContext2D, char: Character, cx: number, cy: number): void {
        const s = 4.5; // Scale

        const px = (x: number, y: number, w: number, h: number, color: string) => {
            ctx.fillStyle = color;
            ctx.fillRect(cx + x * s, cy - 55 + y * s, w * s, h * s);
        };

        const hasHelm = char.equipment.has('head');
        const hasArmor = char.equipment.has('body');

        // Body base (head, shoulders only for portrait)
        px(-4, -2, 8, 3, '#3a2a1a');
        px(-5, 1, 10, 1, '#2d1f12');

        // HEAD
        if (hasHelm) {
            px(-5, -3, 10, 4, '#606878');
            px(-4, 1, 8, 1, '#505868');
            px(-3, 0, 6, 1, '#383838');
        }
        px(-3, 2, 6, 5, '#d4a574');
        px(-2, 3, 1, 1, '#1a1a1a');
        px(1, 3, 1, 1, '#1a1a1a');
        px(-1, 5, 2, 1, '#c48f60');

        // NECK
        px(-1, 7, 2, 2, '#c49a6c');

        // SHOULDERS/CHEST
        if (hasArmor) {
            px(-7, 9, 3, 4, '#4a5a70');   
            px(4, 9, 3, 4, '#4a5a70');    
            px(-5, 9, 10, 11, '#3a4a60'); 
            px(-4, 10, 8, 9, '#4a5f7a');  
        } else {
            px(-7, 9, 2, 9, '#c49a6c');
            px(5, 9, 2, 9, '#c49a6c');
            px(-5, 9, 10, 11, '#4a3a28');
            px(-4, 10, 8, 9, '#5a4a38');
        }
    }
}
