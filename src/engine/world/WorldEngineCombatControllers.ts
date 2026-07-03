import type { PartyManager } from '../../character/PartyManager';
import type { Enemy } from '../../entity/Enemy';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import { getCarryAtbMultiplier, getPartyCarriedWeight } from '../../inventory/CarryWeight';
import { getCursedArtifactAtbMultiplier } from '../../raid/CursedArtifact';
import { getRaidModifierEffects } from '../../raid/RaidModifiers';
import type { GameManager } from '../GameManager';
import type { EffectManager } from '../../ui/EffectManager';
import type { FloatingTextManager } from '../../ui/FloatingTextManager';
import type { WorldMap } from '../../map/WorldMap';
import { formatT, t } from '../../i18n/LanguageManager';
import type { CombatFeedbackKind } from './CombatFeedback';
import {
    canWorldActorAttackTarget,
    canWorldEnemyAttackTarget,
    getWorldActorTerrainTraits,
    getWorldTerrainTraitsForActorId,
    hasWorldFieldLineOfSight,
} from './WorldAttackTargeting';
import { directionFromTo } from './WorldEngineFieldHelpers';
import { WorldCombatController } from './WorldCombatController';
import { WorldEnemyTurnController } from './WorldEnemyTurnController';
import { WorldEngineCombatFlow } from './WorldEngineCombatFlow';
import type { WorldEngineActionControllers } from './WorldEngineActionControllers';
import type { WorldFieldFeedbackState } from './WorldFieldFeedbackState';
import type { WorldEngineScenarioNetworkControllers } from './WorldEngineScenarioNetworkControllers';
import type { WorldEngineSharedControllerPorts } from './WorldEngineSharedControllerPorts';
import { WorldFieldSpawnController } from './WorldFieldSpawnController';
import { WorldMovementController } from './WorldMovementController';
import type { WorldNetworkIntentController } from './WorldNetworkIntentController';
import type { WorldRaidSession } from './WorldRaidSession';
import type { WorldStoryScenarioController } from './WorldStoryScenarioController';
import { WorldTurnStartResolver } from './WorldTurnStartResolver';
import type { WorldTutorialController } from './WorldTutorialController';

export interface WorldEngineCombatControllerPorts {
    party: PartyManager;
    gameManager: GameManager;
    raidSession: WorldRaidSession;
    tutorialController: WorldTutorialController;
    storyScenarioController: WorldStoryScenarioController;
    networkIntentController: WorldNetworkIntentController;
    floatingText: FloatingTextManager;
    effectManager: EffectManager;
    fieldFeedback: WorldFieldFeedbackState;
    getWorldMap(): WorldMap;
    isNetworkRaid(): boolean;
    getPartyActors(): FieldActor[];
    getFieldEnemies(): FieldEnemy[];
    getControlledActor(): FieldActor | null;
    getActorById(actorId: string): FieldActor | null;
    getEnemyById(enemyId: string): Enemy | null;
    getBackpackCursedArtifactCount(): number;
    handleActorDown(actor: FieldActor): void;
    handleEnemyDefeated(actor: FieldActor, enemy: Enemy, feedbackGroupId?: string): void;
    stopResting(actor: FieldActor, logMessage?: string): void;
    switchToPartyMember(index: number): boolean;
    snapshotPartyHp(): Map<string, number>;
    interruptRestingForDamage(beforeHpByActorId: Map<string, number>): void;
    spawnEnemyLoot(enemy: Enemy): void;
    awardDefeatExp(actor: FieldActor, enemy: Enemy): void;
    clearEnemyIfSelected(enemyId: string): void;
    beginCombatFeedbackGroup(): string;
    registerCombatFeedback(kind: CombatFeedbackKind, feedbackGroupId?: string): void;
    flushCombatFeedbackGroup(feedbackGroupId: string): void;
    addCombatLog(message: string): void;
}

export interface WorldEngineCombatControllers {
    turnStartResolver: WorldTurnStartResolver;
    combatFlow: WorldEngineCombatFlow;
    movementController: WorldMovementController;
    fieldSpawnController: WorldFieldSpawnController;
    enemyTurnController: WorldEnemyTurnController;
}

export interface WorldEngineCombatControllerSources {
    ports: WorldEngineSharedControllerPorts;
    getScenarioNetworkControllers(): WorldEngineScenarioNetworkControllers;
    getActionControllers(): WorldEngineActionControllers;
    getActorById(actorId: string): FieldActor | null;
    getBackpackCursedArtifactCount(): number;
    handleActorDown(actor: FieldActor): void;
    handleEnemyDefeated(actor: FieldActor, enemy: Enemy, feedbackGroupId?: string): void;
    stopResting(actor: FieldActor, logMessage?: string): void;
    switchToPartyMember(index: number): boolean;
    snapshotPartyHp(): Map<string, number>;
    interruptRestingForDamage(beforeHpByActorId: Map<string, number>): void;
    spawnEnemyLoot(enemy: Enemy): void;
    awardDefeatExp(actor: FieldActor, enemy: Enemy): void;
}

export function createWorldEngineCombatControllersFromSources(
    sources: WorldEngineCombatControllerSources
): WorldEngineCombatControllers {
    const scenarioNetworkControllers = sources.getScenarioNetworkControllers();

    return createWorldEngineCombatControllers({
        ...sources.ports,
        tutorialController: scenarioNetworkControllers.tutorialController,
        storyScenarioController: scenarioNetworkControllers.storyScenarioController,
        networkIntentController: scenarioNetworkControllers.networkIntentController,
        getActorById: (actorId) => sources.getActorById(actorId),
        getBackpackCursedArtifactCount: () => sources.getBackpackCursedArtifactCount(),
        handleActorDown: (actor) => sources.handleActorDown(actor),
        handleEnemyDefeated: (actor, enemy, feedbackGroupId) => sources.handleEnemyDefeated(actor, enemy, feedbackGroupId),
        stopResting: (actor, logMessage) => sources.stopResting(actor, logMessage),
        switchToPartyMember: (index) => sources.switchToPartyMember(index),
        snapshotPartyHp: () => sources.snapshotPartyHp(),
        interruptRestingForDamage: (beforeHpByActorId) => sources.interruptRestingForDamage(beforeHpByActorId),
        spawnEnemyLoot: (enemy) => sources.spawnEnemyLoot(enemy),
        awardDefeatExp: (actor, enemy) => sources.awardDefeatExp(actor, enemy),
        clearEnemyIfSelected: (enemyId) => sources.getActionControllers().selectionController.clearEnemyIfSelected(enemyId),
    });
}

export function createWorldEngineCombatControllers(
    ports: WorldEngineCombatControllerPorts
): WorldEngineCombatControllers {
    const turnStartResolver = new WorldTurnStartResolver({
        getBackpackCursedArtifactCount: () => ports.getBackpackCursedArtifactCount(),
        getFallbackActor: () => ports.getControlledActor() ?? ports.getPartyActors().find((candidate) => !candidate.character.isDead) ?? null,
        handleActorDown: (actor) => ports.handleActorDown(actor),
        handleEnemyDefeated: (actor, enemy) => ports.handleEnemyDefeated(actor, enemy),
        stopResting: (actor, logMessage) => ports.stopResting(actor, logMessage),
        spawnDamage: (x, y, amount) => ports.floatingText.spawnDamage(x, y, amount, false, false),
        spawnHeal: (x, y, amount) => ports.floatingText.spawnHeal(x, y, amount),
        spawnDebuffEffect: (x, y) => ports.effectManager.spawnDebuffEffect(x, y),
        spawnHealEffect: (x, y) => ports.effectManager.spawnHealEffect(x, y),
        spawnDarkEffect: (x, y) => ports.effectManager.spawnDarkEffect(x, y),
        log: (message) => ports.addCombatLog(message),
    });

    const combatController = new WorldCombatController({
        log: (message) => ports.addCombatLog(message),
        spawnDamage: (x, y, amount, isCrit, isMiss) => ports.floatingText.spawnDamage(x, y, amount, isCrit, isMiss),
        spawnStatus: (x, y, text) => ports.floatingText.spawnStatus(x, y, text),
        spawnHitEffect: (x, y, isCrit, feedbackGroupId, feedbackKind) => {
            ports.effectManager.spawnHitEffect(x, y, isCrit);
            ports.registerCombatFeedback(feedbackKind ?? (isCrit ? 'critical' : 'normal'), feedbackGroupId);
        },
        spawnKillEffect: (enemy, feedbackGroupId, actor) => {
            const exp = actor ? enemy.calcExpFor(actor.character.level) : enemy.expReward;
            ports.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, exp, enemy);
            ports.registerCombatFeedback('kill', feedbackGroupId);
        },
        spawnAttackCue: (from, to, color, label) => ports.fieldFeedback.spawnAttackCue(from, to, color, label),
        spawnLoot: (enemy) => {
            if (!ports.tutorialController.isTutorialEnemy(enemy)) ports.spawnEnemyLoot(enemy);
        },
        awardExp: (actor, enemy) => {
            if (!ports.tutorialController.isTutorialEnemy(enemy)) ports.awardDefeatExp(actor, enemy);
        },
        onEnemyDefeated: (enemy) => {
            if (ports.tutorialController.isTutorialEnemy(enemy)) {
                ports.tutorialController.complete();
                return;
            }
            ports.storyScenarioController.completeDungeonIfBossDefeated(enemy);
        },
        flushFeedbackGroup: (feedbackGroupId) => ports.flushCombatFeedbackGroup(feedbackGroupId),
    });

    const combatFlow = new WorldEngineCombatFlow({
        isNetworkRaid: () => ports.isNetworkRaid(),
        isTutorialActive: () => ports.tutorialController.isActive(),
        isTutorialEnemy: (enemy) => ports.tutorialController.isTutorialEnemy(enemy),
        completeTutorial: () => ports.tutorialController.complete(),
        getWorldMap: () => ports.getWorldMap(),
        getFieldEnemies: () => ports.getFieldEnemies(),
        getPartyActors: () => ports.getPartyActors(),
        getActivePartyIndex: () => ports.party.getActiveIndex(),
        markActiveDead: () => ports.party.markActiveDead(),
        switchToPartyMember: (index) => ports.switchToPartyMember(index),
        submitNetworkAttack: (actor, enemy) => ports.networkIntentController.submitAttack(actor, enemy),
        combatController,
        snapshotPartyHp: () => ports.snapshotPartyHp(),
        interruptRestingForDamage: (beforeHpByActorId) => ports.interruptRestingForDamage(beforeHpByActorId),
        recordKill: () => ports.raidSession.recordKill(),
        recordCharacterDown: (characterId) => ports.raidSession.recordCharacterDown(characterId),
        clearEnemyIfSelected: (enemyId) => ports.clearEnemyIfSelected(enemyId),
        spawnKillEffect: (enemy, exp) => ports.effectManager.spawnKillEffect(enemy.gridX, enemy.gridY, enemy.color, exp, enemy),
        spawnStatus: (x, y, text) => ports.floatingText.spawnStatus(x, y, text),
        registerCombatFeedback: (kind, feedbackGroupId) => ports.registerCombatFeedback(kind, feedbackGroupId),
        spawnEnemyLoot: (enemy) => ports.spawnEnemyLoot(enemy),
        playEnemyDefeatEvent: (enemy) => ports.storyScenarioController.playEnemyDefeatEvent(enemy),
        completeDungeonIfBossDefeated: (enemy) => ports.storyScenarioController.completeDungeonIfBossDefeated(enemy),
        log: (message) => ports.addCombatLog(message),
    });

    const movementController = new WorldMovementController({
        getPartyActors: () => ports.getPartyActors(),
        getFieldEnemies: () => ports.getFieldEnemies(),
        getTileAt: (x, y) => ports.getWorldMap().getTileAt(x, y),
        isGroundWalkable: (x, y) => ports.getWorldMap().isWalkable(x, y),
        getTerrainTraitsForActorId: (actorId) => getWorldTerrainTraitsForActorId(ports.getPartyActors(), actorId),
        getPartyCarryAtbMultiplier: () => getCarryAtbMultiplier(
            getPartyCarriedWeight(ports.gameManager.inventory.items, ports.party.getCharacters())
        ),
        getPartyCursedAtbMultiplier: () => getCursedArtifactAtbMultiplier(ports.getBackpackCursedArtifactCount()),
        getPartyRaidAtbMultiplier: () => getRaidModifierEffects(ports.raidSession.raidModifier).partyAtbMultiplier,
        onPartyTerrainHazard: ({ actorName, point, hazard }) => {
            ports.addCombatLog(formatT(hazard.logKey, { actor: actorName }));
            ports.floatingText.spawnStatus(point.x, point.y, t(hazard.statusTextKey));
        },
    });

    const fieldSpawnController = new WorldFieldSpawnController(movementController);
    const enemyTurnController = new WorldEnemyTurnController(
        {
            getPartyActors: () => ports.getPartyActors(),
            getFieldEnemies: () => ports.getFieldEnemies(),
            getActorById: (actorId) => ports.getActorById(actorId),
            getEnemyById: (enemyId) => ports.getEnemyById(enemyId),
            getTileAt: (tile) => ports.getWorldMap().getTileAt(tile.x, tile.y),
            getActorTerrainTraits: (actor) => getWorldActorTerrainTraits(actor),
            canEnemyAttackTarget: (enemy, actor, range) => canWorldEnemyAttackTarget({ worldMap: ports.getWorldMap(), enemy, actor, range }),
            canActorAttackTarget: (actor, enemy) => canWorldActorAttackTarget({ worldMap: ports.getWorldMap(), actor, enemy }),
            hasFieldLineOfSight: (from, to) => hasWorldFieldLineOfSight(ports.getWorldMap(), from, to),
            directionFromTo: (from, to) => directionFromTo(from, to),
        },
        movementController,
        combatController,
        {
            log: (message) => ports.addCombatLog(message),
            spawnDamage: (x, y, amount, isCrit, isMiss) => ports.floatingText.spawnDamage(x, y, amount, isCrit, isMiss),
            spawnStatus: (x, y, text) => ports.floatingText.spawnStatus(x, y, text),
            spawnHeal: (x, y, amount) => ports.floatingText.spawnHeal(x, y, amount),
            spawnHealEffect: (x, y) => ports.effectManager.spawnHealEffect(x, y),
            spawnBuffEffect: (x, y) => ports.effectManager.spawnBuffEffect(x, y),
            spawnDebuffEffect: (x, y) => ports.effectManager.spawnDebuffEffect(x, y),
            spawnDarkEffect: (x, y) => ports.effectManager.spawnDarkEffect(x, y),
            spawnElementEffect: (element, x, y, feedbackGroupId) => {
                ports.effectManager.spawnByElement(element, x, y);
                ports.registerCombatFeedback('normal', feedbackGroupId);
            },
            spawnAttackCue: (from, to, color, label) => ports.fieldFeedback.spawnAttackCue(from, to, color, label),
            beginFeedbackGroup: () => ports.beginCombatFeedbackGroup(),
            flushFeedbackGroup: (feedbackGroupId) => ports.flushCombatFeedbackGroup(feedbackGroupId),
        }
    );

    return {
        turnStartResolver,
        combatFlow,
        movementController,
        fieldSpawnController,
        enemyTurnController,
    };
}
