/**
 * LobbyUI — The preparation screen.
 * Shows:
 * 1. Stash (Huge GridInventory for safe storage)
 * 2. Active Character's equipment & backpack
 * 3. Deploy/Raid button
 */

import { GridInventory } from '../inventory/GridInventory';
import { PartyManager } from '../character/PartyManager';
import { InventoryUI } from '../inventory/InventoryUI';
import { InputManager } from '../engine/InputManager';
import { t, i18n } from '../i18n/LanguageManager';

const STASH_W = 15;
const STASH_H = 10;

export class LobbyUI {
    public stash: GridInventory;
    private charInventoryUI: InventoryUI;

    // State
    private visible: boolean = false;
    private onDeployAction: (() => void) | null = null;
    
    // Canvas dimensions for input checks
    private lastW: number = 800;
    private lastH: number = 600;
    
    private party: PartyManager;
    
    constructor(party: PartyManager, activeCharInv: GridInventory) {
        this.party = party;
        this.stash = new GridInventory(STASH_W, STASH_H);
        this.charInventoryUI = new InventoryUI(activeCharInv);
        this.charInventoryUI.setExternalGrid(this.stash, t('lobby.stash'));
    }

    public onDeploy(callback: () => void) {
        this.onDeployAction = callback;
    }

    public toggle(): void {
        this.visible = !this.visible;
        if (this.visible && !this.charInventoryUI.isVisible()) {
            this.charInventoryUI.toggle();
        } else if (!this.visible && this.charInventoryUI.isVisible()) {
            this.charInventoryUI.toggle();
        }
    }
    
    public isVisible(): boolean { return this.visible; }

    public updateInput(input: InputManager): void {
        if (!this.visible) return;

        this.charInventoryUI.onMouseMove(input.mouseScreenX, input.mouseScreenY);
        
        if (input.mouseJustDown) {
            // Check Language Toggle
            const langX = this.lastW - 160;
            const langY = 20;
            if (input.mouseScreenX >= langX && input.mouseScreenX <= langX + 140 &&
                input.mouseScreenY >= langY && input.mouseScreenY <= langY + 40) {
                i18n.toggleLanguage();
                this.charInventoryUI.setExternalGrid(this.stash, t('lobby.stash'));
                return;
            }

            // Check if Deploy clicked
            const btnX = this.lastW / 2 - 100;
            const btnY = this.lastH - 80;
            const btnW = 200;
            const btnH = 80; // Expanded hitbox to canvas bottom
            
            if (input.mouseScreenX >= btnX && input.mouseScreenX <= btnX + btnW &&
                input.mouseScreenY >= btnY && input.mouseScreenY <= btnY + btnH) {
                if (this.onDeployAction) this.onDeployAction();
                return;
            }

            this.charInventoryUI.onMouseDown(input.mouseScreenX, input.mouseScreenY);
        }
        if (input.mouseJustUp) {
            this.charInventoryUI.onMouseUp(input.mouseScreenX, input.mouseScreenY);
        }
    }

    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number): void {
        if (!this.visible) return;
        this.lastW = canvasW;
        this.lastH = canvasH;

        // Keep character in sync
        const active = this.party.getActive();
        if (active) {
            this.charInventoryUI.setActiveCharacter(active);
        }

        // Dark background
        ctx.fillStyle = 'rgba(10, 15, 25, 1.0)';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Title
        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 36px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('lobby.title'), canvasW / 2, 60);

        // Language Toggle Button
        const langX = canvasW - 160;
        const langY = 20;
        ctx.fillStyle = 'rgba(50, 60, 80, 0.8)';
        ctx.fillRect(langX, langY, 140, 40);
        ctx.strokeStyle = '#00e5ff';
        ctx.strokeRect(langX, langY, 140, 40);
        ctx.fillStyle = '#fff';
        ctx.font = '16px Inter, sans-serif';
        ctx.fillText(t('btn.language'), langX + 70, langY + 25);

        // Render unified Inventory/Stash UI
        if (!this.charInventoryUI.isVisible()) this.charInventoryUI.toggle();
        this.charInventoryUI.render(ctx, canvasW, canvasH);

        // Deploy Button
        const btnX = canvasW / 2 - 100;
        const btnY = canvasH - 80;
        ctx.fillStyle = 'rgba(255, 60, 60, 0.8)';
        ctx.fillRect(btnX, btnY, 200, 60);
        ctx.strokeStyle = '#ff8888';
        ctx.strokeRect(btnX, btnY, 200, 60);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.fillText(t('btn.deploy'), canvasW / 2, canvasH - 42);
        
        ctx.textAlign = 'start';
    }
}
