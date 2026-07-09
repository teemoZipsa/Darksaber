import type { Enemy } from '../../entity/Enemy';
import type { FieldActor, FieldEnemy, FieldTurnEndReason } from '../../field/FieldTypes';
import { formatT, t } from '../../i18n/LanguageManager';
import type { CombatResult } from './WorldCombatController';
import type { WorldEngineActionControllers } from './WorldEngineActionControllers';
import type { WorldEngineCombatControllers } from './WorldEngineCombatControllers';
import type { WorldEngineFieldState } from './WorldEngineFieldState';
import type { WorldEngineFlowState } from './WorldEngineFlowState';
import type { WorldEngineScenarioNetworkControllers } from './WorldEngineScenarioNetworkControllers';
import type { WorldEngineUiState } from './WorldEngineUiState';

export interface WorldEngineReadyTurnFlowContext {
    actionControllers: WorldEngineActionControllers;
    combatControllers: WorldEngineCombatControllers;
    fieldState: WorldEngineFieldState;
    flowState: WorldEngineFlowState;
    scenarioNetworkControllers: WorldEngineScenarioNetworkControllers;
    uiState: WorldEngineUiState;
    switchToPartyMember(index: number): boolean;
    closeActionMenu(): void;
    closeTacticalMenu(): void;
    endActorTurn(actor: FieldActor, reason: FieldTurnEndReason): void;
    snapshotPartyHp(): Map<string, number>;
    applyCombatResult(result: CombatResult): void;
    interruptRestingForDamage(beforeHpByActorId: Map<string, number>): void;
    addCombatLog(message: string): void;
}

export function endWorldEngineEnemyTurn(context: WorldEngineReadyTurnFlowContext, enemy: Enemy): void {
    enemy.actionGauge = 0;
    context.flowState.turnStateController.endActiveTurn();
}

export function startWorldEngineNextReadyTurn(context: WorldEngineReadyTurnFlowContext): void {
    clearWorldEngineInvalidActiveTurn(context);
    if (context.flowState.turnStateController.isReadyTurnBlocked()) return;

    while (context.flowState.turnStateController.hasReadyActors()) {
        const actorId = context.flowState.turnStateController.shiftReadyActorId();
        if (!actorId) return;
        const actor = context.fieldState.partyActors.find((candidate) => candidate.id === actorId);
        if (actor) {
            if (actor.character.isDead) continue;
            beginWorldEngineActorTurn(context, actor);
            return;
        }

        const enemyEntry = context.fieldState.fieldEnemies.find((entry) => entry.enemy.id === actorId);
        if (!enemyEntry || enemyEntry.enemy.stats.hp <= 0) continue;
        beginWorldEngineEnemyTurn(context, enemyEntry);
        if (context.flowState.turnStateController.getActiveTurnActorId()) return;
    }
}

export function clearWorldEngineInvalidActiveTurn(context: WorldEngineReadyTurnFlowContext): void {
    const cleared = context.flowState.turnStateController.clearInvalidActiveTurn((actorId) => {
        const activePartyActor = context.fieldState.partyActors.find((actor) => actor.id === actorId);
        if (activePartyActor && !activePartyActor.character.isDead && activePartyActor.character.stats.hp > 0) return true;

        const activeEnemy = context.fieldState.fieldEnemies.find((entry) => entry.enemy.id === actorId)?.enemy;
        return activeEnemy !== undefined && activeEnemy.stats.hp > 0;
    });
    if (!cleared) return;

    context.closeActionMenu();
    context.closeTacticalMenu();
    context.actionControllers.playerActionController.clearTargeting();
    context.actionControllers.magicController.reset();
    context.actionControllers.toolController?.reset();
}

export function beginWorldEngineActorTurn(context: WorldEngineReadyTurnFlowContext, actor: FieldActor): void {
    const index = context.fieldState.partyActors.indexOf(actor);
    if (index >= 0) context.switchToPartyMember(index);
    actor.entity.actionGauge = context.flowState.turnStateController.beginActorTurn(actor.id);
    context.actionControllers.selectionController.selectActor(actor.id);
    if (!context.combatControllers.turnStartResolver.processActorTurnStart(actor)) {
        context.endActorTurn(actor, 'statusBlocked');
        return;
    }
    context.uiState.floatingText.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'READY');
    context.addCombatLog(formatT('field.log.turnStart', {
        name: actor.character.name,
        gauge: t('ui.actionGauge'),
        value: context.flowState.turnStateController.getRemainingActionPoints(),
    }));
    if (!context.actionControllers.playerActionController.hasExecutableAction(actor)) context.endActorTurn(actor, 'noExecutableAction');
    else {
        context.closeTacticalMenu();
        context.uiState.actionMenuUI.open(context.scenarioNetworkControllers.tutorialController.getActionMenuStates(actor));
    }
}

export function beginWorldEngineEnemyTurn(context: WorldEngineReadyTurnFlowContext, entry: FieldEnemy): void {
    const enemy = entry.enemy;
    context.flowState.turnStateController.beginEnemyTurn(enemy.id);
    context.uiState.floatingText.spawnStatus(enemy.gridX, enemy.gridY, 'READY');

    if (!context.combatControllers.turnStartResolver.processEnemyTurnStart(entry)) {
        endWorldEngineEnemyTurn(context, enemy);
        return;
    }

    const beforeHpByActorId = context.snapshotPartyHp();
    context.applyCombatResult(context.combatControllers.enemyTurnController.beginEnemyTurn(entry));
    context.interruptRestingForDamage(beforeHpByActorId);
    endWorldEngineEnemyTurn(context, enemy);
}

export function refreshWorldEngineEnemyIntentPreviews(context: WorldEngineReadyTurnFlowContext): void {
    for (const entry of context.fieldState.fieldEnemies) {
        entry.previewIntent = context.combatControllers.enemyTurnController.previewEnemyIntent(entry);
    }
}
