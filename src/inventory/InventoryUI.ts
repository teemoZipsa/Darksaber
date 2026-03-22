/**
 * InventoryUI — Dark and Darker inspired Canvas-rendered overlay with:
 *   - LEFT: External grid (Stash in lobby, Loot in raid)
 *   - CENTER: Large pixel art character with equipment slots arranged around body
 *   - RIGHT: Tarkov-style grid backpack
 *   - Full drag-and-drop between grid ↔ equip slots
 */

import { GridInventory, PlacedItem } from './GridInventory';
import { ItemDef, ItemSlot } from '../data/ItemDB';
import { Character } from '../character/Character';
import { t, i18n } from '../i18n/LanguageManager';

const CELL = 40;
const PAD = 12;
const CELL_BG = 'rgba(24, 28, 40, 0.95)';
const CELL_BORDER = 'rgba(50, 55, 70, 0.6)';
const HIGHLIGHT = 'rgba(200, 170, 80, 0.3)';
const VALID_DROP = 'rgba(80, 200, 80, 0.35)';
const INVALID_DROP = 'rgba(200, 50, 50, 0.3)';
const SLOT_FRAME = 'rgba(160, 130, 60, 0.7)';
const SLOT_FRAME_GLOW = 'rgba(200, 170, 80, 0.4)';
const EQUIP_CELL = 48; // Larger cells for equipment slots

interface EquipSlotDef {
    slot: ItemSlot;
    labelKey: string;
    bodyX: number;
    bodyY: number;
    w: number;
    h: number;
}

// Equipment slot positions arranged around the LARGE pixel character
// Layout matches original Darksaber: head top-center, accessories left/right, weapon/shield sides
const EQUIP_SLOTS: EquipSlotDef[] = [
    { slot: 'head',       labelKey: 'inv.head',      bodyX: -EQUIP_CELL/2,       bodyY: -210,  w: EQUIP_CELL, h: EQUIP_CELL },
    { slot: 'accessory',  labelKey: 'inv.accessory',  bodyX: -EQUIP_CELL - 56,   bodyY: -210,  w: EQUIP_CELL, h: EQUIP_CELL },
    { slot: 'accessory2', labelKey: 'inv.accessory',  bodyX: 56,                 bodyY: -210,  w: EQUIP_CELL, h: EQUIP_CELL },
    { slot: 'weapon',     labelKey: 'inv.weapon',     bodyX: -EQUIP_CELL - 56,   bodyY: -145,  w: EQUIP_CELL, h: Math.floor(EQUIP_CELL * 1.5) },
    { slot: 'body',       labelKey: 'inv.body',       bodyX: -EQUIP_CELL/2,      bodyY: -145,  w: EQUIP_CELL, h: Math.floor(EQUIP_CELL * 1.3) },
    { slot: 'shield',     labelKey: 'inv.shield',     bodyX: 56,                 bodyY: -145,  w: EQUIP_CELL, h: Math.floor(EQUIP_CELL * 1.5) },
    { slot: 'boots',      labelKey: 'inv.boots',      bodyX: -EQUIP_CELL/2,      bodyY: -70,   w: EQUIP_CELL, h: EQUIP_CELL },
];

/** Check if an item can be placed in a given equipment slot */
function slotAcceptsItem(uiSlot: ItemSlot, itemSlot: ItemSlot): boolean {
    if (uiSlot === itemSlot) return true;
    // Both accessory UI slots accept 'accessory' items
    if (uiSlot === 'accessory2' && itemSlot === 'accessory') return true;
    return false;
}

export class InventoryUI {
    private inventory: GridInventory;
    private externalGrid: GridInventory | null = null;
    private externalTitle: string = 'Loot';
    private visible: boolean = false;
    private hideCloseBtn: boolean = false;

    // Drag state
    private dragging: PlacedItem | null = null;
    private dragFromEquip: ItemSlot | null = null;
    private dragOffsetX: number = 0;
    private dragOffsetY: number = 0;
    private mouseX: number = 0;
    private mouseY: number = 0;

    // The character whose equipment we are managing.
    private activeChar: Character | null = null;

    // Char Window coordinates
    private charWinX = 0;
    private charWinY = 0;
    private charWinW = 0;
    private charWinH = 0;

    // Ext Window coordinates
    private extWinX = 0;
    private extWinY = 0;
    private extWinW = 0;
    private extWinH = 0;

    private draggingWindow: 'char' | 'ext' | null = null;
    private dragWinOffsetX = 0;
    private dragWinOffsetY = 0;
    private activeWindow: 'char' | 'ext' = 'char';
    private layoutInitialized = false;

    // Grid coordinates
    private gridStartX = 0;
    private gridStartY = 0;
    private bodyCenter = { x: 0, y: 0 };
    private extGridStartX = 0;
    private extGridStartY = 0;

    // Quick Transfer Tracking
    private dragStartMouseX = 0;
    private dragStartMouseY = 0;
    private dragSourceGrid: GridInventory | null = null;
    private dragSourceX = 0;
    private dragSourceY = 0;

    // Animation timer
    private animTimer: number = 0;

    constructor(inventory: GridInventory) {
        this.inventory = inventory;
    }

    public setActiveCharacter(char: Character): void {
        this.activeChar = char;
    }

    public setExternalGrid(grid: GridInventory | null, title: string = 'Loot'): void {
        this.externalGrid = grid;
        this.externalTitle = title;
        if (grid) {
            this.layoutInitialized = false;
            this.activeWindow = 'ext';
        }
    }

    public toggle(): void {
        this.visible = !this.visible;
        if (!this.visible) {
            this.dragging = null;
            this.dragFromEquip = null;
            this.draggingWindow = null;
        } else {
            this.layoutInitialized = false;
            this.activeWindow = 'char';
        }
    }

    public isVisible(): boolean { return this.visible; }

    public setHideCloseBtn(hide: boolean): void { this.hideCloseBtn = hide; }

    // Hover
    private hoverCell: { x: number; y: number; isExt: boolean } | null = null;
    private hoverEquip: ItemSlot | null = null;

    // ─── Input Handlers ─────────────────────────────────────────

    public onMouseMove(sx: number, sy: number): void {
        if (!this.visible) return;
        this.mouseX = sx;
        this.mouseY = sy;

        if (this.draggingWindow) {
            if (this.draggingWindow === 'char') {
                this.charWinX = sx - this.dragWinOffsetX;
                this.charWinY = sy - this.dragWinOffsetY;
            } else {
                this.extWinX = sx - this.dragWinOffsetX;
                this.extWinY = sy - this.dragWinOffsetY;
            }
            return;
        }

        let foundCell = false;

        // Update hover cell - Internal Grid
        const relX = sx - this.gridStartX;
        const relY = sy - this.gridStartY;
        const cx = Math.floor(relX / CELL);
        const cy = Math.floor(relY / CELL);
        
        if (cx >= 0 && cx < this.inventory.width && cy >= 0 && cy < this.inventory.height && relX >= 0 && relY >= 0) {
            this.hoverCell = { x: cx, y: cy, isExt: false };
            foundCell = true;
        } 
        
        // Update hover cell - External Grid
        if (!foundCell && this.externalGrid) {
            const extRelX = sx - this.extGridStartX;
            const extRelY = sy - this.extGridStartY;
            const ecx = Math.floor(extRelX / CELL);
            const ecy = Math.floor(extRelY / CELL);
            if (ecx >= 0 && ecx < this.externalGrid.width && ecy >= 0 && ecy < this.externalGrid.height && extRelX >= 0 && extRelY >= 0) {
                this.hoverCell = { x: ecx, y: ecy, isExt: true };
                foundCell = true;
            }
        }

        if (!foundCell) {
            this.hoverCell = null;
        }

        this.hoverEquip = this.getEquipSlotAt(sx, sy);
    }

    public onMouseDown(sx: number, sy: number): void {
        if (!this.visible) return;
        this.mouseX = sx;
        this.mouseY = sy;

        const checkExtWindow = () => {
            if (!this.externalGrid) return false;
            // close btn
            if (!this.hideCloseBtn) {
                const closeX = this.extWinX + this.extWinW - 28;
                const closeY = this.extWinY + 8;
                if (Math.hypot(sx - (closeX + 12), sy - (closeY + 12)) <= 12) {
                    this.setExternalGrid(null);
                    return true;
                }
            }
            // title bar drag
            if (sx >= this.extWinX && sx <= this.extWinX + this.extWinW &&
                sy >= this.extWinY && sy <= this.extWinY + 40) {
                this.draggingWindow = 'ext';
                this.dragWinOffsetX = sx - this.extWinX;
                this.dragWinOffsetY = sy - this.extWinY;
                this.activeWindow = 'ext';
                return true;
            }
            // focus
            if (sx >= this.extWinX && sx <= this.extWinX + this.extWinW &&
                sy >= this.extWinY && sy <= this.extWinY + this.extWinH) {
                this.activeWindow = 'ext';
            }
            return false;
        };

        const checkCharWindow = () => {
            if (!this.hideCloseBtn) {
                const closeX = this.charWinX + this.charWinW - 28;
                const closeY = this.charWinY + 8;
                if (Math.hypot(sx - (closeX + 12), sy - (closeY + 12)) <= 12) {
                    this.toggle();
                    return true;
                }
            }
            if (sx >= this.charWinX && sx <= this.charWinX + this.charWinW &&
                sy >= this.charWinY && sy <= this.charWinY + 40) {
                this.draggingWindow = 'char';
                this.dragWinOffsetX = sx - this.charWinX;
                this.dragWinOffsetY = sy - this.charWinY;
                this.activeWindow = 'char';
                return true;
            }
            if (sx >= this.charWinX && sx <= this.charWinX + this.charWinW &&
                sy >= this.charWinY && sy <= this.charWinY + this.charWinH) {
                this.activeWindow = 'char';
            }
            return false;
        };

        if (this.activeWindow === 'ext') {
            if (checkExtWindow()) return;
            if (checkCharWindow()) return;
        } else {
            if (checkCharWindow()) return;
            if (checkExtWindow()) return;
        }

        if (this.hoverCell) {
            const grid = this.hoverCell.isExt ? this.externalGrid! : this.inventory;
            const placed = grid.getAt(this.hoverCell.x, this.hoverCell.y);
            if (placed) {
                this.dragging = placed;
                this.dragFromEquip = null;
                const originX = this.hoverCell.isExt ? this.extGridStartX : this.gridStartX;
                const originY = this.hoverCell.isExt ? this.extGridStartY : this.gridStartY;
                this.dragOffsetX = sx - (originX + placed.gridX * CELL);
                this.dragOffsetY = sy - (originY + placed.gridY * CELL);
                
                // Track start for quick transfer
                this.dragStartMouseX = sx;
                this.dragStartMouseY = sy;
                this.dragSourceGrid = grid;
                this.dragSourceX = this.hoverCell.x;
                this.dragSourceY = this.hoverCell.y;
                
                grid.remove(placed);
                return;
            }
        }

        const eqSlot = this.getEquipSlotAt(sx, sy);
        if (eqSlot && this.activeChar && this.activeChar.equipment.has(eqSlot)) {
            const placed = this.activeChar.equipment.get(eqSlot)!;
            this.dragging = placed;
            this.dragFromEquip = eqSlot;
            this.dragOffsetX = placed.item.gridW * CELL / 2;
            this.dragOffsetY = placed.item.gridH * CELL / 2;
            
            // Track start for quick transfer (equip -> bag/ext)
            this.dragStartMouseX = sx;
            this.dragStartMouseY = sy;
            this.dragSourceGrid = null; // means from equip
            
            this.activeChar.unequip(eqSlot);
        }
    }

    public onMouseUp(sx: number, sy: number): void {
        if (!this.visible) return;
        
        if (this.draggingWindow) {
            this.draggingWindow = null;
            return;
        }

        if (!this.dragging) return;

        const item = this.dragging;
        let placed = false;

        // Quick Transfer Check (if mouse moved less than 5px)
        const dist = Math.hypot(sx - this.dragStartMouseX, sy - this.dragStartMouseY);
        if (dist < 5) {
            // It's a click! Transfer to the other inventory.
            let targetGrid: GridInventory | null = null;
            
            if (this.dragSourceGrid === this.inventory) {
                targetGrid = this.externalGrid; // Bag -> Ext
            } else if (this.dragSourceGrid === this.externalGrid) {
                targetGrid = this.inventory;    // Ext -> Bag
            } else if (this.dragSourceGrid === null) { // Equip -> Bag
                targetGrid = this.inventory; 
            }
            
            if (targetGrid) {
                const result = targetGrid.autoPlace(item.item);
                if (result) {
                    result.durability = item.durability;
                    placed = true;
                }
            }
        }

        if (!placed) {
            const eqSlot = this.getEquipSlotAt(sx, sy);
            if (eqSlot && slotAcceptsItem(eqSlot, item.item.slot) && this.activeChar) {
                const existing = this.activeChar.equipment.get(eqSlot);
                if (existing) {
                    this.inventory.autoPlace(existing.item);
                }
                this.activeChar.equipment.set(eqSlot, item);
                placed = true;
            }
        }

        if (!placed && this.hoverCell) {
            const targetGrid = this.hoverCell.isExt ? this.externalGrid! : this.inventory;
            const result = targetGrid.place(item.item, this.hoverCell.x, this.hoverCell.y);
            if (result) {
                result.durability = item.durability;
                placed = true;
            }
        }

        if (!placed) {
            if (this.dragFromEquip && this.activeChar) {
                this.activeChar.equip(item);
            } else if (this.dragSourceGrid) {
                const result = this.dragSourceGrid.place(item.item, this.dragSourceX, this.dragSourceY);
                if (!result) { // Fallback if blocked
                    const fallback = this.dragSourceGrid.autoPlace(item.item);
                    if (fallback) fallback.durability = item.durability;
                } else {
                    result.durability = item.durability;
                }
            }
        }

        this.dragging = null;
        this.dragFromEquip = null;
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private getEquipSlotAt(sx: number, sy: number): ItemSlot | null {
        for (const def of EQUIP_SLOTS) {
            const slotX = this.bodyCenter.x + def.bodyX;
            const slotY = this.bodyCenter.y + def.bodyY;
            if (sx >= slotX && sx <= slotX + def.w && sy >= slotY && sy <= slotY + def.h) {
                return def.slot;
            }
        }
        return null;
    }

    public getEquipped(slot: ItemSlot): PlacedItem | undefined {
        return this.activeChar ? this.activeChar.equipment.get(slot) : undefined;
    }

    // ─── Render ──────────────────────────────────────────────────

    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;

        this.animTimer += 0.016;

        const gridPixelW = this.inventory.width * CELL;
        const gridPixelH = this.inventory.height * CELL;
        const charAreaW = 340;
        const charPanelMinH = 420;
        
        // ─── Set Dimensions ───
        this.charWinW = charAreaW + gridPixelW + PAD * 3;
        this.charWinH = Math.max(gridPixelH + 80, charPanelMinH + 50);

        if (this.externalGrid) {
            this.extWinW = this.externalGrid.width * CELL + PAD * 2;
            this.extWinH = this.externalGrid.height * CELL + 80;
        }

        // ─── Initialize Layout ───
        if (!this.layoutInitialized) {
            if (this.externalGrid) {
                const totalW = this.extWinW + 40 + this.charWinW;
                this.extWinX = Math.floor(canvasW / 2 - totalW / 2);
                this.extWinY = Math.floor((canvasH - this.extWinH) / 2);

                this.charWinX = this.extWinX + this.extWinW + 40;
                this.charWinY = Math.floor((canvasH - this.charWinH) / 2);
            } else {
                this.charWinX = Math.floor((canvasW - this.charWinW) / 2);
                this.charWinY = Math.floor((canvasH - this.charWinH) / 2);
            }
            this.layoutInitialized = true;
        }

        // Keep inside bounds roughly
        this.charWinX = Math.max(0, Math.min(this.charWinX, canvasW - 50));
        this.charWinY = Math.max(0, Math.min(this.charWinY, canvasH - 40));
        this.extWinX = Math.max(0, Math.min(this.extWinX, canvasW - 50));
        this.extWinY = Math.max(0, Math.min(this.extWinY, canvasH - 40));




        // ─── Window Rendering Closures ───
        const renderExtWindow = () => {
            if (!this.externalGrid) return;
            this.renderPanelBackground(ctx, this.extWinX, this.extWinY, this.extWinW, this.extWinH);
            this.renderTitleBar(ctx, this.extWinX, this.extWinY, this.extWinW, this.externalTitle);

            this.extGridStartX = this.extWinX + PAD;
            this.extGridStartY = this.extWinY + 50;

            this.renderGridBase(ctx, this.externalGrid, this.extGridStartX, this.extGridStartY, true);
        };

        const renderCharWindow = () => {
            this.renderPanelBackground(ctx, this.charWinX, this.charWinY, this.charWinW, this.charWinH);
            this.renderTitleBar(ctx, this.charWinX, this.charWinY, this.charWinW, t('inv.title'));

            const charPanelX = this.charWinX + PAD;
            const charPanelH = this.charWinH - 50;
            this.bodyCenter.x = charPanelX + charAreaW / 2;
            this.bodyCenter.y = this.charWinY + 250; 

            // Character panel dark background
            ctx.fillStyle = 'rgba(10, 12, 20, 0.95)';
            ctx.fillRect(charPanelX, this.charWinY + 38, charAreaW, charPanelH);
            
            // Ornate double-border for character panel
            ctx.strokeStyle = '#8a7030';
            ctx.lineWidth = 2;
            ctx.strokeRect(charPanelX + 1, this.charWinY + 39, charAreaW - 2, charPanelH - 2);
            ctx.strokeStyle = 'rgba(200, 170, 80, 0.2)';
            ctx.lineWidth = 1;
            ctx.strokeRect(charPanelX + 4, this.charWinY + 42, charAreaW - 8, charPanelH - 8);

            this.renderPixelCharacter(ctx);
            this.renderEquipmentSlots(ctx);
            this.renderCharacterInfo(ctx, charPanelX, charAreaW);

            // Grid Backpack (right)
            this.gridStartX = charPanelX + charAreaW + PAD;
            this.gridStartY = this.charWinY + 50;

            ctx.fillStyle = '#888';
            ctx.font = 'bold 14px DOSMyungjo, sans-serif';
            ctx.fillText(t('inv.backpack'), this.gridStartX, this.gridStartY - 14);

            ctx.strokeStyle = '#605030';
            ctx.lineWidth = 1;
            ctx.strokeRect(this.gridStartX - 1, this.gridStartY - 1, gridPixelW + 2, gridPixelH + 2);

            this.renderGridBase(ctx, this.inventory, this.gridStartX, this.gridStartY, false);
        };

        // Draw active frontmost window last
        if (this.activeWindow === 'char') {
            renderExtWindow();
            renderCharWindow();
        } else {
            renderCharWindow();
            renderExtWindow();
        }

        this.renderTooltip(ctx);
        this.renderDraggedItem(ctx);
    }

    private renderTitleBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, text: string): void {
        ctx.font = 'bold 20px DOSMyungjo, sans-serif';
        const titleW = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(8, 10, 18, 1.0)';
        ctx.fillRect(x + w / 2 - titleW / 2 - 20, y - 2, titleW + 40, 6);

        ctx.fillStyle = '#c8a84e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w / 2, y + 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';

        if (!this.hideCloseBtn) {
            const closeBtnX = x + w - 28;
            const closeBtnY = y + 8;
            ctx.beginPath();
            ctx.arc(closeBtnX + 12, closeBtnY + 12, 12, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(180,50,50,0.7)';
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px "DOSMyungjo", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✕', closeBtnX + 12, closeBtnY + 12);
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'start';
        }
    }

    private renderPanelBackground(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
        ctx.fillStyle = 'rgba(8, 10, 18, 0.97)';
        ctx.fillRect(x, y, w, h);

        // Stone texture
        ctx.globalAlpha = 0.04;
        for (let ty = 0; ty < h; ty += 10) {
            for (let tx = 0; tx < w; tx += 10) {
                const noise = Math.sin(tx * 0.3 + ty * 0.7) * 0.5 + 0.5;
                ctx.fillStyle = noise > 0.5 ? '#444' : '#222';
                ctx.fillRect(x + tx, y + ty, 10, 10);
            }
        }
        ctx.globalAlpha = 1;

        // Gold border
        ctx.strokeStyle = '#8a7030';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        ctx.strokeStyle = 'rgba(200, 170, 80, 0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

        // Corner ornaments
        const cs = 14;
        ctx.fillStyle = '#a08040';
        ctx.fillRect(x, y, cs, 3); ctx.fillRect(x, y, 3, cs);
        ctx.fillRect(x + w - cs, y, cs, 3); ctx.fillRect(x + w - 3, y, 3, cs);
        ctx.fillRect(x, y + h - 3, cs, 3); ctx.fillRect(x, y + h - cs, 3, cs);
        ctx.fillRect(x + w - cs, y + h - 3, cs, 3); ctx.fillRect(x + w - 3, y + h - cs, 3, cs);
    }

    private renderPixelCharacter(ctx: CanvasRenderingContext2D): void {
        const cx = this.bodyCenter.x;
        const cy = this.bodyCenter.y;
        const s = 5; // LARGE pixel scale (was 3)

        ctx.save();

        // Ambient glow behind character
        const gradient = ctx.createRadialGradient(cx, cy - 50, 20, cx, cy - 50, 140);
        gradient.addColorStop(0, 'rgba(200, 170, 80, 0.06)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(cx - 150, cy - 220, 300, 300);

        // Floor shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(cx, cy - 100 + 32*s, 30, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        const px = (x: number, y: number, w: number, h: number, color: string) => {
            ctx.fillStyle = color;
            ctx.fillRect(cx + x * s, cy - 100 - 55 + y * s, w * s, h * s);
        };

        // Equipment checks
        const hasHelm = this.activeChar?.equipment.has('head');
        const hasArmor = this.activeChar?.equipment.has('body');
        const hasWeapon = this.activeChar?.equipment.has('weapon');
        const hasShield = this.activeChar?.equipment.has('shield');
        const hasBoots = this.activeChar?.equipment.has('boots');

        // ─── HAIR ───
        px(-4, -2, 8, 3, '#3a2a1a');
        px(-5, 1, 10, 1, '#2d1f12');

        // ─── HEAD ───
        if (hasHelm) {
            px(-5, -3, 10, 4, '#606878');
            px(-4, 1, 8, 1, '#505868');
            // Visor slit
            px(-3, 0, 6, 1, '#383838');
        }
        px(-3, 2, 6, 5, '#d4a574');
        px(-2, 3, 1, 1, '#1a1a1a');  // left eye
        px(1, 3, 1, 1, '#1a1a1a');   // right eye
        px(-1, 5, 2, 1, '#c48f60');  // mouth

        // ─── NECK ───
        px(-1, 7, 2, 2, '#c49a6c');

        // ─── TORSO ───
        if (hasArmor) {
            px(-7, 9, 3, 4, '#4a5a70');   // left pauldron
            px(4, 9, 3, 4, '#4a5a70');    // right pauldron
            px(-5, 9, 10, 11, '#3a4a60'); // chest plate
            px(-4, 10, 8, 9, '#4a5f7a');  // inner plate
            px(-3, 12, 6, 2, '#5a6a80');  // chest highlight
            px(-5, 20, 10, 2, '#8a7030'); // belt
            px(-1, 20, 2, 2, '#c8a84e');  // buckle
        } else {
            px(-5, 9, 10, 11, '#4a3a28');
            px(-4, 10, 8, 9, '#5a4a38');
            px(-5, 20, 10, 2, '#3a2a18');
        }

        // ─── ARMS ───
        px(-7, 13, 2, 9, '#c49a6c');   // left arm
        px(5, 13, 2, 9, '#c49a6c');    // right arm
        // Hands
        px(-7, 22, 2, 2, '#d4a574');
        px(5, 22, 2, 2, '#d4a574');

        // ─── WEAPON (left hand) ───
        if (hasWeapon) {
            // Sword blade
            px(-9, 8, 1, 16, '#c0c0c0');
            px(-9, 7, 1, 1, '#e0e0e0');  // tip
            px(-9, 6, 1, 1, '#fff');     // tip shine
            // Handle/guard
            px(-10, 24, 3, 1, '#8a7030');
            px(-9, 25, 1, 3, '#5a3a1a');
            // Blade glow
            const glowAlpha = 0.12 + Math.sin(this.animTimer * 2.5) * 0.08;
            ctx.fillStyle = `rgba(100, 180, 255, ${glowAlpha})`;
            ctx.fillRect(cx + -10 * s, cy - 100 - 55 + 6 * s, 3 * s, 19 * s);
        }

        // ─── SHIELD (right hand) ───
        if (hasShield) {
            px(7, 12, 5, 8, '#6a5020');
            px(8, 13, 3, 6, '#8a7030');
            px(9, 15, 1, 2, '#c8a84e'); // center emblem
        }

        // ─── LEGS ───
        px(-4, 22, 3, 8, '#33302a');
        px(1, 22, 3, 8, '#33302a');

        // ─── BOOTS ───
        if (hasBoots) {
            px(-5, 30, 4, 3, '#5a3a18');
            px(1, 30, 4, 3, '#5a3a18');
            px(-5, 32, 5, 1, '#4a2a0e');
            px(1, 32, 5, 1, '#4a2a0e');
        } else {
            px(-4, 30, 3, 2, '#c49a6c');
            px(1, 30, 2, 2, '#c49a6c');
        }

        ctx.restore();
    }

    private renderEquipmentSlots(ctx: CanvasRenderingContext2D): void {
        const cx = this.bodyCenter.x;
        const cy = this.bodyCenter.y;

        for (const def of EQUIP_SLOTS) {
            const slotX = cx + def.bodyX;
            const slotY = cy + def.bodyY;

            const isHover = this.hoverEquip === def.slot;
            const isValidDrop = this.dragging && slotAcceptsItem(def.slot, this.dragging.item.slot);

            // Slot background with inset shadow feel
            ctx.fillStyle = isHover && isValidDrop ? VALID_DROP : 
                            isHover ? HIGHLIGHT : 'rgba(12, 15, 25, 0.92)';
            ctx.fillRect(slotX, slotY, def.w, def.h);

            // Ornate frame
            ctx.strokeStyle = isValidDrop && isHover ? '#66cc66' : 
                              isHover ? SLOT_FRAME_GLOW : SLOT_FRAME;
            ctx.lineWidth = isHover ? 2.5 : 1.5;
            ctx.strokeRect(slotX, slotY, def.w, def.h);

            // Corner dots
            if (!isHover) {
                ctx.fillStyle = SLOT_FRAME;
                const d = 3;
                ctx.fillRect(slotX - 1, slotY - 1, d, d);
                ctx.fillRect(slotX + def.w - d + 1, slotY - 1, d, d);
                ctx.fillRect(slotX - 1, slotY + def.h - d + 1, d, d);
                ctx.fillRect(slotX + def.w - d + 1, slotY + def.h - d + 1, d, d);
            }

            // Equipped item or slot label
            const equipped = this.activeChar ? this.activeChar.equipment.get(def.slot) : undefined;
            if (equipped) {
                ctx.fillStyle = equipped.item.color + '88';
                ctx.fillRect(slotX + 3, slotY + 3, def.w - 6, def.h - 6);
                ctx.font = '22px serif';
                ctx.textAlign = 'center';
                ctx.fillText(equipped.item.icon, slotX + def.w / 2, slotY + def.h / 2 + 7);
                ctx.textAlign = 'start';
            } else {
                ctx.font = '9px DOSMyungjo, sans-serif';
                ctx.textAlign = 'center';
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = '#a08040';
                ctx.fillText(t(def.labelKey), slotX + def.w / 2, slotY + def.h / 2 + 3);
                ctx.globalAlpha = 1;
                ctx.textAlign = 'start';
            }
        }
    }

    private renderCharacterInfo(ctx: CanvasRenderingContext2D, panelX: number, panelW: number): void {
        if (!this.activeChar) return;

        const infoY = this.bodyCenter.y + 25; // Increased gap from character boots

        // Decorative divider line
        ctx.strokeStyle = 'rgba(200, 170, 80, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(panelX + 20, infoY - 8);
        ctx.lineTo(panelX + panelW - 20, infoY - 8);
        ctx.stroke();

        // Character name — prominent
        ctx.fillStyle = '#c8a84e';
        ctx.font = 'bold 16px DOSMyungjo, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.activeChar.name, panelX + panelW / 2, infoY + 10);

        // Class/level
        ctx.fillStyle = '#999';
        ctx.font = '12px DOSMyungjo, sans-serif';
        ctx.fillText(
            `${t('char.level')} ${this.activeChar.level}`,
            panelX + panelW / 2, infoY + 22
        );

        // HP bar
        const stats = this.activeChar.stats;
        const barX = panelX + 24;
        const barW = panelW - 48;
        let sy = infoY + 34;

        this.renderStatBar(ctx, barX, sy, barW, 14, stats.hp, stats.maxHp, '#601818', '#cc3030', 'HP');
        sy += 18;
        this.renderStatBar(ctx, barX, sy, barW, 14, stats.mp, stats.maxMp, '#182860', '#3060cc', 'MP');
        sy += 18;
        this.renderStatBar(ctx, barX, sy, barW, 14, this.activeChar.exp, this.activeChar.expToNext, '#4a3a10', '#c8a84e', 'EXP');
        sy += 28;

        // Stat grid — 2x4 columns, clear labels
        ctx.font = '12px "DOSMyungjo", sans-serif';
        const col1 = barX;
        const col2 = barX + barW / 2 + 4;

        ctx.fillStyle = '#bb9944';
        ctx.textAlign = 'left';
        
        ctx.fillText(`⚔ ${t('stat.atk')} ${stats.atk}`, col1, sy);
        ctx.fillText(`🛡 ${t('stat.def')} ${stats.def}`, col2, sy);
        sy += 18;
        ctx.fillText(`✨ ${t('stat.magAtk')} ${stats.magAtk}`, col1, sy);
        ctx.fillText(`🔮 ${t('stat.magDef')} ${stats.magDef}`, col2, sy);
        sy += 18;
        ctx.fillText(`🎯 ${t('stat.hit')} ${stats.hitRate}`, col1, sy);
        ctx.fillText(`💨 ${t('stat.eva')} ${stats.evasion || 0}`, col2, sy);
        sy += 18;
        ctx.fillText(`👟 ${t('stat.mov')} ${stats.mov}`, col1, sy);
        ctx.fillText(`⚡ ${t('stat.crit')} ${stats.critRate}`, col2, sy);

        ctx.textAlign = 'start';
    }

    private renderStatBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
                         current: number, max: number, bgColor: string, fgColor: string, label: string): void {
        ctx.fillStyle = bgColor;
        ctx.fillRect(x, y, w, h);

        const ratio = Math.max(0, Math.min(1, current / max));
        ctx.fillStyle = fgColor;
        ctx.fillRect(x, y, w * ratio, h);

        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px DOSMyungjo, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${label} ${current}/${max}`, x + w / 2, y + h - 3);
        ctx.textAlign = 'start';
    }

    private renderGridBase(ctx: CanvasRenderingContext2D, grid: GridInventory, gx: number, gy: number, isExt: boolean): void {
        for (let y = 0; y < grid.height; y++) {
            for (let x = 0; x < grid.width; x++) {
                const cx = gx + x * CELL;
                const cy = gy + y * CELL;
                ctx.fillStyle = CELL_BG;
                ctx.fillRect(cx, cy, CELL, CELL);
                ctx.strokeStyle = CELL_BORDER;
                ctx.lineWidth = 0.5;
                ctx.strokeRect(cx, cy, CELL, CELL);
            }
        }

        const rendered = new Set<PlacedItem>();
        for (const placed of grid.items) {
            if (rendered.has(placed)) continue;
            rendered.add(placed);
            this.renderItemInGrid(ctx, placed, gx, gy);
        }

        if (this.dragging && this.hoverCell && this.hoverCell.isExt === isExt) {
            const dropX = this.hoverCell.x;
            const dropY = this.hoverCell.y;
            const canDrop = grid.canPlace(this.dragging.item, dropX, dropY);

            for (let dy = 0; dy < this.dragging.item.gridH; dy++) {
                for (let dx = 0; dx < this.dragging.item.gridW; dx++) {
                    const cx = gx + (dropX + dx) * CELL;
                    const cy = gy + (dropY + dy) * CELL;
                    if (dropX + dx < grid.width && dropY + dy < grid.height) {
                        ctx.fillStyle = canDrop ? VALID_DROP : INVALID_DROP;
                        ctx.fillRect(cx, cy, CELL, CELL);
                    }
                }
            }
        }

        if (!this.dragging && this.hoverCell && this.hoverCell.isExt === isExt) {
            const hx = gx + this.hoverCell.x * CELL;
            const hy = gy + this.hoverCell.y * CELL;
            ctx.fillStyle = HIGHLIGHT;
            ctx.fillRect(hx, hy, CELL, CELL);
        }
    }

    private renderItemInGrid(ctx: CanvasRenderingContext2D, placed: PlacedItem, gridOriginX: number, gridOriginY: number): void {
        const ix = gridOriginX + placed.gridX * CELL;
        const iy = gridOriginY + placed.gridY * CELL;
        const iw = placed.item.gridW * CELL;
        const ih = placed.item.gridH * CELL;

        ctx.fillStyle = placed.item.color + '55';
        ctx.fillRect(ix + 2, iy + 2, iw - 4, ih - 4);
        ctx.strokeStyle = 'rgba(200, 170, 80, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(ix + 2, iy + 2, iw - 4, ih - 4);

        ctx.font = '18px serif';
        ctx.textAlign = 'center';
        ctx.fillText(placed.item.icon, ix + iw / 2, iy + ih / 2 + 6);
        ctx.textAlign = 'start';

        if (placed.item.maxDurability > 1) {
            const durRatio = placed.durability / placed.item.maxDurability;
            const barW = iw - 8;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(ix + 4, iy + ih - 10, barW, 4);
            ctx.fillStyle = durRatio > 0.5 ? '#44cc44' : durRatio > 0.2 ? '#ccaa00' : '#cc4444';
            ctx.fillRect(ix + 4, iy + ih - 10, barW * durRatio, 4);
        }
    }

    private renderDraggedItem(ctx: CanvasRenderingContext2D): void {
        if (!this.dragging) return;
        const item = this.dragging.item;
        const dx = this.mouseX - this.dragOffsetX;
        const dy = this.mouseY - this.dragOffsetY;
        const iw = item.gridW * CELL;
        const ih = item.gridH * CELL;

        ctx.globalAlpha = 0.85;
        ctx.fillStyle = item.color + 'cc';
        ctx.fillRect(dx, dy, iw, ih);
        ctx.strokeStyle = '#c8a84e';
        ctx.lineWidth = 2;
        ctx.strokeRect(dx, dy, iw, ih);

        ctx.font = '20px serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.icon, dx + iw / 2, dy + ih / 2 + 6);
        ctx.textAlign = 'start';
        ctx.globalAlpha = 1;
    }

    private renderTooltip(ctx: CanvasRenderingContext2D): void {
        if (this.dragging) return;
        
        let item: ItemDef | null = null;
        
        if (this.hoverCell) {
            const targetGrid = this.hoverCell.isExt ? this.externalGrid! : this.inventory;
            const placed = targetGrid.getAt(this.hoverCell.x, this.hoverCell.y);
            if (placed) item = placed.item;
        }

        if (!item && this.hoverEquip && this.activeChar) {
            const eq = this.activeChar.equipment.get(this.hoverEquip);
            if (eq) item = eq.item;
        }

        if (!item) return;

        const tx = this.mouseX + 16;
        const ty = this.mouseY;
        const tw = 220;
        const th = 120;

        ctx.fillStyle = 'rgba(8, 10, 18, 0.97)';
        ctx.fillRect(tx, ty, tw, th);
        ctx.strokeStyle = SLOT_FRAME;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tx, ty, tw, th);

        ctx.fillStyle = item.color || '#c8a84e';
        ctx.font = 'bold 13px DOSMyungjo, sans-serif';
        const itemName = i18n.lang === 'ko' ? item.nameKr : item.name;
        ctx.fillText(`${item.icon} ${itemName}`, tx + 8, ty + 20);

        ctx.fillStyle = '#888';
        ctx.font = '10px DOSMyungjo, sans-serif';
        const itemDesc = (i18n.lang === 'ko' && item.descriptionKr) ? item.descriptionKr : item.description;
        ctx.fillText(itemDesc, tx + 8, ty + 36);

        let sy = 52;
        ctx.fillStyle = '#88ff88';
        ctx.font = '11px DOSMyungjo, sans-serif';
        if (item.stats?.atk) { ctx.fillText(`공격력 +${item.stats.atk}`, tx + 8, ty + sy); sy += 14; }
        if (item.stats?.def) { ctx.fillText(`방어력 +${item.stats.def}`, tx + 8, ty + sy); sy += 14; }
        if (item.stats?.magAtk) { ctx.fillText(`마공 +${item.stats.magAtk}`, tx + 8, ty + sy); sy += 14; }
        if (item.stats?.magDef) { ctx.fillText(`마방 +${item.stats.magDef}`, tx + 8, ty + sy); sy += 14; }
        if (item.stats?.hp) { ctx.fillText(`HP +${item.stats.hp}`, tx + 8, ty + sy); sy += 14; }
        if (item.stats?.mp) { ctx.fillText(`MP +${item.stats.mp}`, tx + 8, ty + sy); sy += 14; }

        if (item.buyPrice) {
            ctx.fillStyle = '#c8a84e';
            ctx.fillText(`💰 ${item.buyPrice}G`, tx + 8, ty + sy);
        }
    }
}
