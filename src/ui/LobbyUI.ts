/**
 * LobbyUI — The preparation screen (Hideout / 은신처).
 * Shows tabbed interface:
 *   Tab 1: Inventory (Stash + Equipment + Backpack)
 *   Tab 2: Shop (Merchant buy/sell)
 *   Tab 3: Party (Character management)
 * Plus: Deploy button, Language toggle, Multiplayer connection
 */

import { GridInventory } from '../inventory/GridInventory';
import { PartyManager } from '../character/PartyManager';
import { InventoryUI } from '../inventory/InventoryUI';
import { ShopUI } from './ShopUI';
import { PartyUI } from './PartyUI';
import { SettingsUI } from './SettingsUI';
import { InputManager } from '../engine/InputManager';
import { t } from '../i18n/LanguageManager';
import { renderGameTitle } from './UITheme';

const STASH_W = 15;
const STASH_H = 10;

type LobbyTab = 'inventory' | 'shop' | 'party';

export class LobbyUI {
    public stash: GridInventory;
    private charInventoryUI: InventoryUI;
    private shopUI: ShopUI;
    private partyUI: PartyUI;
    private settingsUI: SettingsUI;

    // State
    private visible: boolean = false;
    private activeTab: LobbyTab = 'inventory';
    private onDeployAction: (() => void) | null = null;
    
    // Canvas dimensions for input checks
    private lastW: number = 800;
    private lastH: number = 600;
    
    private party: PartyManager;

    // Multiplayer
    private serverUrl: string = 'ws://localhost:8765';
    private onConnectAction: ((url: string) => void) | null = null;
    private onDisconnectAction: (() => void) | null = null;
    private _isConnected: boolean = false;
    private _isConnecting: boolean = false;

    // Tab button rects for click detection
    private tabRects: Array<{ x: number; y: number; w: number; h: number; tab: LobbyTab }> = [];
    
    constructor(party: PartyManager, activeCharInv: GridInventory) {
        this.party = party;
        this.stash = new GridInventory(STASH_W, STASH_H);
        this.charInventoryUI = new InventoryUI(activeCharInv);
        this.charInventoryUI.setExternalGrid(this.stash, t('lobby.stash'));
        this.charInventoryUI.setHideCloseBtn(true);
        this.shopUI = new ShopUI();
        
        this.partyUI = new PartyUI(party);

        this.settingsUI = new SettingsUI();
    }

    public onDeploy(callback: () => void) {
        this.onDeployAction = callback;
    }

    public onConnect(callback: (url: string) => void) {
        this.onConnectAction = callback;
    }

    public onDisconnect(callback: () => void) {
        this.onDisconnectAction = callback;
    }

    public setConnectionStatus(connected: boolean, connecting: boolean): void {
        this._isConnected = connected;
        this._isConnecting = connecting;
    }

    public getShopUI(): ShopUI { return this.shopUI; }

    public toggle(): void {
        this.visible = !this.visible;
        if (this.visible) {
            this.showTab(this.activeTab);
        } else {
            if (this.charInventoryUI.isVisible()) this.charInventoryUI.toggle();
            this.shopUI.hide();
            this.partyUI.hide(); // Hide partyUI when lobby is hidden
        }
    }

    private showTab(tab: LobbyTab): void {
        this.activeTab = tab;
        
        // Hide all panels first
        if (this.charInventoryUI.isVisible()) this.charInventoryUI.toggle();
        this.shopUI.hide();
        this.partyUI.hide(); // Hide partyUI when switching tabs

        // Show the selected one
        switch (tab) {
            case 'inventory':
                this.charInventoryUI.setExternalGrid(this.stash, t('lobby.stash'));
                if (!this.charInventoryUI.isVisible()) this.charInventoryUI.toggle();
                break;
            case 'shop':
                this.shopUI.show();
                break;
            case 'party':
                // Party tab uses character panel - show inventory in party mode
                // if (!this.charInventoryUI.isVisible()) this.charInventoryUI.toggle();
                // this.charInventoryUI.setExternalGrid(null);
                this.partyUI.show();
                break;
        }
    }
    
    public isVisible(): boolean { return this.visible; }

    public updateInput(input: InputManager): void {
        if (!this.visible) return;

        // Settings modal gets absolute top priority
        if (this.settingsUI.isVisible()) {
            if (input.mouseJustDown) this.settingsUI.onMouseDown(input.uiMouseX, input.uiMouseY);
            return;
        }

        // Route mouse events to active panel
        if (input.uiMouseX !== undefined && input.uiMouseY !== undefined) {
            if (this.activeTab === 'inventory') {
                this.charInventoryUI.onMouseMove(input.uiMouseX, input.uiMouseY);
            } else if (this.activeTab === 'shop') {
                this.shopUI.onMouseMove(input.uiMouseX, input.uiMouseY);
            } else if (this.activeTab === 'party') {
                this.partyUI.onMouseMove(input.uiMouseX, input.uiMouseY);
            }
        }
        
        if (input.mouseJustDown) {
            // Check tab clicks
            for (const tabRect of this.tabRects) {
                if (input.uiMouseX >= tabRect.x && input.uiMouseX <= tabRect.x + tabRect.w &&
                    input.uiMouseY >= tabRect.y && input.uiMouseY <= tabRect.y + tabRect.h) {
                    this.showTab(tabRect.tab);
                    return;
                }
            }

            // Check Settings Button
            const settBtnX = this.lastW - 60;
            const settBtnY = 10;
            if (input.uiMouseX >= settBtnX && input.uiMouseX <= settBtnX + 50 &&
                input.uiMouseY >= settBtnY && input.uiMouseY <= settBtnY + 36) {
                this.settingsUI.show();
                return;
            }

            // Check Multiplayer Connect/Disconnect button
            const mpBtnX = this.lastW / 2 - 100;
            const mpBtnY = this.lastH - 140;
            const mpBtnW = 200;
            const mpBtnH = 40;

            if (input.uiMouseX >= mpBtnX && input.uiMouseX <= mpBtnX + mpBtnW &&
                input.uiMouseY >= mpBtnY && input.uiMouseY <= mpBtnY + mpBtnH) {
                if (this._isConnected) {
                    if (this.onDisconnectAction) this.onDisconnectAction();
                } else if (!this._isConnecting) {
                    if (this.onConnectAction) this.onConnectAction(this.serverUrl);
                }
                return;
            }

            // Check if Deploy clicked
            const btnX = this.lastW / 2 - 100;
            const btnY = this.lastH - 80;
            const btnW = 200;
            const btnH = 80;
            
            if (input.uiMouseX >= btnX && input.uiMouseX <= btnX + btnW &&
                input.uiMouseY >= btnY && input.uiMouseY <= btnY + btnH) {
                if (this.onDeployAction) this.onDeployAction();
                return;
            }

            // Route to active panel
            if (this.activeTab === 'inventory') {
                this.charInventoryUI.onMouseDown(input.uiMouseX, input.uiMouseY);
            } else if (this.activeTab === 'shop') {
                this.shopUI.onMouseDown(input.uiMouseX, input.uiMouseY);
            } else if (this.activeTab === 'party') {
                this.partyUI.onMouseDown(input.uiMouseX, input.uiMouseY);
            }
        }
        if (input.mouseJustUp) {
            if (this.activeTab === 'inventory') {
                this.charInventoryUI.onMouseUp(input.uiMouseX, input.uiMouseY);
            } else if (this.activeTab === 'shop') {
                this.shopUI.onMouseUp(input.uiMouseX, input.uiMouseY);
            } else if (this.activeTab === 'party') {
                this.partyUI.onMouseUp(input.uiMouseX, input.uiMouseY);
            }
        }
        // Route mouse wheel to active panel
        if (input.mouseWheelDelta !== 0) {
            if (this.activeTab === 'shop') {
                this.shopUI.onScroll(input.mouseWheelDelta);
            }
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

        // Dark atmospheric background
        ctx.fillStyle = 'rgba(6, 8, 14, 1.0)';
        ctx.fillRect(0, 0, canvasW, canvasH);

        // Subtle stone texture
        ctx.globalAlpha = 0.03;
        for (let y = 0; y < canvasH; y += 12) {
            for (let x = 0; x < canvasW; x += 12) {
                const n = Math.sin(x * 0.2 + y * 0.5) * 0.5 + 0.5;
                ctx.fillStyle = n > 0.5 ? '#333' : '#1a1a1a';
                ctx.fillRect(x, y, 12, 12);
            }
        }
        ctx.globalAlpha = 1;

        // ─── ACTIVE TAB CONTENT ─────────────────
        if (this.activeTab === 'inventory') {
            if (!this.charInventoryUI.isVisible()) this.charInventoryUI.toggle();
            this.charInventoryUI.render(ctx, canvasW, canvasH);
        } else if (this.activeTab === 'shop') {
            this.shopUI.render(ctx, canvasW, canvasH);
        } else if (this.activeTab === 'party') {
            if (!this.partyUI.isVisible()) this.partyUI.toggle();
            this.partyUI.render(ctx, canvasW, canvasH);
        }

        // Title — ornate
        ctx.fillStyle = '#c8a84e';
        ctx.font = 'bold 32px DOSMyungjo, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('lobby.title'), canvasW / 2, 50);
        
        // Decorative line under title
        ctx.strokeStyle = 'rgba(200, 170, 80, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(canvasW / 2 - 80, 58);
        ctx.lineTo(canvasW / 2 + 80, 58);
        ctx.stroke();
        ctx.textAlign = 'start';

        // Settings Button (unified style)
        const settBtnX = canvasW - 60;
        const settBtnY = 10;
        const settBtnW = 50;
        const settBtnH = 36;
        ctx.save();
        ctx.fillStyle = 'rgba(40, 36, 28, 0.7)';
        ctx.beginPath();
        ctx.roundRect(settBtnX, settBtnY, settBtnW, settBtnH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(200, 170, 80, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#c8a84e';
        ctx.font = `bold 13px "DOSMyungjo", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚙ 설정', settBtnX + settBtnW / 2, settBtnY + settBtnH / 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
        ctx.restore();

        // ─── TAB BUTTONS ────────────────────────
        this.renderTabs(ctx, canvasW);

        // ─── BOTTOM BAR ────────────────────────
        // Multiplayer Connection UI
        const mpBtnX = canvasW / 2 - 100;
        const mpBtnY = canvasH - 140;

        const statusColor = this._isConnected ? '#00ff88' : (this._isConnecting ? '#ffaa00' : '#666');
        const statusText = this._isConnected ? t('mp.connected') : (this._isConnecting ? t('mp.connecting') : t('mp.disconnected'));
        
        ctx.fillStyle = 'rgba(15, 18, 28, 0.9)';
        ctx.fillRect(mpBtnX, mpBtnY, 200, 40);
        ctx.strokeStyle = 'rgba(200, 170, 80, 0.3)';
        ctx.strokeRect(mpBtnX, mpBtnY, 200, 40);
        
        // Status dot
        ctx.fillStyle = statusColor;
        ctx.beginPath();
        ctx.arc(mpBtnX + 16, mpBtnY + 20, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#999';
        ctx.font = '12px DOSMyungjo, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(statusText, mpBtnX + 28, mpBtnY + 24);

        const btnLabel = this._isConnected ? t('mp.disconnect') : t('mp.connect');
        ctx.fillStyle = statusColor;
        ctx.textAlign = 'right';
        ctx.fillText(btnLabel, mpBtnX + 190, mpBtnY + 24);
        ctx.textAlign = 'center';

        // Deploy Button — ornate
        const btnX = canvasW / 2 - 100;
        const btnY = canvasH - 80;
        
        // Button glow
        ctx.fillStyle = 'rgba(180, 40, 40, 0.15)';
        ctx.fillRect(btnX - 5, btnY - 5, 210, 70);

        ctx.fillStyle = 'rgba(140, 30, 30, 0.9)';
        ctx.fillRect(btnX, btnY, 200, 60);
        ctx.strokeStyle = '#c8a84e';
        ctx.lineWidth = 2;
        ctx.strokeRect(btnX, btnY, 200, 60);
        
        // Corner ornaments on deploy button
        const cs = 6;
        ctx.fillStyle = '#c8a84e';
        ctx.fillRect(btnX, btnY, cs, 2);
        ctx.fillRect(btnX, btnY, 2, cs);
        ctx.fillRect(btnX + 200 - cs, btnY, cs, 2);
        ctx.fillRect(btnX + 198, btnY, 2, cs);
        ctx.fillRect(btnX, btnY + 58, cs, 2);
        ctx.fillRect(btnX, btnY + 60 - cs, 2, cs);
        ctx.fillRect(btnX + 200 - cs, btnY + 58, cs, 2);
        ctx.fillRect(btnX + 198, btnY + 60 - cs, 2, cs);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px DOSMyungjo, sans-serif';
        ctx.fillText(t('btn.deploy'), canvasW / 2, canvasH - 42);
        
        ctx.textAlign = 'start';

        // ─── EPIC GAME TITLE (top-left) ──────────────────
        renderGameTitle(ctx, 16, 12, { scale: 0.9, subtitle: 'Grid SRPG Engine v0.1' });



        // ─── OVERLAYS ─────────────────────────
        if (this.settingsUI.isVisible()) {
            this.settingsUI.render(ctx, canvasW, canvasH);
        }
    }

    private renderTabs(ctx: CanvasRenderingContext2D, canvasW: number): void {
        const tabs: Array<{ key: LobbyTab; label: string }> = [
            { key: 'inventory', label: t('tab.inventory') },
            { key: 'shop', label: t('tab.shop') },
            { key: 'party', label: t('tab.party') },
        ];

        const tabW = 120;
        const tabH = 32;
        const tabY = 75; // Increased top margin from the title line
        const totalTabW = tabs.length * tabW + (tabs.length - 1) * 8;
        const startX = Math.floor((canvasW - totalTabW) / 2);

        this.tabRects = [];

        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const tx = startX + i * (tabW + 8);
            const isActive = this.activeTab === tab.key;

            this.tabRects.push({ x: tx, y: tabY, w: tabW, h: tabH, tab: tab.key });

            // Tab background
            ctx.fillStyle = isActive ? 'rgba(200, 170, 80, 0.3)' : 'rgba(50, 45, 30, 0.7)';
            ctx.fillRect(tx, tabY, tabW, tabH);

            // Tab border
            ctx.strokeStyle = isActive ? '#ffce54' : 'rgba(150, 120, 70, 0.6)';
            ctx.lineWidth = isActive ? 2 : 1;
            ctx.strokeRect(tx, tabY, tabW, tabH);

            // Active indicator
            if (isActive) {
                ctx.fillStyle = '#ffce54';
                ctx.fillRect(tx, tabY + tabH - 2, tabW, 2);
            }

            // Label
            ctx.fillStyle = isActive ? '#ffffff' : '#e6c875';
            ctx.font = isActive ? 'bold 15px "DOSMyungjo", sans-serif' : '14px "DOSMyungjo", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(tab.label, tx + tabW / 2, tabY + tabH / 2 + 5);
        }
        ctx.textAlign = 'start';
    }
}
