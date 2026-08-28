import {
    recordMonsterDefeat,
    recordMonsterEncounter,
} from '../src/raid/MonsterCodex';
import type { WorldSessionSaveState } from './WorldSessionSaveState';
import type { ServerEnemy, ServerPlayer } from './WorldSessionTypes';

export function recordWorldSessionMonsterEncounter(
    player: ServerPlayer | undefined,
    target: ServerEnemy,
    saveState: WorldSessionSaveState,
    now: number,
): boolean {
    const monsterId = target.monsterId;
    const save = player?.saveSnapshot;
    if (!player || !save || !monsterId) return false;
    const encounteredEnemyIds = player.monsterCodexEncounteredEnemyIds ??= new Set<string>();
    if (encounteredEnemyIds.has(target.enemy.id)) return false;
    encounteredEnemyIds.add(target.enemy.id);
    save.questState.monsterCodex = recordMonsterEncounter(save.questState.monsterCodex, {
        monsterId,
        level: target.enemy.level,
        timestamp: now,
    });
    saveState.markDirty(player.id);
    return true;
}

export function recordWorldSessionMonsterDefeat(
    player: ServerPlayer | undefined,
    target: ServerEnemy,
    saveState: WorldSessionSaveState,
    now: number,
): boolean {
    const monsterId = target.monsterId;
    const save = player?.saveSnapshot;
    if (!player || !save || !monsterId) return false;
    recordWorldSessionMonsterEncounter(player, target, saveState, now);
    save.questState.monsterCodex = recordMonsterDefeat(save.questState.monsterCodex, {
        monsterId,
        level: target.enemy.level,
        timestamp: now,
    });
    saveState.markDirty(player.id);
    return true;
}
