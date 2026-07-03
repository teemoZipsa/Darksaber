import { isMasterClassLineId } from '../../data/ClassTree';
import type { Character } from '../../character/Character';
import { Enemy } from '../../entity/Enemy';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import { formatT, t } from '../../i18n/LanguageManager';
import type { WorldMap } from '../../map/WorldMap';
import { createCombatResult, type CombatResult, type WorldCombatController } from './WorldCombatController';
import type { CombatFeedbackKind } from './CombatFeedback';
import {
    canWorldActorAttackTarget,
    getWorldActorAttackProfile,
    getWorldActorTerrainTraits,
    getWorldAttackPatternTargetEnemies,
} from './WorldAttackTargeting';
import { directionFromTo } from './WorldEngineFieldHelpers';

export interface WorldEngineCombatFlowContext {
    isNetworkRaid: () => boolean;
    isTutorialActive: () => boolean;
    isTutorialEnemy: (enemy: Enemy) => boolean;
    completeTutorial: () => void;
    getWorldMap: () => WorldMap;
    getFieldEnemies: () => FieldEnemy[];
    getPartyActors: () => FieldActor[];
    getActivePartyIndex: () => number;
    markActiveDead: () => Character | null;
    switchToPartyMember: (index: number) => boolean;
    submitNetworkAttack: (actor: FieldActor, enemy: Enemy) => boolean;
    combatController: WorldCombatController;
    snapshotPartyHp: () => Map<string, number>;
    interruptRestingForDamage: (beforeHpByActorId: Map<string, number>) => void;
    recordKill: () => void;
    recordCharacterDown: (characterId: string) => void;
    clearEnemyIfSelected: (enemyId: string) => void;
    spawnKillEffect: (enemy: Enemy, exp: number) => void;
    spawnStatus: (x: number, y: number, text: string) => void;
    registerCombatFeedback: (kind: CombatFeedbackKind, feedbackGroupId?: string) => void;
    spawnEnemyLoot: (enemy: Enemy) => void;
    playEnemyDefeatEvent: (enemy: Enemy) => void;
    completeDungeonIfBossDefeated: (enemy: Enemy) => void;
    log: (message: string) => void;
}

export class WorldEngineCombatFlow {
    public constructor(private readonly context: WorldEngineCombatFlowContext) {}

    public applyCombatResult(result: CombatResult): void {
        for (const enemyId of result.killedEnemyIds) {
            this.context.recordKill();
            this.context.clearEnemyIfSelected(enemyId);
        }
        for (const characterId of result.downedCharacterIds) {
            const actor = this.context.getPartyActors().find((candidate) => candidate.character.id === characterId);
            if (actor && !actor.character.isDead) this.handleActorDown(actor);
            else this.context.recordCharacterDown(characterId);
        }
    }

    public tryActorAttack(actor: FieldActor, enemy: Enemy): boolean {
        if (this.context.isNetworkRaid()) {
            return this.context.submitNetworkAttack(actor, enemy);
        }
        if (!this.context.isTutorialActive()) {
            this.context.log(t('field.log.serverCombatOnly'));
            return false;
        }

        const worldMap = this.context.getWorldMap();
        if (!canWorldActorAttackTarget({ worldMap, actor, enemy })) return false;
        const profile = getWorldActorAttackProfile(actor);
        const targetEnemies = getWorldAttackPatternTargetEnemies({
            worldMap,
            fieldEnemies: this.context.getFieldEnemies(),
            actor,
            selectedEnemy: enemy,
        });
        const beforeHpByActorId = this.context.snapshotPartyHp();
        const result = this.context.combatController.tryActorAttack({
            actor,
            selectedEnemy: enemy,
            targetEnemies,
            profile,
            getTileAt: (tile) => worldMap.getTileAt(tile.x, tile.y),
            directionFromTo: (from, to) => directionFromTo(from, to),
            tryEnemyCounterAttack: (counterEnemy, counterActor) => {
                const countered = this.tryEnemyCounterAttack(counterEnemy, counterActor);
                return createCombatResult(countered);
            },
        });
        this.applyCombatResult(result);
        this.context.interruptRestingForDamage(beforeHpByActorId);
        return result.executed;
    }

    public tryEnemyCounterAttack(enemy: Enemy, actor: FieldActor): boolean {
        const beforeHpByActorId = this.context.snapshotPartyHp();
        const worldMap = this.context.getWorldMap();
        const result = this.context.combatController.tryEnemyCounterAttack({
            enemy,
            actor,
            getTileAt: (tile) => worldMap.getTileAt(tile.x, tile.y),
            getActorTerrainTraits: (targetActor) => getWorldActorTerrainTraits(targetActor),
        });
        this.applyCombatResult(result);
        this.context.interruptRestingForDamage(beforeHpByActorId);
        return result.executed;
    }

    public handleEnemyDefeated(actor: FieldActor, enemy: Enemy, feedbackGroupId?: string): void {
        if (this.context.isTutorialEnemy(enemy)) {
            this.context.spawnKillEffect(enemy, enemy.expReward);
            this.context.registerCombatFeedback('kill', feedbackGroupId);
            this.context.spawnStatus(enemy.gridX, enemy.gridY, 'DOWN');
            enemy.isAggro = false;
            this.context.clearEnemyIfSelected(enemy.id);
            this.context.completeTutorial();
            return;
        }

        this.awardDefeatExp(actor, enemy);
        this.context.recordKill();
        const killExp = enemy.calcExpFor(actor.character.level);
        this.context.spawnKillEffect(enemy, killExp);
        this.context.registerCombatFeedback('kill', feedbackGroupId);
        this.context.spawnStatus(enemy.gridX, enemy.gridY, 'DOWN');
        enemy.isAggro = false;
        this.context.clearEnemyIfSelected(enemy.id);

        this.context.spawnEnemyLoot(enemy);
        this.context.playEnemyDefeatEvent(enemy);
        this.context.completeDungeonIfBossDefeated(enemy);
    }

    public awardDefeatExp(actor: FieldActor, enemy: Enemy): void {
        const exp = enemy.calcExpFor(actor.character.level);
        const canGainExp = this.canCharacterGainExpInCurrentRealm(actor.character);
        this.context.log(canGainExp
            ? formatT('field.log.enemyDefeatedExp', { enemy: enemy.name, exp })
            : formatT('field.log.enemyDefeated', { enemy: enemy.name }));
        if (canGainExp) {
            const expResult = actor.character.gainExp(exp);
            if (expResult.promoted && expResult.newTierName) {
                this.context.log(formatT('field.log.actorPromoted', { name: actor.character.name, tier: expResult.newTierName }));
            }
            if (expResult.emblemUnlocked) {
                this.context.log(formatT('field.log.emblemUnlocked', { name: actor.character.name }));
            }
        } else {
            this.context.log(t('field.log.noGrowthRealm'));
        }
    }

    public handleActorDown(actor: FieldActor): void {
        this.context.recordCharacterDown(actor.character.id);
        const partyActors = this.context.getPartyActors();
        const index = partyActors.indexOf(actor);
        if (index === this.context.getActivePartyIndex()) {
            const next = this.context.markActiveDead();
            this.context.log(formatT('field.log.actorDown', { name: actor.character.name }));
            this.context.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'DOWN');
            if (next) {
                const nextIndex = partyActors.findIndex((candidate) => candidate.character === next);
                if (nextIndex >= 0) this.context.switchToPartyMember(nextIndex);
            } else {
                this.context.log(t('field.log.partyAllDown'));
            }
            return;
        }

        actor.character.isDead = true;
        actor.character.exp = 0;
        this.context.log(formatT('field.log.actorDown', { name: actor.character.name }));
        this.context.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'DOWN');
    }

    private canCharacterGainExpInCurrentRealm(character: Character): boolean {
        const isMaster = isMasterClassLineId(character.classLineId) || character.currentTier >= 8;
        return this.context.getWorldMap().getRealm() === 'master' ? isMaster : !isMaster;
    }
}
