import {
    getEffectiveStatsForCharacter,
    getEffectiveStatsForEnemy,
    resolveTurnStartStatuses,
} from '../../combat/StatusEffects';
import { getCursedArtifactTurnDamage } from '../../raid/CursedArtifact';
import { formatT } from '../../i18n/LanguageManager';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';

export interface WorldTurnStartResolverContext {
    getBackpackCursedArtifactCount: () => number;
    getFallbackActor: () => FieldActor | null;
    handleActorDown: (actor: FieldActor) => void;
    handleEnemyDefeated: (actor: FieldActor, enemy: FieldEnemy['enemy']) => void;
    stopResting: (actor: FieldActor, logMessage?: string) => void;
    spawnDamage: (x: number, y: number, amount: number) => void;
    spawnHeal: (x: number, y: number, amount: number) => void;
    spawnDebuffEffect: (x: number, y: number) => void;
    spawnHealEffect: (x: number, y: number) => void;
    spawnDarkEffect: (x: number, y: number) => void;
    log: (message: string) => void;
}

export class WorldTurnStartResolver {
    public constructor(private readonly context: WorldTurnStartResolverContext) {}

    public processActorTurnStart(actor: FieldActor): boolean {
        const result = resolveTurnStartStatuses(getEffectiveStatsForCharacter(actor.character), actor.character.statuses);
        actor.character.statuses = result.statuses;
        if (result.expiredReaction) this.context.log(formatT('field.log.statusReactionExpired', { name: actor.character.name }));
        if (result.poisonDamage > 0) {
            this.context.spawnDamage(actor.entity.gridX, actor.entity.gridY, result.poisonDamage);
            this.context.spawnDebuffEffect(actor.entity.gridX, actor.entity.gridY);
            this.context.log(formatT('field.log.statusPoisonDamage', { name: actor.character.name, value: result.poisonDamage }));
            this.context.stopResting(actor, formatT('field.log.restInterruptedDamage', { name: actor.character.name }));
        }
        if (result.regenHealing > 0) {
            this.context.spawnHeal(actor.entity.gridX, actor.entity.gridY, result.regenHealing);
            this.context.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);
            this.context.log(formatT('field.log.statusRegenHealing', { name: actor.character.name, value: result.regenHealing }));
        }
        const effective = getEffectiveStatsForCharacter(actor.character);
        actor.character.stats.hp = Math.max(0, Math.min(effective.maxHp, actor.character.stats.hp + result.hpDelta));
        this.applyCursedArtifactTurnDamage(actor, effective);

        if (actor.character.stats.hp <= 0 && !actor.character.isDead) {
            this.context.handleActorDown(actor);
            return false;
        }
        return true;
    }

    public processEnemyTurnStart(entry: FieldEnemy): boolean {
        const enemy = entry.enemy;
        const result = resolveTurnStartStatuses(getEffectiveStatsForEnemy(enemy), enemy.statuses);
        enemy.statuses = result.statuses;
        if (result.expiredReaction) this.context.log(formatT('field.log.statusReactionExpired', { name: enemy.name }));
        if (result.poisonDamage > 0) {
            this.context.spawnDamage(enemy.gridX, enemy.gridY, result.poisonDamage);
            this.context.spawnDebuffEffect(enemy.gridX, enemy.gridY);
            this.context.log(formatT('field.log.statusPoisonDamage', { name: enemy.name, value: result.poisonDamage }));
        }
        if (result.regenHealing > 0) {
            this.context.spawnHeal(enemy.gridX, enemy.gridY, result.regenHealing);
            this.context.spawnHealEffect(enemy.gridX, enemy.gridY);
            this.context.log(formatT('field.log.statusRegenHealing', { name: enemy.name, value: result.regenHealing }));
        }
        enemy.stats.hp = Math.max(0, Math.min(enemy.stats.maxHp, enemy.stats.hp + result.hpDelta));

        if (enemy.stats.hp <= 0) {
            const actor = this.context.getFallbackActor();
            if (actor) this.context.handleEnemyDefeated(actor, enemy);
            else enemy.isAggro = false;
            return false;
        }
        return true;
    }

    private applyCursedArtifactTurnDamage(
        actor: FieldActor,
        effective: ReturnType<typeof getEffectiveStatsForCharacter>
    ): void {
        const cursedCount = this.context.getBackpackCursedArtifactCount();
        const damage = Math.min(
            actor.character.stats.hp,
            getCursedArtifactTurnDamage(effective, cursedCount)
        );
        if (damage <= 0) return;

        actor.character.stats.hp = Math.max(0, actor.character.stats.hp - damage);
        this.context.spawnDamage(actor.entity.gridX, actor.entity.gridY, damage);
        this.context.spawnDarkEffect(actor.entity.gridX, actor.entity.gridY);
        this.context.log(formatT('field.log.cursedArtifactDamage', {
            name: actor.character.name,
            value: damage,
        }));
        this.context.stopResting(actor, formatT('field.log.restInterruptedDamage', { name: actor.character.name }));
    }
}
