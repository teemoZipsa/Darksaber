import {
    applyCharacterExp,
    getCharacterExpToNext,
} from '../src/character/CharacterProgression';
import { isMasterClassLineId } from '../src/data/ClassTree';
import type { CharacterStats } from '../src/data/Stats';
import type { Enemy } from '../src/entity/Enemy';
import type { WorldRealm } from '../src/map/BiomeMask';
import type { WorldSessionSaveState } from './WorldSessionSaveState';
import type { ServerActor, ServerPlayer } from './WorldSessionTypes';

export interface WorldSessionEnemyExpInput {
    actor: ServerActor;
    enemy: Enemy;
    player: ServerPlayer;
    realm: WorldRealm;
    saveState: WorldSessionSaveState;
}

/** Apply the same realm gate and progression rules used by local raids. */
export function awardWorldSessionEnemyExp(input: WorldSessionEnemyExpInput): number {
    const { actor, enemy, player, realm, saveState } = input;
    if (!canGainExpInRealm(actor, realm)) return 0;

    const saved = readSavedProgression(player, actor.localActorId);
    const expAward = enemy.calcExpFor(actor.level);
    const progression = applyCharacterExp({
        classLineId: actor.classLineId,
        currentTier: actor.currentTier,
        level: actor.level,
        exp: actor.exp ?? saved?.exp ?? 0,
        expToNext: getCharacterExpToNext(actor.classLineId, actor.currentTier, actor.level),
        stats: actor.stats,
        hasEmblem: actor.hasEmblem ?? saved?.hasEmblem ?? false,
    }, expAward);

    actor.currentTier = progression.state.currentTier;
    actor.level = progression.state.level;
    actor.exp = progression.state.exp;
    actor.hasEmblem = progression.state.hasEmblem;
    actor.stats = progression.state.stats;
    writeSavedProgression(player, actor, progression.leveledUp);
    saveState.markDirty(player.id);
    return expAward;
}

/** Local raids lose all accumulated EXP when a character is downed. */
export function resetWorldSessionActorExp(
    actor: ServerActor,
    player: ServerPlayer,
    saveState: WorldSessionSaveState,
): void {
    const saved = readSavedProgression(player, actor.localActorId);
    if ((actor.exp ?? saved?.exp ?? 0) <= 0) return;
    actor.exp = 0;
    writeSavedProgression(player, actor, false);
    saveState.markDirty(player.id);
}

function canGainExpInRealm(actor: ServerActor, realm: WorldRealm): boolean {
    const isMaster = isMasterClassLineId(actor.classLineId) || actor.currentTier >= 8;
    return realm === 'master' ? isMaster : !isMaster;
}

interface SavedProgression {
    exp: number;
    hasEmblem: boolean;
}

function readSavedProgression(player: ServerPlayer, characterId: string): SavedProgression | null {
    const record = findSavedRosterCharacter(player, characterId);
    if (!record) return null;
    return {
        exp: readNonNegativeInt(record.exp),
        hasEmblem: record.hasEmblem === true,
    };
}

function writeSavedProgression(player: ServerPlayer, actor: ServerActor, includeStats: boolean): void {
    const record = findSavedRosterCharacter(player, actor.localActorId);
    if (!record) return;
    record.classKey = actor.classLineId;
    record.classLineId = actor.classLineId;
    record.tier = actor.currentTier;
    record.currentTier = actor.currentTier;
    record.level = actor.level;
    record.exp = actor.exp ?? 0;
    record.hasEmblem = actor.hasEmblem === true;
    if (includeStats) record.baseStats = cloneStats(actor.stats);
}

function findSavedRosterCharacter(player: ServerPlayer, characterId: string): Record<string, unknown> | null {
    const characters = player.saveSnapshot?.rosterSnapshot.characters;
    if (!Array.isArray(characters)) return null;
    for (const entry of characters) {
        if (isRecord(entry) && entry.id === characterId) return entry;
    }
    return null;
}

function cloneStats(stats: CharacterStats): CharacterStats {
    return { ...stats };
}

function readNonNegativeInt(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
