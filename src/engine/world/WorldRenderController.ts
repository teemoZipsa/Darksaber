import type { PartyManager } from '../../character/PartyManager';
import type { PlayerData } from '../../data/PlayerData';
import type { Player } from '../../entity/Player';
import { TILE_SIZE } from '../../map/Chunk';
import { StoryInteriorMap } from '../../map/StoryInteriorMap';
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
import { getStoryInteriorBriefingLineKeys } from '../../data/StoryInteriorBriefingData';
import { MIN_FIELD_ACTION_GAUGE_COST } from '../../field/FieldActionEconomy';
import { formatT, t } from '../../i18n/LanguageManager';
import {
    BOUNTY_PROOF_ITEM_ID,
    resolveBountyContract,
    type BountyRiskId,
} from '../../data/BountyContractData';
import { getMonsterDefinition } from '../../data/MonsterCatalog';
import { formatMonsterName } from '../../i18n/DisplayNames';
import type { EliteAffixId } from '../../field/EliteAffixes';

export interface WorldRenderContext {
    party: PartyManager;
    playerData: PlayerData;
    getWorldMap: () => WorldMap;
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
    getTutorialActors: () => Player[];
    getFieldEnemies: () => FieldEnemy[];
    getActiveTurnActorId: () => string | null;
    getRemainingActionPoints: () => number;
    getMajorActionUsedThisTurn: () => boolean;
    getHoverTile: () => TilePoint;
    getPathPreviewTiles: (actor: FieldActor | null) => TilePoint[];
    getAttackCues: () => AttackCue[];
    getCombatLog: () => string[];
    hasBackpackItem?: (itemId: string) => boolean;
    getActorTerrainTraits: (actor: FieldActor) => TerrainActorTraits;
    isTurnCombatActive: () => boolean;
}

interface WorldRenderOptions {
    hideWorldHud?: boolean;
}

export class WorldRenderController {
    private readonly context: WorldRenderContext;

    constructor(context: WorldRenderContext) {
        this.context = context;
    }

    public render(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number, options: WorldRenderOptions = {}): void {
        const model = this.buildRenderModel();
        const camX = camera.x;
        const camY = camera.y;
        const scale = SettingsManager.getUIScale();
        const worldMap = this.context.getWorldMap();

        ctx.fillStyle = '#080b12';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.scale(camera.zoom, camera.zoom);

        const viewW = width / camera.zoom;
        const viewH = height / camera.zoom;
        const worldCenter = camera.getWorldCenter();
        worldMap.updateLoadedChunks(worldCenter.x, worldCenter.y, viewW, viewH);
        worldMap.render(ctx, camX, camY, viewW, viewH, camera.zoom);

        WorldFieldRenderer.renderActionTiles(ctx, model, camX, camY);
        WorldFieldRenderer.renderMagicTargetTiles(ctx, model, camX, camY);
        WorldFieldRenderer.renderPathPreview(ctx, model, camX, camY);
        WorldFieldRenderer.renderTacticalMarkers(ctx, model, camX, camY);
        WorldFieldRenderer.renderSelectedLoot(ctx, model, camX, camY);
        WorldFieldRenderer.renderEnemies(ctx, model, camX, camY);
        WorldFieldRenderer.renderMagicTargetIcons(ctx, model, camX, camY);
        WorldFieldRenderer.renderTutorialActors(ctx, model, camX, camY);
        WorldFieldRenderer.renderPartyActors(ctx, model, camX, camY);
        worldMap.renderDecorationOverlays(ctx, camX, camY, viewW, viewH);
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
        const infoY = WorldFieldRenderer.renderHudPanels(ctx, model, uiW, uiH, { combatLogOnly: options.hideWorldHud });
        if (!options.hideWorldHud && model.storyInterior.active) this.renderStoryInteriorBanner(ctx, model, uiW);
        if (!options.hideWorldHud && model.selectedDisplayInfo) {
            this.context.entityInfoUI.setPosition(16, infoY + 18);
            this.context.entityInfoUI.render(ctx, model.selectedDisplayInfo);
        }
        if (!options.hideWorldHud) {
            this.context.tacticalController.render(ctx);
            this.context.toolController.render(ctx, uiW, uiH);
            this.context.minimapUI.render(ctx, uiW, uiH, {
                gold: model.gold,
                worldName: model.worldName,
                terrainLines: model.terrainHoverLines,
            });
        } else {
            if (this.context.toolController.isVisible()) this.context.toolController.render(ctx, uiW, uiH);
        }
        if (this.context.townSession.isVisible()) this.context.townSession.render(ctx, uiW, uiH);
        if (this.context.fusionTempleUI.isVisible()) this.context.fusionTempleUI.render(ctx, uiW, uiH);
        if (this.context.raidOutcomeController.isVisible()) this.context.raidOutcomeController.render(ctx, uiW, uiH);
        ctx.restore();
    }

    private buildRenderModel(): WorldRenderModel {
        const activeActor = this.context.getControlledActor();
        const hoverTile = this.context.getHoverTile();
        const worldMap = this.context.getWorldMap();
        const terrainHoverLines = hoverTile.x >= 0 && hoverTile.y >= 0
            ? describeTerrainForHover(
                worldMap.getTileAt(hoverTile.x, hoverTile.y),
                activeActor ? this.context.getActorTerrainTraits(activeActor) : {}
            )
            : [];
        const selectedLoot = this.context.selectionController.lootId
            ? worldMap.loot.find((candidate) => candidate.id === this.context.selectionController.lootId && !candidate.opened) ?? null
            : null;
        const activeDungeonId = this.context.raidSession.activeDungeonId;
        const storyInteriorActive = Boolean(activeDungeonId && worldMap.getDungeons().length === 0);
        const storyInteriorObjectiveKey = worldMap instanceof StoryInteriorMap
            ? worldMap.getLayout().objectiveKey ?? 'story.interior.objective'
            : 'story.interior.objective';

        const storyInteriorDungeonId = storyInteriorActive ? activeDungeonId : null;
        const briefingLines = getStoryInteriorBriefingLineKeys(storyInteriorDungeonId);
        const activeBounty = resolveBountyContract(this.context.playerData.activeBountyContractId);
        const bountyTargetAlive = activeBounty
            ? this.context.getFieldEnemies().some((entry) => (
                entry.enemy.bountyContractId === activeBounty.id && entry.enemy.stats.hp > 0
            ))
            : false;
        const bountyProofSecured = activeBounty
            ? this.context.hasBackpackItem?.(BOUNTY_PROOF_ITEM_ID) ?? false
            : false;

        return {
            worldTime: this.context.getWorldTime(),
            phase: this.context.getPhase(),
            player: this.context.getPlayer(),
            activeCharacter: this.context.party.getActive() ?? null,
            controlledActor: activeActor,
            partyActors: this.context.getPartyActors(),
            tutorialActors: this.context.getTutorialActors(),
            fieldEnemies: this.context.getFieldEnemies(),
            activeTurnActorId: this.context.getActiveTurnActorId(),
            remainingActionPoints: this.context.getRemainingActionPoints(),
            majorActionUsedThisTurn: this.context.getMajorActionUsedThisTurn(),
            selectedActorId: this.context.selectionController.actorId,
            selectedEnemyId: this.context.selectionController.enemyId,
            selectedLootId: this.context.selectionController.lootId,
            selectedDisplayInfo: this.context.selectionController.getSelectedDisplayInfo(),
            hasSelection: this.context.selectionController.hasSelection(),
            actionMode: this.context.playerActionController.getMode(),
            actionTiles: this.context.playerActionController.getTiles(),
            pathPreviewTiles: this.context.getPathPreviewTiles(activeActor),
            actionMenuOpen: this.context.actionMenuUI.getIsOpen(),
            fieldMagicState: this.context.magicController.getState(),
            hoverTile,
            hoverTileWalkable: hoverTile.x >= 0 && hoverTile.y >= 0
                ? worldMap.isWalkable(hoverTile.x, hoverTile.y)
                : false,
            terrainHoverLines,
            tacticalMarkers: this.context.tacticalController.getMarkers(),
            selectedLootTile: selectedLoot ? { x: selectedLoot.x, y: selectedLoot.y } : null,
            attackCues: this.context.getAttackCues(),
            combatLog: this.context.getCombatLog(),
            gold: this.context.playerData.gold,
            worldName: worldMap.getDisplayName(),
            raid: {
                active: this.context.raidSession.active,
                elapsedSeconds: this.context.raidSession.elapsedSeconds,
                limitSeconds: this.context.raidSession.limitSeconds,
                departureTownId: this.context.raidSession.departureTownId,
                modifier: this.context.raidSession.raidModifier,
                timerAdvancing: this.context.raidSession.shouldAdvanceTimer({
                    townVisible: this.context.townSession.isVisible(),
                    resultVisible: this.context.raidOutcomeController.isVisible(),
                    turnCombatActive: this.context.isTurnCombatActive(),
                }),
                bounty: activeBounty ? {
                    targetName: formatMonsterName(getMonsterDefinition(activeBounty.monsterId)),
                    affixLabels: activeBounty.affixIds.map(eliteAffixLabel),
                    riskLabel: bountyRiskLabel(activeBounty.riskId),
                    proofSecured: bountyProofSecured,
                    targetAlive: bountyTargetAlive,
                } : null,
            },
            storyInterior: {
                active: storyInteriorActive,
                dungeonId: storyInteriorDungeonId,
                title: storyInteriorActive ? worldMap.getDisplayName() : '',
                objectiveKey: storyInteriorObjectiveKey,
                briefingLines,
                enemiesLeft: storyInteriorActive
                    ? this.context.getFieldEnemies().filter((entry) => entry.enemy.stats.hp > 0).length
                    : 0,
            },
        };
    }

    private renderStoryInteriorBanner(ctx: CanvasRenderingContext2D, model: WorldRenderModel, uiW: number): void {
        const briefingLines = model.storyInterior.briefingLines;
        const bannerW = Math.min(520, Math.max(300, uiW - 40));
        const x = Math.floor((uiW - bannerW) / 2);
        const y = 14;
        const briefingLineHeight = 14;
        const h = briefingLines
            ? 24 + briefingLines.length * briefingLineHeight + 20
            : 56;

        ctx.save();
        ctx.fillStyle = 'rgba(14, 12, 12, 0.88)';
        ctx.fillRect(x, y, bannerW, h);
        ctx.strokeStyle = 'rgba(184, 135, 74, 0.88)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, bannerW - 1, h - 1);
        ctx.fillStyle = '#f0d78a';
        ctx.font = 'bold 14px "DOSMyungjo", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(model.storyInterior.title, x + bannerW / 2, y + 8);
        ctx.font = '12px sans-serif';

        if (briefingLines) {
            const briefingColors = ['#cdbb92', '#c8a8a0', '#d4b878'];
            let lineY = y + 26;
            briefingLines.forEach((lineKey, index) => {
                ctx.fillStyle = briefingColors[index] ?? '#b8a888';
                ctx.fillText(t(lineKey), x + bannerW / 2, lineY);
                lineY += briefingLineHeight;
            });
            ctx.fillStyle = '#9fb4c8';
            ctx.fillText(
                formatT('story.interior.enemyCount', { count: model.storyInterior.enemiesLeft }),
                x + bannerW / 2,
                lineY + 2
            );
        } else {
            ctx.fillStyle = '#cdbb92';
            ctx.fillText(t(model.storyInterior.objectiveKey), x + bannerW / 2, y + 27);
            ctx.fillStyle = '#9fb4c8';
            ctx.fillText(formatT('story.interior.enemyCount', { count: model.storyInterior.enemiesLeft }), x + bannerW / 2, y + 42);
        }
        ctx.restore();
    }

    private renderActionMenu(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        const actor = this.context.getControlledActor();
        if (!actor || actor.character.isDead) return;

        const px = actor.entity.pixelX * TILE_SIZE - camX;
        const py = actor.entity.pixelY * TILE_SIZE - camY;
        // The radial magic selector replaces the action menu around the same unit.
        if (this.context.magicController.isVisible()) {
            this.context.magicController.render(ctx, px, py);
            return;
        }
        const active = actor.id === this.context.getActiveTurnActorId();
        const ready = active
            ? this.context.getRemainingActionPoints() >= MIN_FIELD_ACTION_GAUGE_COST
            : actor.entity.actionGauge >= 100;
        if (this.context.actionMenuUI.getIsOpen()) {
            this.context.actionMenuUI.render(ctx, px, py, ready);
        } else if (ready) {
            const cursorType = active && this.context.playerActionController.hasExecutableAttack(actor) ? 'attack' : 'move';
            this.context.actionMenuUI.renderReadyIndicator(ctx, px, py, this.context.getWorldTime(), cursorType);
        }
    }
}

function eliteAffixLabel(affix: EliteAffixId): string {
    switch (affix) {
        case 'berserker': return t('bounty.affix.berserker');
        case 'vampiric': return t('bounty.affix.vampiric');
        case 'ironclad': return t('bounty.affix.ironclad');
        case 'executioner': return t('bounty.affix.executioner');
        case 'swift': return t('bounty.affix.swift');
    }
}

function bountyRiskLabel(risk: BountyRiskId): string {
    switch (risk) {
        case 'swift_hunt': return t('bounty.risk.swift_hunt');
        case 'unbroken': return t('bounty.risk.unbroken');
        case 'blood_trail': return t('bounty.risk.blood_trail');
    }
}
