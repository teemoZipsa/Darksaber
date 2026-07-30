import type { Enemy } from '../../entity/Enemy';
import type { FieldActor, FieldEnemy, FieldIntent, FieldTurnEndReason } from '../../field/FieldTypes';
import type { TilePoint } from '../../field/FieldPathing';
import type { GameManager } from '../GameManager';
import type { EffectManager } from '../../ui/EffectManager';
import type { FloatingTextManager } from '../../ui/FloatingTextManager';
import type { NetworkRaidClient } from '../../net/NetworkRaidClient';
import type { WorldMap } from '../../map/WorldMap';
import { t } from '../../i18n/LanguageManager';
import {
    createWorldPatternContext,
    getWorldActorAttackProfile,
    getWorldActorAttackTargetFailure,
    getWorldActorTerrainStepCost,
    hasWorldFieldLineOfSight,
} from './WorldAttackTargeting';
import {
    getActorTerrainMovementBudget,
    isActorAt,
    isEntityMoving,
} from './WorldEngineFieldHelpers';
import type { CombatFeedbackKind } from './CombatFeedback';
import type { WorldEngineCombatControllers } from './WorldEngineCombatControllers';
import type { WorldEngineRuntimeState } from './WorldEngineRuntimeState';
import type { WorldEngineScenarioNetworkControllers } from './WorldEngineScenarioNetworkControllers';
import type { WorldEngineSharedControllerPorts } from './WorldEngineSharedControllerPorts';
import { WorldLootController } from './WorldLootController';
import { WorldMagicController } from './WorldMagicController';
import type { WorldNetworkSyncController } from './WorldNetworkSyncController';
import { WorldPlayerActionController } from './WorldPlayerActionController';
import { WorldSelectionController } from './WorldSelectionController';
import type { WorldStoryScenarioController } from './WorldStoryScenarioController';
import { WorldToolController } from './WorldToolController';
import type { WorldTurnStateController } from './WorldTurnStateController';
import type { WorldTutorialController } from './WorldTutorialController';

export interface WorldEngineActionControllerPorts {
    gameManager: GameManager;
    storyScenarioController: WorldStoryScenarioController;
    networkSyncController: WorldNetworkSyncController;
    tutorialController: WorldTutorialController;
    turnStateController: WorldTurnStateController;
    movementController: WorldEngineCombatControllers['movementController'];
    floatingText: FloatingTextManager;
    effectManager: EffectManager;
    getWorldMap(): WorldMap;
    isNetworkRaid(): boolean;
    getNetworkRaidClient(): NetworkRaidClient | null;
    getActivePartyTurnActor(): FieldActor | null;
    getControlledActor(): FieldActor | null;
    getPartyActors(): FieldActor[];
    getFieldEnemies(): FieldEnemy[];
    getEnemyById(enemyId: string): Enemy | null;
    getSpendableActionGauge(): number;
    spendAp(cost: number): boolean;
    submitNetworkMoveIntent(actor: FieldActor, tile: TilePoint, path: TilePoint[], apCost: number, pathCost: number): boolean;
    submitNetworkActionIntent(actor: FieldActor, action: 'defend' | 'rest'): boolean;
    submitNetworkUseItemIntent(actor: FieldActor, itemId: string): boolean;
    submitNetworkSkillIntent(actor: FieldActor, skillId: string, targetId?: string): boolean;
    reopenActionMenu(actor: FieldActor): void;
    resumeOrEndActiveTurn(actor: FieldActor): void;
    handleEnemyDefeated(actor: FieldActor, enemy: Enemy, feedbackGroupId?: string): void;
    clearControlledPath(): void;
    getFanfareLeaderId(): string | null;
    setFanfareLeaderId(actorId: string | null): void;
    getFanfareFollowerCount(actor: FieldActor): number;
    tryActorAttack(actor: FieldActor, enemy: Enemy): boolean;
    closeActionMenu(): void;
    closeTacticalMenu(): void;
    endActorTurn(actor: FieldActor, reason: FieldTurnEndReason, atbCarryover?: number): void;
    clearActorIntent(actor: FieldActor): void;
    setReservedAction(intent: FieldIntent | null): void;
    beginCombatFeedbackGroup(): string;
    registerCombatFeedback(kind: CombatFeedbackKind, feedbackGroupId?: string): void;
    flushCombatFeedbackGroup(feedbackGroupId: string): void;
    addCombatLog(message: string): void;
}

export interface WorldEngineActionControllers {
    selectionController: WorldSelectionController;
    lootController: WorldLootController;
    magicController: WorldMagicController;
    toolController: WorldToolController;
    playerActionController: WorldPlayerActionController;
}

export interface WorldEngineActionControllerSources {
    ports: WorldEngineSharedControllerPorts;
    getScenarioNetworkControllers(): WorldEngineScenarioNetworkControllers;
    getCombatControllers(): WorldEngineCombatControllers;
    getRuntimeState(): WorldEngineRuntimeState;
    getSpendableActionGauge(): number;
    spendAp(cost: number): boolean;
    submitNetworkMoveIntent(actor: FieldActor, tile: TilePoint, path: TilePoint[], apCost: number, pathCost: number): boolean;
    submitNetworkActionIntent(actor: FieldActor, action: 'defend' | 'rest'): boolean;
    submitNetworkUseItemIntent(actor: FieldActor, itemId: string): boolean;
    submitNetworkSkillIntent(actor: FieldActor, skillId: string, targetId?: string): boolean;
    reopenActionMenu(actor: FieldActor): void;
    resumeOrEndActiveTurn(actor: FieldActor): void;
    handleEnemyDefeated(actor: FieldActor, enemy: Enemy, feedbackGroupId?: string): void;
    clearControlledPath(): void;
    getFanfareFollowerCount(actor: FieldActor): number;
    tryActorAttack(actor: FieldActor, enemy: Enemy): boolean;
    closeActionMenu(): void;
    closeTacticalMenu(): void;
    endActorTurn(actor: FieldActor, reason: FieldTurnEndReason, atbCarryover?: number): void;
    clearActorIntent(actor: FieldActor): void;
}

export function createWorldEngineActionControllersFromSources(
    sources: WorldEngineActionControllerSources
): WorldEngineActionControllers {
    const scenarioNetworkControllers = sources.getScenarioNetworkControllers();
    const combatControllers = sources.getCombatControllers();

    return createWorldEngineActionControllers({
        ...sources.ports,
        storyScenarioController: scenarioNetworkControllers.storyScenarioController,
        networkSyncController: scenarioNetworkControllers.networkSyncController,
        tutorialController: scenarioNetworkControllers.tutorialController,
        movementController: combatControllers.movementController,
        getSpendableActionGauge: () => sources.getSpendableActionGauge(),
        spendAp: (cost) => sources.spendAp(cost),
        submitNetworkMoveIntent: (actor, tile, path, apCost, pathCost) =>
            sources.submitNetworkMoveIntent(actor, tile, path, apCost, pathCost),
        submitNetworkActionIntent: (actor, action) => sources.submitNetworkActionIntent(actor, action),
        submitNetworkUseItemIntent: (actor, itemId) => sources.submitNetworkUseItemIntent(actor, itemId),
        submitNetworkSkillIntent: (actor, skillId, targetId) => sources.submitNetworkSkillIntent(actor, skillId, targetId),
        reopenActionMenu: (actor) => sources.reopenActionMenu(actor),
        resumeOrEndActiveTurn: (actor) => sources.resumeOrEndActiveTurn(actor),
        handleEnemyDefeated: (actor, enemy, feedbackGroupId) => sources.handleEnemyDefeated(actor, enemy, feedbackGroupId),
        clearControlledPath: () => sources.clearControlledPath(),
        getFanfareLeaderId: () => sources.getRuntimeState().fanfareLeaderActorId,
        setFanfareLeaderId: (actorId) => {
            const runtimeState = sources.getRuntimeState();
            runtimeState.fanfareLeaderActorId = actorId;
            runtimeState.followRepathTimer = 0;
        },
        getFanfareFollowerCount: (actor) => sources.getFanfareFollowerCount(actor),
        tryActorAttack: (actor, enemy) => sources.tryActorAttack(actor, enemy),
        closeActionMenu: () => sources.closeActionMenu(),
        closeTacticalMenu: () => sources.closeTacticalMenu(),
        endActorTurn: (actor, reason, atbCarryover) => sources.endActorTurn(actor, reason, atbCarryover),
        clearActorIntent: (actor) => sources.clearActorIntent(actor),
        setReservedAction: (intent) => sources.ports.turnStateController.setReservedAction(intent),
    });
}

export function createWorldEngineActionControllers(
    ports: WorldEngineActionControllerPorts
): WorldEngineActionControllers {
    const canUseFieldCombatActions = () => ports.isNetworkRaid()
        || ports.tutorialController.isActive()
        || isDevLocalCombatEnabled();
    const selectionController = new WorldSelectionController({
        getPartyActors: () => ports.getPartyActors(),
        getEnemyById: (enemyId) => ports.getEnemyById(enemyId),
        getLootById: (lootId) => ports.getWorldMap().loot.find((candidate) => candidate.id === lootId) ?? null,
    });

    const lootController = new WorldLootController({
        gameManager: ports.gameManager,
        selectionController,
        storyScenarioController: ports.storyScenarioController,
        networkSyncController: ports.networkSyncController,
        getWorldMap: () => ports.getWorldMap(),
        isNetworkRaid: () => ports.isNetworkRaid(),
        isLocalLootEnabled: () => ports.tutorialController.isActive(),
        getNetworkRaidClient: () => ports.getNetworkRaidClient(),
        getControlledActor: () => ports.getControlledActor(),
        clearControlledPath: () => ports.clearControlledPath(),
        log: (message) => ports.addCombatLog(message),
    });

    const magicController = new WorldMagicController(
        {
            getActivePartyTurnActor: () => ports.getActivePartyTurnActor(),
            getPartyActors: () => ports.getPartyActors(),
            getFieldEnemies: () => ports.getFieldEnemies(),
            getEnemyById: (enemyId) => ports.getEnemyById(enemyId),
            getRemainingActionPoints: () => ports.getSpendableActionGauge(),
            getTileAt: (tile) => ports.getWorldMap().getTileAt(tile.x, tile.y),
            getBoundsTiles: () => ports.getWorldMap().getBoundsTiles(),
            hasFieldLineOfSight: (from, to) => hasWorldFieldLineOfSight(ports.getWorldMap(), from, to),
            spendAp: (cost) => ports.spendAp(cost),
            isMajorActionUsed: () => ports.turnStateController.isMajorActionUsed(),
            markMajorActionUsed: () => ports.turnStateController.markMajorActionUsed(),
            submitNetworkSkillIntent: (actor, skill, targetEnemy) => ports.submitNetworkSkillIntent(actor, skill.id, targetEnemy?.id),
            reopenActionMenu: (actor) => ports.reopenActionMenu(actor),
            resumeOrEndActiveTurn: (actor) => ports.resumeOrEndActiveTurn(actor),
            handleEnemyDefeated: (actor, enemy, feedbackGroupId) => ports.handleEnemyDefeated(actor, enemy, feedbackGroupId),
            onActionCompleted: (action) => ports.tutorialController.advanceStep(action),
        },
        {
            log: (message) => ports.addCombatLog(message),
            spawnHeal: (x, y, amount) => ports.floatingText.spawnHeal(x, y, amount),
            spawnDamage: (x, y, amount, isCrit, isMiss) => ports.floatingText.spawnDamage(x, y, amount, isCrit, isMiss),
            spawnStatus: (x, y, text) => ports.floatingText.spawnStatus(x, y, text),
            spawnHealEffect: (x, y) => ports.effectManager.spawnHealEffect(x, y),
            spawnHitEffect: (x, y, feedbackGroupId, feedbackKind) => {
                ports.effectManager.spawnHitEffect(x, y);
                ports.registerCombatFeedback(feedbackKind ?? 'normal', feedbackGroupId);
            },
            spawnBuffEffect: (x, y) => ports.effectManager.spawnBuffEffect(x, y),
            spawnDebuffEffect: (x, y) => ports.effectManager.spawnDebuffEffect(x, y),
            spawnElementEffect: (element, x, y, feedbackGroupId) => {
                ports.effectManager.spawnByElement(element, x, y);
                ports.registerCombatFeedback('normal', feedbackGroupId);
            },
            spawnSkillEffect: (skill, x, y, phase, feedbackGroupId) => {
                ports.effectManager.spawnSkillEffect(skill, x, y, phase);
                if (feedbackGroupId) {
                    const kind = skill.type === 'debuff' ? 'status' : 'normal';
                    ports.registerCombatFeedback(kind, feedbackGroupId);
                }
            },
            beginFeedbackGroup: () => ports.beginCombatFeedbackGroup(),
            flushFeedbackGroup: (feedbackGroupId) => ports.flushCombatFeedbackGroup(feedbackGroupId),
        }
    );

    const toolController = new WorldToolController(
        {
            getActivePartyTurnActor: () => ports.getActivePartyTurnActor(),
            getRemainingActionPoints: () => ports.getSpendableActionGauge(),
            getInventoryItems: () => ports.gameManager.inventory.items,
            removeInventoryItem: (placed) => ports.gameManager.inventory.remove(placed),
            spendAp: (cost) => ports.spendAp(cost),
            isMajorActionUsed: () => ports.turnStateController.isMajorActionUsed(),
            markMajorActionUsed: () => ports.turnStateController.markMajorActionUsed(),
            submitNetworkUseItem: (actor, itemId) => ports.submitNetworkUseItemIntent(actor, itemId),
            reopenActionMenu: (actor) => ports.reopenActionMenu(actor),
            resumeOrEndActiveTurn: (actor) => ports.resumeOrEndActiveTurn(actor),
        },
        {
            log: (message) => ports.addCombatLog(message),
            spawnHeal: (x, y, amount) => ports.floatingText.spawnHeal(x, y, amount),
            spawnStatus: (x, y, text) => ports.floatingText.spawnStatus(x, y, text),
            spawnHealEffect: (x, y) => ports.effectManager.spawnHealEffect(x, y),
        }
    );

    const playerActionController = new WorldPlayerActionController(
        {
            getActivePartyTurnActor: () => ports.getActivePartyTurnActor(),
            getPartyActors: () => ports.getPartyActors(),
            getFieldEnemies: () => ports.getFieldEnemies(),
            getRemainingActionPoints: () => ports.getSpendableActionGauge(),
            getReservedAction: () => ports.turnStateController.getReservedAction(),
            getActiveTurnActorId: () => ports.turnStateController.getActiveTurnActorId(),
            getActorTerrainMovementBudget: (actor) => getActorTerrainMovementBudget(actor),
            getActorTerrainStepCost: (actor, tile) => getWorldActorTerrainStepCost(ports.getWorldMap(), actor, tile),
            getActorAttackProfile: (actor) => getWorldActorAttackProfile(actor),
            getPatternContext: (actor) => createWorldPatternContext({ worldMap: ports.getWorldMap(), actor }),
            getActorAttackTargetFailure: (actor, enemy) => getWorldActorAttackTargetFailure({ worldMap: ports.getWorldMap(), actor, enemy }),
            getEnemyById: (enemyId) => ports.getEnemyById(enemyId),
            getLootById: (lootId) => ports.getWorldMap().loot.find((candidate) => candidate.id === lootId) ?? null,
            getLoot: () => ports.getWorldMap().loot,
            isActorAt: (actor, tile) => isActorAt(actor, tile),
            isEntityMoving: (entity) => isEntityMoving(entity),
            isFieldPassable: (query) => ports.movementController.isFieldPassable(query),
            getBlockedMoveMessage: (tile) => ports.storyScenarioController.getLockedDoorMessage(tile),
            spendAp: (cost) => ports.spendAp(cost),
            restoreAp: (actor, points) => {
                ports.turnStateController.setRemainingActionPoints(points);
                actor.entity.actionGauge = points;
            },
            isMajorActionUsed: () => ports.turnStateController.isMajorActionUsed(),
            markMajorActionUsed: () => ports.turnStateController.markMajorActionUsed(),
            getFanfareLeaderId: () => ports.getFanfareLeaderId(),
            setFanfareLeaderId: (actorId) => ports.setFanfareLeaderId(actorId),
            getFanfareFollowerCount: (actor) => ports.getFanfareFollowerCount(actor),
            isNetworkRaid: () => ports.isNetworkRaid(),
            canSubmitMoveIntent: () => !ports.isNetworkRaid() || Boolean(ports.getNetworkRaidClient()?.getIsOpen()),
            submitMoveIntent: (actor, tile, path, apCost, pathCost) =>
                ports.submitNetworkMoveIntent(actor, tile, path, apCost, pathCost),
            submitActionIntent: (actor, action) => ports.submitNetworkActionIntent(actor, action),
            tryActorAttack: (actor, enemy) => ports.tryActorAttack(actor, enemy),
            openLoot: (loot) => lootController.openLoot(loot),
            openMagic: (actor) => {
                if (!canUseFieldCombatActions()) {
                    ports.addCombatLog(t('field.log.serverMagicOnly'));
                    ports.reopenActionMenu(actor);
                    return;
                }
                magicController.open(actor);
            },
            openTool: (actor) => {
                if (!canUseFieldCombatActions()) {
                    ports.addCombatLog(t('field.log.serverToolOnly'));
                    ports.reopenActionMenu(actor);
                    return;
                }
                toolController.open(actor);
            },
            hasCastableFieldSkill: (actor) => canUseFieldCombatActions() && magicController.hasCastableFieldSkill(actor.character),
            hasUsableCombatTool: (actor) => canUseFieldCombatActions() && toolController.hasUsableCombatTool(actor),
            getCombatToolAvailability: (actor) => canUseFieldCombatActions()
                ? toolController.getCombatToolAvailability(actor)
                : { hasRecoveryConsumable: false, hasEffectiveRecovery: false },
            reopenActionMenu: (actor) => ports.reopenActionMenu(actor),
            closeActionMenu: () => ports.closeActionMenu(),
            closeTacticalMenu: () => ports.closeTacticalMenu(),
            resumeOrEndActiveTurn: (actor) => ports.resumeOrEndActiveTurn(actor),
            endActorTurn: (actor, reason, atbCarryover) => ports.endActorTurn(actor, reason, atbCarryover),
            clearActorIntent: (actor) => ports.clearActorIntent(actor),
            setReservedAction: (intent) => ports.setReservedAction(intent),
            selectEnemy: (enemyId) => selectionController.selectEnemy(enemyId),
            selectLoot: (lootId) => selectionController.selectLoot(lootId),
            filterActionTiles: (action, actor, tiles) => ports.tutorialController.filterActionTiles(action, actor, tiles),
            getAdditionalInteractTiles: (actor) => ports.storyScenarioController.getInspectableFieldEventTiles(actor),
            interactAtTile: (actor, tile) => ports.storyScenarioController.playFieldEventAt(tile, actor),
            onActionCompleted: (action) => ports.tutorialController.advanceStep(action),
        },
        {
            log: (message) => ports.addCombatLog(message),
            spawnHeal: (x, y, amount) => ports.floatingText.spawnHeal(x, y, amount),
            spawnStatus: (x, y, text) => ports.floatingText.spawnStatus(x, y, text),
            spawnHealEffect: (x, y) => ports.effectManager.spawnHealEffect(x, y),
            spawnBuffEffect: (x, y) => ports.effectManager.spawnBuffEffect(x, y),
        }
    );

    return {
        selectionController,
        lootController,
        magicController,
        toolController,
        playerActionController,
    };
}

function isDevLocalCombatEnabled(): boolean {
    return Boolean(import.meta.env?.DEV);
}
