import type { PartyManager } from '../../character/PartyManager';
import type { PlayerData } from '../../data/PlayerData';
import type { Player } from '../../entity/Player';
import { TILE_SIZE } from '../../map/Chunk';
import type { WorldMap } from '../../map/WorldMap';
import type { ActionMenuUI } from '../../ui/ActionMenuUI';
import type { EntityInfoUI } from '../../ui/EntityInfoUI';
import type { EffectManager } from '../../ui/EffectManager';
import type { FusionTempleUI } from '../../ui/FusionTempleUI';
import type { FloatingTextManager } from '../../ui/FloatingTextManager';
import type { MinimapUI } from '../../ui/MinimapUI';
import { SettingsManager } from '../SettingsManager';
import type { Camera } from '../Camera';
import { describeTerrainForHover, type TerrainActorTraits } from '../../field/TerrainRules';
import type { AttackCue, FieldActor, FieldEnemy } from '../../field/FieldTypes';
import type { TilePoint } from '../../field/FieldPathing';
import { WorldFieldRenderer } from './WorldFieldRenderer';
import type { WorldRenderModel } from './WorldRenderModel';
import type { WorldPhase, WorldRaidSession } from './WorldRaidSession';
import type { WorldTownSession } from './WorldTownSession';
import type { WorldMagicController } from './WorldMagicController';
import type { WorldToolController } from './WorldToolController';
import type { WorldPlayerActionController } from './WorldPlayerActionController';
import type { WorldRaidOutcomeController } from './WorldRaidOutcomeController';
import type { WorldSelectionController } from './WorldSelectionController';
import type { WorldTacticalController } from './WorldTacticalController';

export interface WorldRenderContext {
    party: PartyManager;
    playerData: PlayerData;
    worldMap: WorldMap;
    townSession: WorldTownSession;
    raidSession: WorldRaidSession;
    fusionTempleUI: FusionTempleUI;
    actionMenuUI: ActionMenuUI;
    entityInfoUI: EntityInfoUI;
    effectManager: EffectManager;
    floatingText: FloatingTextManager;
    minimapUI: MinimapUI;
    magicController: WorldMagicController;
    toolController: WorldToolController;
    playerActionController: WorldPlayerActionController;
    raidOutcomeController: WorldRaidOutcomeController;
    tacticalController: WorldTacticalController;
    selectionController: WorldSelectionController;
    getWorldTime: () => number;
    getPhase: () => WorldPhase;
    getPlayer: () => Player;
    getControlledActor: () => FieldActor | null;
    getPartyActors: () => FieldActor[];
    getFieldEnemies: () => FieldEnemy[];
    getActiveTurnActorId: () => string | null;
    getRemainingActionPoints: () => number;
    getHoverTile: () => TilePoint;
    getAttackCues: () => AttackCue[];
    getCombatLog: () => string[];
    getActorTerrainTraits: (actor: FieldActor) => TerrainActorTraits;
    isTurnCombatActive: () => boolean;
}

export class WorldRenderController {
    private readonly context: WorldRenderContext;

    constructor(context: WorldRenderContext) {
        this.context = context;
    }

    public render(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
        const model = this.buildRenderModel();
        const camX = camera.x;
        const camY = camera.y;
        const scale = SettingsManager.getUIScale();

        ctx.fillStyle = '#080b12';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.scale(camera.zoom, camera.zoom);

        const viewW = width / camera.zoom;
        const viewH = height / camera.zoom;
        this.context.worldMap.updateLoadedChunks(model.player.pixelX * TILE_SIZE, model.player.pixelY * TILE_SIZE);
        this.context.worldMap.render(ctx, camX, camY, viewW, viewH);

        WorldFieldRenderer.renderActionTiles(ctx, model, camX, camY);
        WorldFieldRenderer.renderMagicTargetTiles(ctx, model, camX, camY);
        WorldFieldRenderer.renderPathPreview(ctx, model, camX, camY);
        WorldFieldRenderer.renderTacticalMarkers(ctx, model, camX, camY);
        WorldFieldRenderer.renderSelectedLoot(ctx, model, camX, camY);
        WorldFieldRenderer.renderEnemies(ctx, model, camX, camY);
        WorldFieldRenderer.renderPartyActors(ctx, model, camX, camY);
        WorldFieldRenderer.renderAttackCues(ctx, model, camX, camY);
        this.context.effectManager.render(ctx, camera);
        this.context.floatingText.render(ctx, camX, camY);
        WorldFieldRenderer.renderHoverTile(ctx, model, camX, camY);
        this.renderActionMenu(ctx, camX, camY);

        ctx.restore();

        ctx.save();
        ctx.scale(scale, scale);
        const uiW = Math.floor(width / scale);
        const uiH = Math.floor(height / scale);
        const infoY = WorldFieldRenderer.renderHudPanels(ctx, model, uiW, uiH);
        if (model.selectedDisplayInfo) {
            this.context.entityInfoUI.setPosition(16, infoY + 18);
            this.context.entityInfoUI.render(ctx, model.selectedDisplayInfo);
        }
        this.context.tacticalController.render(ctx);
        this.context.magicController.render(ctx, uiW, uiH);
        this.context.toolController.render(ctx, uiW, uiH);
        this.context.minimapUI.render(ctx, uiW, uiH, {
            gold: model.gold,
            worldName: model.worldName,
            terrainLines: model.terrainHoverLines,
        });
        if (this.context.townSession.isVisible()) this.context.townSession.render(ctx, uiW, uiH);
        if (this.context.fusionTempleUI.isVisible()) this.context.fusionTempleUI.render(ctx, uiW, uiH);
        if (this.context.raidOutcomeController.isVisible()) this.context.raidOutcomeController.render(ctx, uiW, uiH);
        ctx.restore();
    }

    private buildRenderModel(): WorldRenderModel {
        const activeActor = this.context.getControlledActor();
        const hoverTile = this.context.getHoverTile();
        const terrainHoverLines = hoverTile.x >= 0 && hoverTile.y >= 0
            ? describeTerrainForHover(
                this.context.worldMap.getTileAt(hoverTile.x, hoverTile.y),
                activeActor ? this.context.getActorTerrainTraits(activeActor) : {}
            )
            : [];
        const selectedLoot = this.context.selectionController.lootId
            ? this.context.worldMap.loot.find((candidate) => candidate.id === this.context.selectionController.lootId) ?? null
            : null;

        return {
            worldTime: this.context.getWorldTime(),
            phase: this.context.getPhase(),
            player: this.context.getPlayer(),
            activeCharacter: this.context.party.getActive() ?? null,
            controlledActor: activeActor,
            partyActors: this.context.getPartyActors(),
            fieldEnemies: this.context.getFieldEnemies(),
            activeTurnActorId: this.context.getActiveTurnActorId(),
            remainingActionPoints: this.context.getRemainingActionPoints(),
            selectedActorId: this.context.selectionController.actorId,
            selectedEnemyId: this.context.selectionController.enemyId,
            selectedLootId: this.context.selectionController.lootId,
            selectedDisplayInfo: this.context.selectionController.getSelectedDisplayInfo(),
            hasSelection: this.context.selectionController.hasSelection(),
            actionMode: this.context.playerActionController.getMode(),
            actionTiles: this.context.playerActionController.getTiles(),
            actionMenuOpen: this.context.actionMenuUI.getIsOpen(),
            fieldMagicState: this.context.magicController.getState(),
            hoverTile,
            hoverTileWalkable: hoverTile.x >= 0 && hoverTile.y >= 0
                ? this.context.worldMap.isWalkable(hoverTile.x, hoverTile.y)
                : false,
            terrainHoverLines,
            tacticalMarkers: this.context.tacticalController.getMarkers(),
            selectedLootTile: selectedLoot ? { x: selectedLoot.x, y: selectedLoot.y } : null,
            attackCues: this.context.getAttackCues(),
            combatLog: this.context.getCombatLog(),
            gold: this.context.playerData.gold,
            worldName: this.context.worldMap.getDisplayName(),
            raid: {
                active: this.context.raidSession.active,
                elapsedSeconds: this.context.raidSession.elapsedSeconds,
                limitSeconds: this.context.raidSession.limitSeconds,
                departureTownId: this.context.raidSession.departureTownId,
                timerAdvancing: this.context.raidSession.shouldAdvanceTimer({
                    townVisible: this.context.townSession.isVisible(),
                    resultVisible: this.context.raidOutcomeController.isVisible(),
                    turnCombatActive: this.context.isTurnCombatActive(),
                }),
            },
        };
    }

    private renderActionMenu(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        const actor = this.context.getControlledActor();
        if (!actor || actor.character.isDead) return;

        const px = actor.entity.pixelX * TILE_SIZE - camX;
        const py = actor.entity.pixelY * TILE_SIZE - camY;
        const ready = actor.entity.actionGauge >= 100;
        if (this.context.actionMenuUI.getIsOpen()) {
            this.context.actionMenuUI.render(ctx, px, py, ready);
        } else if (ready) {
            this.context.actionMenuUI.renderReadyIndicator(ctx, px, py);
        }
    }
}
