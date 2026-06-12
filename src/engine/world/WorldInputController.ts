import type { Enemy } from '../../entity/Enemy';
import type { LootObject } from '../../entity/LootObject';
import type { ActionMenuUI, ActionType } from '../../ui/ActionMenuUI';
import type { EntityInfoUI } from '../../ui/EntityInfoUI';
import type { Camera } from '../Camera';
import type { InputManager } from '../InputManager';
import { formatT, t } from '../../i18n/LanguageManager';
import type { TilePoint } from '../../field/FieldPathing';
import type { FieldActor, FieldHitParty, FieldIntent } from '../../field/FieldTypes';
import type { FieldHit } from '../../field/FieldInteraction';
import { getRightClickDisposition, type WorldInteractionMode } from '../../field/WorldInteractionMode';
import type { WorldMagicController } from './WorldMagicController';
import type { WorldToolController } from './WorldToolController';
import type { WorldPlayerActionController } from './WorldPlayerActionController';
import type { WorldSelectionController } from './WorldSelectionController';
import type { WorldTacticalController } from './WorldTacticalController';
import type { MinimapUI } from '../../ui/MinimapUI';
import { CombatLogUI } from '../../ui/CombatLogUI';
import { SettingsManager, type KeybindingId } from '../SettingsManager';

type WorldInputFieldHit = FieldHit<FieldHitParty, Enemy, LootObject>;

const ACTION_HOTKEYS: ReadonlyArray<{ keybindingId: KeybindingId; action: ActionType }> = [
    { keybindingId: 'action.move', action: 'move' },
    { keybindingId: 'action.tool', action: 'tool' },
    { keybindingId: 'action.attack', action: 'attack' },
    { keybindingId: 'action.magic', action: 'magic' },
    { keybindingId: 'action.defend', action: 'defend' },
    { keybindingId: 'action.rest', action: 'rest' },
    { keybindingId: 'action.fanfare', action: 'fanfare' },
    { keybindingId: 'action.open', action: 'open' },
];

export interface WorldInputContext {
    actionMenuUI: ActionMenuUI;
    entityInfoUI: EntityInfoUI;
    magicController: WorldMagicController;
    toolController: WorldToolController;
    minimapUI: MinimapUI;
    playerActionController: WorldPlayerActionController;
    selectionController: WorldSelectionController;
    tacticalController: WorldTacticalController;
    getCanvasSize: () => { width: number; height: number };
    getActivePartyTurnActor: () => FieldActor | null;
    getActiveTurnActorId: () => string | null;
    getReservedAction: () => FieldIntent | null;
    getControlledActor: () => FieldActor | null;
    getPartyActors: () => FieldActor[];
    getHoverTile: () => TilePoint;
    setHoverTile: (tile: TilePoint) => void;
    isEntityMoving: (entity: FieldActor['entity'] | Enemy) => boolean;
    resolveFieldHitAt: (tile: TilePoint) => WorldInputFieldHit;
    switchToNextAliveActor: () => void;
    switchToPartyMember: (index: number) => boolean;
    toggleActionMenuForControlled: () => void;
    closeActionMenu: () => void;
    dismissActionMenuTurn: () => void;
    closeTacticalMenu: () => void;
    clearIntent: () => void;
    log: (message: string) => void;
    getCombatLog: () => string[];
    onUnhandledEscape: () => void;
}

export class WorldInputController {
    private readonly context: WorldInputContext;

    constructor(context: WorldInputContext) {
        this.context = context;
    }

    public process(input: InputManager, camera: Camera): void {
        if (SettingsManager.isKeybindingJustPressed('world.minimap', input)) {
            this.context.minimapUI.toggle();
            return;
        }

        if (this.context.minimapUI.handleInput(input)) return;

        // Combat log claims wheel/drag inside its region first.
        const canvasSize = this.context.getCanvasSize();
        const logConsumed = CombatLogUI.update(
            input,
            this.context.getCombatLog().length,
            canvasSize.width,
            canvasSize.height,
        );
        if (logConsumed) return;

        if (input.mouseWheelDelta !== 0 && !this.context.magicController.isVisible() && !this.context.toolController.isVisible()) {
            if (input.mouseWheelDelta > 0) camera.zoomOut();
            else camera.zoomIn();
        }

        const screenTile = camera.screenToTile(input.mouseScreenX, input.mouseScreenY);
        const hoverTile = { x: screenTile.tileX, y: screenTile.tileY };
        this.context.setHoverTile(hoverTile);
        this.context.entityInfoUI.onMouseMove(input.mouseScreenX, input.mouseScreenY);
        this.context.actionMenuUI.onMouseMove(input.mouseScreenX / camera.zoom, input.mouseScreenY / camera.zoom);
        this.context.magicController.onMouseMove(input.mouseScreenX / camera.zoom, input.mouseScreenY / camera.zoom);
        this.context.toolController.onMouseMove(input.mouseScreenX, input.mouseScreenY);
        this.context.tacticalController.onMouseMove(input.uiMouseX, input.uiMouseY);
        this.context.magicController.updateHoverPreview(hoverTile);

        if (input.mouseJustDown && this.context.actionMenuUI.getIsOpen()) {
            if (this.handleActionMenuSlotClick(input, camera)) return;
        }
        if (this.context.actionMenuUI.getIsOpen() && this.handleActionMenuHotkey(input)) return;

        if (this.isInputLockedByReservation()) return;

        if (input.mouseJustDown && this.context.minimapUI.onClick(input.uiMouseX, input.uiMouseY)) {
            return;
        }

        if (input.mouseRightJustDown && !this.context.magicController.isVisible() && !this.context.toolController.isVisible()) {
            this.handleFieldRightClick(hoverTile, input);
        } else if (input.justPressed('Escape')) {
            if (this.context.tacticalController.isOpen()) this.context.closeTacticalMenu();
            else if (this.context.magicController.isActive()) this.cancelMagicSelection();
            else if (this.context.toolController.isActive()) this.context.toolController.reset();
            else if (this.context.actionMenuUI.getIsOpen()) this.context.dismissActionMenuTurn();
            else if (this.context.getReservedAction()) this.context.clearIntent();
            else this.context.onUnhandledEscape();
        } else if (this.context.tacticalController.isOpen()) {
            if (input.mouseJustDown) this.context.tacticalController.handleClick(input.uiMouseX, input.uiMouseY);
        } else if (this.context.magicController.isVisible()) {
            this.context.magicController.updateMp(this.context.getControlledActor()?.character.stats.mp ?? 0);
            if (input.mouseRightJustDown) {
                this.cancelMagicSelection();
            } else if (this.handleMagicHotkeys(input)) {
                /* handled by configured radial hotkey */
            } else if (this.handleMagicDigitKeys(input)) {
                /* handled by legacy number key */
            } else if (input.mouseJustDown) {
                this.context.magicController.handleMenuMouseDown(input.mouseScreenX / camera.zoom, input.mouseScreenY / camera.zoom);
            }
            if (input.mouseJustUp) this.context.magicController.onMouseUp();
        } else if (this.context.toolController.isVisible()) {
            if (input.mouseWheelDelta !== 0) this.context.toolController.onScroll(input.mouseWheelDelta);
            if (input.mouseJustDown) {
                this.context.toolController.handleMenuMouseDown(input.mouseScreenX, input.mouseScreenY);
            }
            if (input.mouseJustUp) this.context.toolController.onMouseUp();
        } else if (this.context.magicController.getState().mode === 'targeting') {
            if (input.mouseJustDown) this.context.magicController.handleTargetClick(this.context.getHoverTile());
        } else {
            if (SettingsManager.isKeybindingJustPressed('world.nextActor', input)) this.context.switchToNextAliveActor();
            if (input.mouseJustDown) this.handleFieldClick(this.context.getHoverTile(), input, camera);
        }
    }

    private handleFieldClick(tile: TilePoint, input: InputManager, camera: Camera): void {
        const hit = this.context.resolveFieldHitAt(tile);

        if (this.context.selectionController.hasSelection() && this.context.entityInfoUI.onClick(input.mouseScreenX, input.mouseScreenY)) {
            this.context.selectionController.clear();
            return;
        }

        if (this.context.actionMenuUI.getIsOpen()) {
            if (this.handleActionMenuSlotClick(input, camera)) return;
            if (hit.kind === 'party' && hit.party.id === this.context.getActiveTurnActorId()) {
                this.context.selectionController.selectActor(hit.party.id);
                return;
            }
            this.context.dismissActionMenuTurn();
            return;
        }

        if (this.context.playerActionController.getMode()) {
            this.context.playerActionController.handleTargetClick(tile, hit);
            return;
        }

        switch (hit.kind) {
            case 'enemy':
                this.context.selectionController.selectEnemy(hit.enemy.id);
                this.context.log(formatT('field.input.enemySelected', { name: hit.enemy.name }));
                break;
            case 'party': {
                const index = this.context.getPartyActors().findIndex((actor) => actor.id === hit.party.id);
                if (index >= 0) this.context.switchToPartyMember(index);
                const actor = this.context.getPartyActors()[index];
                if (actor && actor.id === this.context.getActiveTurnActorId()) this.context.toggleActionMenuForControlled();
                break;
            }
            case 'loot':
                this.context.selectionController.selectLoot(hit.loot.id);
                this.context.log(formatT('field.input.lootSelected', { name: hit.loot.sourceLabel }));
                break;
            case 'ground':
                this.context.closeActionMenu();
                break;
            case 'blocked':
                this.context.clearIntent();
                this.context.log(t('field.input.blockedTile'));
                break;
        }
    }

    /** Esc / right-click while the radial magic menu is open → back to action menu. */
    private cancelMagicSelection(): void {
        const actor = this.context.getActivePartyTurnActor();
        if (this.context.magicController.isVisible() && actor) {
            this.context.magicController.cancelToActionMenu(actor);
        } else {
            this.context.magicController.reset();
        }
    }

    /** Digit keys 1..8 select a radial magic slot. Returns true if one was pressed. */
    private handleMagicDigitKeys(input: InputManager): boolean {
        for (let digit = 1; digit <= 8; digit++) {
            if (input.justPressed(`Digit${digit}`)) {
                return this.context.magicController.handleMenuDigit(digit);
            }
        }
        return false;
    }

    private handleActionMenuSlotClick(input: InputManager, camera: Camera): boolean {
        const result = this.context.actionMenuUI.onClick(input.mouseScreenX / camera.zoom, input.mouseScreenY / camera.zoom);
        if (!result) return false;
        this.executeActionMenuResult(result);
        return true;
    }

    private handleActionMenuHotkey(input: InputManager): boolean {
        for (const { keybindingId, action } of ACTION_HOTKEYS) {
            if (!SettingsManager.isKeybindingJustPressed(keybindingId, input)) continue;
            const result = this.context.actionMenuUI.getActionResult(action);
            if (!result) return false;
            this.executeActionMenuResult(result);
            return true;
        }
        return false;
    }

    private handleMagicHotkeys(input: InputManager): boolean {
        for (let i = 0; i < ACTION_HOTKEYS.length; i++) {
            const { keybindingId } = ACTION_HOTKEYS[i];
            if (SettingsManager.isKeybindingJustPressed(keybindingId, input)) {
                return this.context.magicController.handleMenuIndex(i);
            }
        }
        return false;
    }

    private executeActionMenuResult(result: { type: ActionType; enabled: boolean; disabledReason?: string }): void {
        if (result.enabled) {
            this.context.playerActionController.execute(result.type);
        } else {
            this.context.log(result.disabledReason ?? t('field.input.actionUnavailable'));
        }
    }

    private handleFieldRightClick(tile: TilePoint, input: InputManager): void {
        const mode = this.getWorldInteractionMode();
        const disposition = getRightClickDisposition(mode);

        if (disposition === 'ignore') return;

        if (disposition === 'cancelTargeting') {
            if (mode.kind === 'magicTargeting') this.context.magicController.reset();
            else this.context.playerActionController.clearTargeting();
            this.context.closeActionMenu();
            this.context.closeTacticalMenu();
            this.context.log(t('tactical.log.cancelTargeting'));
            return;
        }

        if (disposition === 'reopenTacticalMenu') {
            this.context.closeTacticalMenu();
        } else if (mode.kind === 'actionMenu') {
            this.context.dismissActionMenuTurn();
        } else {
            this.context.closeActionMenu();
        }

        const size = this.context.getCanvasSize();
        this.context.tacticalController.open(tile, input.uiMouseX, input.uiMouseY, size.width, size.height);
    }

    private isInputLockedByReservation(): boolean {
        const actor = this.context.getActivePartyTurnActor();
        return Boolean(this.context.getReservedAction() && actor && (actor.path.length > 0 || this.context.isEntityMoving(actor.entity)));
    }

    private getWorldInteractionMode(): WorldInteractionMode {
        if (this.isInputLockedByReservation()) return { kind: 'reservedAction' };
        if (this.context.tacticalController.isOpen()) return { kind: 'tacticalMenu' };
        if (this.context.magicController.getState().mode === 'targeting') return { kind: 'magicTargeting' };
        const actionMode = this.context.playerActionController.getMode();
        if (actionMode) return { kind: 'actionTargeting', action: actionMode };
        if (this.context.actionMenuUI.getIsOpen()) return { kind: 'actionMenu' };
        return { kind: 'idle' };
    }
}
