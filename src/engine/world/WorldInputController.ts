import type { Enemy } from '../../entity/Enemy';
import type { LootObject } from '../../entity/LootObject';
import type { ActionMenuUI } from '../../ui/ActionMenuUI';
import type { EntityInfoUI } from '../../ui/EntityInfoUI';
import type { Camera } from '../Camera';
import type { InputManager } from '../InputManager';
import { t } from '../../i18n/LanguageManager';
import type { TilePoint } from '../../field/FieldPathing';
import type { FieldActor, FieldHitParty, FieldIntent } from '../../field/FieldTypes';
import type { FieldHit } from '../../field/FieldInteraction';
import { getRightClickDisposition, type WorldInteractionMode } from '../../field/WorldInteractionMode';
import type { WorldMagicController } from './WorldMagicController';
import type { WorldPlayerActionController } from './WorldPlayerActionController';
import type { WorldSelectionController } from './WorldSelectionController';
import type { WorldTacticalController } from './WorldTacticalController';
import type { MinimapUI } from '../../ui/MinimapUI';
import { CombatLogUI } from '../../ui/CombatLogUI';

type WorldInputFieldHit = FieldHit<FieldHitParty, Enemy, LootObject>;

export interface WorldInputContext {
    actionMenuUI: ActionMenuUI;
    entityInfoUI: EntityInfoUI;
    magicController: WorldMagicController;
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
    closeTacticalMenu: () => void;
    clearIntent: () => void;
    log: (message: string) => void;
    getCombatLog: () => string[];
}

export class WorldInputController {
    private readonly context: WorldInputContext;

    constructor(context: WorldInputContext) {
        this.context = context;
    }

    public process(input: InputManager, camera: Camera): void {
        // Combat log claims wheel/drag inside its region first.
        const canvasSize = this.context.getCanvasSize();
        const logConsumed = CombatLogUI.update(
            input,
            this.context.getCombatLog().length,
            canvasSize.width,
            canvasSize.height,
        );
        if (logConsumed) return;

        if (input.mouseWheelDelta !== 0 && !this.context.magicController.isVisible()) {
            if (input.mouseWheelDelta > 0) camera.zoomOut();
            else camera.zoomIn();
        }

        const screenTile = camera.screenToTile(input.mouseScreenX, input.mouseScreenY);
        const hoverTile = { x: screenTile.tileX, y: screenTile.tileY };
        this.context.setHoverTile(hoverTile);
        this.context.entityInfoUI.onMouseMove(input.mouseScreenX, input.mouseScreenY);
        this.context.actionMenuUI.onMouseMove(input.mouseScreenX / camera.zoom, input.mouseScreenY / camera.zoom);
        this.context.magicController.onMouseMove(input.mouseScreenX, input.mouseScreenY);
        this.context.tacticalController.onMouseMove(input.uiMouseX, input.uiMouseY);
        this.context.magicController.updateHoverPreview(hoverTile);

        if (this.isInputLockedByReservation()) return;

        if (input.justPressed('KeyM')) {
            this.context.minimapUI.toggle();
            return;
        }

        if (input.mouseJustDown && this.context.minimapUI.onClick(input.uiMouseX, input.uiMouseY)) {
            return;
        }

        if (input.mouseRightJustDown && !this.context.magicController.isVisible()) {
            this.handleFieldRightClick(hoverTile, input);
        } else if (input.justPressed('Escape')) {
            if (this.context.tacticalController.isOpen()) this.context.closeTacticalMenu();
            else if (this.context.magicController.isActive()) this.context.magicController.reset();
            else this.context.clearIntent();
        } else if (this.context.tacticalController.isOpen()) {
            if (input.mouseJustDown) this.context.tacticalController.handleClick(input.uiMouseX, input.uiMouseY);
        } else if (this.context.magicController.isVisible()) {
            this.context.magicController.updateMp(this.context.getControlledActor()?.character.stats.mp ?? 0);
            if (input.mouseWheelDelta !== 0) this.context.magicController.onScroll(input.mouseWheelDelta);
            if (input.mouseJustDown) {
                this.context.magicController.handleMenuMouseDown(input.mouseScreenX, input.mouseScreenY);
            }
            if (input.mouseJustUp) this.context.magicController.onMouseUp();
        } else if (this.context.magicController.getState().mode === 'targeting') {
            if (input.mouseJustDown) this.context.magicController.handleTargetClick(this.context.getHoverTile());
        } else {
            if (input.justPressed('Tab')) this.context.switchToNextAliveActor();
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
            const action = this.context.actionMenuUI.onClick(input.mouseScreenX / camera.zoom, input.mouseScreenY / camera.zoom);
            if (action) {
                this.context.playerActionController.execute(action);
                return;
            }
            this.context.closeActionMenu();
            return;
        }

        if (this.context.playerActionController.getMode()) {
            this.context.playerActionController.handleTargetClick(tile, hit);
            return;
        }

        switch (hit.kind) {
            case 'enemy':
                this.context.selectionController.selectEnemy(hit.enemy.id);
                this.context.log(`${hit.enemy.name} 선택`);
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
                this.context.log(`${hit.loot.sourceLabel} 선택`);
                break;
            case 'ground':
                this.context.closeActionMenu();
                break;
            case 'blocked':
                this.context.clearIntent();
                this.context.log('갈 수 없는 위치입니다.');
                break;
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
