import { getEffectiveStatsForEnemy, hasStatus } from '../src/combat/StatusEffects';
import { getClassLine } from '../src/data/ClassTree';
import { getLearnedSkills } from '../src/data/SkillDB';
import type { CharacterStats } from '../src/data/Stats';
import type { Enemy } from '../src/entity/Enemy';
import type { TilePoint } from '../src/field/FieldPathing';
import { manhattan } from '../src/field/FieldPathing';
import type { SkillEffectEnemyInput } from '../src/combat/SkillEffectResolver';
import type { ServerActor, ServerPlayer } from './WorldSessionTypes';
import { getEffectiveServerActorStats } from './WorldSessionHelpers';

export type RestingActorTimerUpdate =
    | { type: 'delete' }
    | { type: 'none' }
    | { type: 'set'; timer: number };

export function getActorLearnedSkillIds(actor: ServerActor): Set<string> {
    const classLine = getClassLine(actor.classLineId);
    const unlocked: string[] = [];
    if (classLine) {
        for (let tier = 1; tier <= actor.currentTier; tier++) {
            const ids = classLine.skillUnlocks[tier];
            if (ids) unlocked.push(...ids);
        }
    }
    return new Set(getLearnedSkills(actor.classLineId, actor.currentTier, unlocked).map((skill) => skill.id));
}

export function getActorCasterSkillStats(actor: ServerActor): CharacterStats {
    const effective = getEffectiveServerActorStats(actor);
    return {
        ...effective,
        hp: actor.stats.hp,
        mp: actor.stats.mp,
    };
}

export function toSkillEffectEnemyInput(enemy: Enemy): SkillEffectEnemyInput {
    return {
        id: enemy.id,
        name: enemy.name,
        gridX: enemy.gridX,
        gridY: enemy.gridY,
        stats: getEffectiveStatsForEnemy(enemy),
    };
}

export function applyActorResourceDelta(actor: ServerActor, hpDelta: number, mpDelta: number): void {
    const effective = getEffectiveServerActorStats(actor);
    actor.stats.hp = Math.max(0, Math.min(effective.maxHp, actor.stats.hp + hpDelta));
    actor.stats.mp = Math.max(0, Math.min(effective.maxMp, actor.stats.mp + mpDelta));
    actor.isDead = actor.stats.hp <= 0;
}

export function updateRestingActorResources(actor: ServerActor, currentTimer: number | undefined, dt: number): RestingActorTimerUpdate {
    if (!hasStatus(actor.statuses, 'resting')) return { type: 'delete' };

    const effective = getEffectiveServerActorStats(actor);
    if (actor.stats.hp >= effective.maxHp && actor.stats.mp >= effective.maxMp) return { type: 'none' };

    let timer = (currentTimer ?? 0) + dt;
    const ticks = Math.floor(timer);
    if (ticks <= 0) return { type: 'set', timer };

    timer -= ticks;
    const hpPerTick = Math.max(2, Math.floor(effective.maxHp * 0.03));
    const mpPerTick = effective.maxMp > 0 ? Math.max(1, Math.floor(effective.maxMp * 0.03)) : 0;
    actor.stats.hp = Math.min(effective.maxHp, actor.stats.hp + hpPerTick * ticks);
    actor.stats.mp = Math.min(effective.maxMp, actor.stats.mp + mpPerTick * ticks);
    return { type: 'set', timer };
}

export function getAlliedActorsWithin(
    actors: ReadonlyMap<string, ServerActor>,
    player: ServerPlayer,
    casterTile: TilePoint,
    radius: number
): ServerActor[] {
    return player.actorIds
        .map((actorId) => actors.get(actorId))
        .filter((actor): actor is ServerActor => {
            if (!actor) return false;
            return !actor.isDead
                && actor.stats.hp > 0
                && manhattan(casterTile, actor.tile) <= radius;
        });
}
