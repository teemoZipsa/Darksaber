import {
    getEffectiveStatsForCharacter,
    getStatus,
    removeActionStanceStatusesFromCarrier,
    removeStatusesFromCarrier,
} from '../../combat/StatusEffects';
import type { FieldActor } from '../../field/FieldTypes';
import { formatT } from '../../i18n/LanguageManager';

export interface WorldRestingContext {
    getPartyActors(): FieldActor[];
    spawnHeal(x: number, y: number, amount: number): void;
    spawnStatus(x: number, y: number, text: string): void;
    spawnHealEffect(x: number, y: number): void;
    log(message: string): void;
}

export class WorldRestingController {
    private readonly context: WorldRestingContext;
    private readonly recoveryTimers = new Map<string, number>();

    constructor(context: WorldRestingContext) {
        this.context = context;
    }

    public clearTimers(): void {
        this.recoveryTimers.clear();
    }

    public update(dt: number): void {
        for (const actor of this.context.getPartyActors()) {
            if (actor.character.isDead || actor.character.stats.hp <= 0) {
                this.recoveryTimers.delete(actor.id);
                continue;
            }
            const resting = getStatus(actor.character.statuses, 'resting');
            if (!resting) {
                this.recoveryTimers.delete(actor.id);
                continue;
            }

            const effective = getEffectiveStatsForCharacter(actor.character);
            if (resting.sourceType !== 'action' && actor.character.stats.hp >= effective.maxHp && actor.character.stats.mp >= effective.maxMp) {
                this.stop(actor, formatT('field.log.restComplete', { name: actor.character.name }));
                continue;
            }

            let timer = (this.recoveryTimers.get(actor.id) ?? 0) + dt;
            const ticks = Math.floor(timer);
            if (ticks <= 0) {
                this.recoveryTimers.set(actor.id, timer);
                continue;
            }
            timer -= ticks;
            this.recoveryTimers.set(actor.id, timer);

            const hpPerTick = Math.max(2, Math.floor(effective.maxHp * 0.03));
            const mpPerTick = effective.maxMp > 0 ? Math.max(1, Math.floor(effective.maxMp * 0.03)) : 0;
            const beforeHp = actor.character.stats.hp;
            const beforeMp = actor.character.stats.mp;
            actor.character.stats.hp = Math.min(effective.maxHp, actor.character.stats.hp + hpPerTick * ticks);
            actor.character.stats.mp = Math.min(effective.maxMp, actor.character.stats.mp + mpPerTick * ticks);
            const hpGain = actor.character.stats.hp - beforeHp;
            const mpGain = actor.character.stats.mp - beforeMp;

            if (hpGain > 0) this.context.spawnHeal(actor.entity.gridX, actor.entity.gridY, hpGain);
            if (mpGain > 0) this.context.spawnStatus(actor.entity.gridX, actor.entity.gridY, `MP+${mpGain}`);
            if (hpGain > 0 || mpGain > 0) this.context.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);

            if (resting.sourceType !== 'action' && actor.character.stats.hp >= effective.maxHp && actor.character.stats.mp >= effective.maxMp) {
                this.stop(actor, formatT('field.log.restComplete', { name: actor.character.name }));
            }
        }
    }

    public stop(actor: FieldActor, logMessage?: string): void {
        const removed = removeStatusesFromCarrier(actor.character, (status) => status.kind === 'resting');
        this.recoveryTimers.delete(actor.id);
        if (removed.length === 0) return;
        this.context.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'REST END');
        if (logMessage) this.context.log(logMessage);
    }

    public snapshotPartyHp(): Map<string, number> {
        return new Map(this.context.getPartyActors().map((actor) => [actor.id, actor.character.stats.hp]));
    }

    public interruptForDamage(beforeHpByActorId: Map<string, number>): void {
        for (const actor of this.context.getPartyActors()) {
            const beforeHp = beforeHpByActorId.get(actor.id);
            if (beforeHp === undefined) continue;
            if (actor.character.stats.hp < beforeHp) {
                this.stop(actor, formatT('field.log.restInterruptedDamage', { name: actor.character.name }));
                removeActionStanceStatusesFromCarrier(actor.character);
            }
        }
    }
}
