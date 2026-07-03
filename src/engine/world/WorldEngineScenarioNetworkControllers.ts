import type { PartyManager } from '../../character/PartyManager';
import type { Character } from '../../character/Character';
import type { PlayerData } from '../../data/PlayerData';
import { getItemDef } from '../../data/ItemDB';
import type { Enemy } from '../../entity/Enemy';
import type { Player } from '../../entity/Player';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import type { TilePoint } from '../../field/FieldPathing';
import type { TownInfo } from '../../map/BiomeMask';
import type { WorldMap } from '../../map/WorldMap';
import type { NetworkRaidClient } from '../../net/NetworkRaidClient';
import type { GameManager } from '../GameManager';
import type { Camera } from '../Camera';
import type { ActionMenuUI } from '../../ui/ActionMenuUI';
import type { EffectManager } from '../../ui/EffectManager';
import type { FloatingTextManager } from '../../ui/FloatingTextManager';
import type { FusionTempleUI } from '../../ui/FusionTempleUI';
import type { WorldPhase, WorldRaidSession } from './WorldRaidSession';
import type { WorldTownSession } from './WorldTownSession';
import type { WorldFieldFeedbackState } from './WorldFieldFeedbackState';
import type { WorldTurnStateController } from './WorldTurnStateController';
import { WorldStoryScenarioController } from './WorldStoryScenarioController';
import { WorldTutorialController } from './WorldTutorialController';
import { WorldNetworkSyncController } from './WorldNetworkSyncController';
import { WorldNetworkIntentController } from './WorldNetworkIntentController';
import { WorldEngineNetworkEvents } from './WorldEngineNetworkEvents';
import { applyMonsterSprite } from './NetworkSnapshotMapping';
import { actorTile, enemyTile, isEntityMoving } from './WorldEngineFieldHelpers';
import { getWorldActorAttackTargetFailure } from './WorldAttackTargeting';
import type { CombatFeedbackKind } from './CombatFeedback';

export interface WorldEngineScenarioNetworkControllerPorts {
    party: PartyManager;
    playerData: PlayerData;
    gameManager: GameManager;
    camera: Camera;
    raidSession: WorldRaidSession;
    townSession: WorldTownSession;
    fusionTempleUI: FusionTempleUI;
    actionMenuUI: ActionMenuUI;
    floatingText: FloatingTextManager;
    effectManager: EffectManager;
    fieldFeedback: WorldFieldFeedbackState;
    turnStateController: WorldTurnStateController;
    getWorldMap(): WorldMap;
    setWorldMap(worldMap: WorldMap): void;
    getPlayer(): Player;
    setPlayer(player: Player): void;
    getPartyActors(): FieldActor[];
    setPartyActors(actors: FieldActor[]): void;
    getRemotePartyActors(): Map<string, FieldActor>;
    clearRemotePartyActors(): void;
    getFieldEnemies(): FieldEnemy[];
    setFieldEnemies(enemies: FieldEnemy[]): void;
    getControlledActor(): FieldActor | null;
    getActivePartyTurnActor(): FieldActor | null;
    getCurrentHubTown(): TownInfo;
    openTown(town: TownInfo): void;
    placePartyNear(tile: TilePoint, overrideMembers?: Character[]): void;
    closeFieldOverlays(): void;
    clearFieldTurnState(): void;
    selectActor(actorId: string | null): void;
    clearSelection(): void;
    hasSelection(): boolean;
    selectLoot(lootId: string): void;
    isNetworkRaid(): boolean;
    getNetworkRaidClient(): NetworkRaidClient | null;
    getNetworkPlayerId(): string | null;
    isRaidOutcomeVisible(): boolean;
    setCurrentPhase(phase: WorldPhase): void;
    getTurnActionStates(actor: FieldActor): ReturnType<WorldTutorialController['getActionMenuStates']>;
    getPlayerActionMode(): unknown;
    hasExecutableAction(actor: FieldActor): boolean;
    reopenActionMenu(actor: FieldActor): void;
    getEnemyById(enemyId: string): Enemy | null;
    updateAttackCues(dt: number): void;
    beginCombatFeedbackGroup(): string;
    registerCombatFeedback(kind: CombatFeedbackKind, feedbackGroupId?: string): void;
    flushCombatFeedbackGroup(feedbackGroupId: string): void;
    spawnKillEffect(enemy: Enemy, feedbackGroupId?: string, actor?: FieldActor): void;
    addCombatLog(message: string): void;
}

export interface WorldEngineScenarioNetworkControllers {
    storyScenarioController: WorldStoryScenarioController;
    tutorialController: WorldTutorialController;
    networkSyncController: WorldNetworkSyncController;
    networkIntentController: WorldNetworkIntentController;
    networkEvents: WorldEngineNetworkEvents;
}

export function createWorldEngineScenarioNetworkControllers(
    ports: WorldEngineScenarioNetworkControllerPorts
): WorldEngineScenarioNetworkControllers {
    const storyScenarioController = new WorldStoryScenarioController({
        playerData: ports.playerData,
        raidSession: ports.raidSession,
        getWorldMap: () => ports.getWorldMap(),
        setWorldMap: (worldMap) => ports.setWorldMap(worldMap),
        getPlayer: () => ports.getPlayer(),
        setPlayer: (player) => ports.setPlayer(player),
        getFieldEnemies: () => ports.getFieldEnemies(),
        setFieldEnemies: (fieldEnemies) => ports.setFieldEnemies(fieldEnemies),
        getControlledActor: () => ports.getControlledActor(),
        actorTile: (actor) => actorTile(actor),
        placePartyNear: (tile) => ports.placePartyNear(tile),
        clearFieldTurnState: () => ports.clearFieldTurnState(),
        closeFieldOverlays: () => ports.closeFieldOverlays(),
        selectActor: (actorId) => ports.selectActor(actorId),
        clearSelection: () => ports.clearSelection(),
        applyMonsterSprite: (enemy, monsterId) => applyMonsterSprite(enemy, monsterId),
        isEntityMoving: (entity) => isEntityMoving(entity),
        isNetworkRaid: () => ports.isNetworkRaid(),
        getNetworkRaidClient: () => ports.getNetworkRaidClient(),
        isRaidOutcomeVisible: () => ports.isRaidOutcomeVisible(),
        isTownVisible: () => ports.townSession.isVisible(),
        isFusionTempleVisible: () => ports.fusionTempleUI.isVisible(),
        followCameraToPlayer: () => {
            const player = ports.getPlayer();
            ports.camera.followTile(player.gridX, player.gridY);
            ports.camera.snapToTarget();
        },
        focusCameraOnTile: (tile) => {
            ports.camera.followTile(tile.x, tile.y);
            ports.camera.snapToTarget();
        },
        autoPlaceRewardItem: (itemId) => {
            const item = getItemDef(itemId);
            if (!item) return false;
            const placed = ports.gameManager.inventory.autoPlace(item);
            if (placed) placed.acquiredInRaid = true;
            return Boolean(placed);
        },
        hasScenarioItem: (itemId) => ports.gameManager.inventory.items.some((placed) => placed.item.id === itemId && placed.quantity > 0),
        consumeScenarioItem: (itemId) => {
            const placed = ports.gameManager.inventory.items.find((entry) => entry.item.id === itemId && entry.quantity > 0);
            if (!placed) return false;
            if (placed.quantity > 1) {
                placed.quantity -= 1;
                return true;
            }
            ports.gameManager.inventory.remove(placed);
            return true;
        },
        rollScenarioRandom: () => Math.random(),
        spawnDamage: (x, y, amount) => ports.floatingText.spawnDamage(x, y, amount, false, false),
        log: (message) => ports.addCombatLog(message),
    });

    const tutorialController = new WorldTutorialController({
        party: ports.party,
        raidSession: ports.raidSession,
        townSession: ports.townSession,
        getWorldMap: () => ports.getWorldMap(),
        setWorldMap: (worldMap) => ports.setWorldMap(worldMap),
        getCurrentHubTown: () => ports.getCurrentHubTown(),
        openTown: (town) => ports.openTown(town),
        closeFieldOverlays: () => ports.closeFieldOverlays(),
        resetStoryVisitState: () => storyScenarioController.resetVisitState(),
        resetPartyForRaid: () => ports.party.resetForNewRaid(),
        applyPendingRestForRaidStart: () => ports.townSession.applyPendingRestForRaidStart(),
        clearRemotePartyActors: () => ports.clearRemotePartyActors(),
        setFieldEnemies: (fieldEnemies) => ports.setFieldEnemies(fieldEnemies),
        placePartyNear: (tile, overrideMembers) => ports.placePartyNear(tile, overrideMembers),
        getControlledActor: () => ports.getControlledActor(),
        getActivePartyTurnActor: () => ports.getActivePartyTurnActor(),
        setPlayer: (player) => ports.setPlayer(player),
        getPlayer: () => ports.getPlayer(),
        selectActor: (actorId) => ports.selectActor(actorId),
        clearFieldTurnState: () => ports.clearFieldTurnState(),
        setCurrentPhaseToRaid: () => ports.setCurrentPhase('raid'),
        setActiveTurn: (actorId, remainingActionPoints, majorActionUsed) => {
            if (actorId) ports.turnStateController.setActiveTurn(actorId, remainingActionPoints, majorActionUsed);
            else ports.turnStateController.endActiveTurn();
        },
        getTurnActionStates: (actor) => ports.getTurnActionStates(actor),
        openActionMenu: (states) => ports.actionMenuUI.open(states),
        getEnemyById: (enemyId) => ports.getEnemyById(enemyId),
        actorTile: (actor) => actorTile(actor),
        getActorAttackTargetFailureFromTile: (actor, casterTile, enemy) =>
            getWorldActorAttackTargetFailure({ worldMap: ports.getWorldMap(), actor, enemy, casterTile }),
        updateEffects: (dt) => ports.effectManager.update(dt),
        updateFloatingText: (dt) => ports.floatingText.update(dt),
        updateAttackCues: (dt) => ports.updateAttackCues(dt),
        followCameraToPlayer: (camera, dt) => {
            const player = ports.getPlayer();
            camera.followTile(player.gridX, player.gridY);
            if (dt !== undefined) camera.update(dt);
        },
        snapCameraToActor: (actor) => {
            ports.camera.followTile(actor.entity.gridX, actor.entity.gridY);
            ports.camera.snapToTarget();
        },
        getLastCombatLog: () => ports.fieldFeedback.lastCombatLog(),
        log: (message) => ports.addCombatLog(message),
    });

    const networkSyncController = new WorldNetworkSyncController({
        party: ports.party,
        gameManager: ports.gameManager,
        storyScenarioController,
        getNetworkPlayerId: () => ports.getNetworkPlayerId(),
        getNetworkRaidClient: () => ports.getNetworkRaidClient(),
        getWorldMap: () => ports.getWorldMap(),
        getPartyActors: () => ports.getPartyActors(),
        setPartyActors: (actors) => ports.setPartyActors(actors),
        getRemotePartyActors: () => ports.getRemotePartyActors(),
        getFieldEnemies: () => ports.getFieldEnemies(),
        setFieldEnemies: (fieldEnemies) => ports.setFieldEnemies(fieldEnemies),
        getControlledActor: () => ports.getControlledActor(),
        setPlayer: (player) => ports.setPlayer(player),
        getActiveTurnActorId: () => ports.turnStateController.getActiveTurnActorId(),
        setActiveTurnActorId: (actorId) => ports.turnStateController.setActiveTurnActorId(actorId),
        getRemainingActionPoints: () => ports.turnStateController.getRemainingActionPoints(),
        setRemainingActionPoints: (points) => ports.turnStateController.setRemainingActionPoints(points),
        setMajorActionUsedThisTurn: (used) => ports.turnStateController.setMajorActionUsedThisTurn(used),
        hasSelection: () => ports.hasSelection(),
        selectActor: (actorId) => ports.selectActor(actorId),
        selectLoot: (lootId) => ports.selectLoot(lootId),
        getActionMenuIsOpen: () => ports.actionMenuUI.getIsOpen(),
        getPlayerActionMode: () => ports.getPlayerActionMode(),
        hasExecutableAction: (actor) => ports.hasExecutableAction(actor),
        reopenActionMenu: (actor) => ports.reopenActionMenu(actor),
        getEnemyById: (enemyId) => ports.getEnemyById(enemyId),
        actorTile: (actor) => actorTile(actor),
        enemyTile: (enemy) => enemyTile(enemy),
        applyMonsterSprite: (enemy, monsterId) => applyMonsterSprite(enemy, monsterId),
        isEntityMoving: (entity) => isEntityMoving(entity),
        beginCombatFeedbackGroup: () => ports.beginCombatFeedbackGroup(),
        registerCombatFeedback: (kind, feedbackGroupId) => ports.registerCombatFeedback(kind, feedbackGroupId),
        flushCombatFeedbackGroup: (feedbackGroupId) => ports.flushCombatFeedbackGroup(feedbackGroupId),
        spawnAttackCue: (from, to, color, label) => ports.fieldFeedback.spawnAttackCue(from, to, color, label),
        spawnKillEffect: (enemy, feedbackGroupId, actor) => ports.spawnKillEffect(enemy, feedbackGroupId, actor),
        spawnDebuffEffect: (x, y) => ports.effectManager.spawnDebuffEffect(x, y),
        spawnHitEffect: (x, y) => ports.effectManager.spawnHitEffect(x, y),
        spawnHealEffect: (x, y) => ports.effectManager.spawnHealEffect(x, y),
        spawnDamage: (x, y, amount, isCrit, isMiss) => ports.floatingText.spawnDamage(x, y, amount, isCrit, isMiss),
        spawnHeal: (x, y, amount) => ports.floatingText.spawnHeal(x, y, amount),
        spawnStatus: (x, y, text) => ports.floatingText.spawnStatus(x, y, text),
        log: (message) => ports.addCombatLog(message),
    });

    return {
        storyScenarioController,
        tutorialController,
        networkSyncController,
        networkIntentController: new WorldNetworkIntentController({
            networkSyncController,
            isNetworkRaid: () => ports.isNetworkRaid(),
            getNetworkRaidClient: () => ports.getNetworkRaidClient(),
        }),
        networkEvents: new WorldEngineNetworkEvents({
            raidSession: ports.raidSession,
            networkSyncController,
        }),
    };
}
