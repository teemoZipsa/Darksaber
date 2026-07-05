import type { CharacterStats } from '../src/data/Stats';
import { createBaseStats } from '../src/data/Stats';
import type { ActorSnapshot } from '../src/net/WorldProtocol';
import type { CharacterSave } from '../src/shared/CharacterSave';
import type { AuthCharacter } from './AuthStore';

export function createPartyCompositionFromSave(character: AuthCharacter, save: CharacterSave): ActorSnapshot[] {
    const rosterEntries = readRosterEntries(save);
    const selectedEntry = rosterEntries.get(character.id) ?? {
        id: character.id,
        name: character.name,
        classKey: character.classKey,
        tier: character.tier,
        level: character.level,
        baseStats: character.baseStats,
    };
    const activeIds = readStringArray(save.partySnapshot.activeCharacterIds)
        .filter((id) => id !== character.id);
    const entries = [
        selectedEntry,
        ...activeIds.flatMap((id) => rosterEntries.get(id) ?? []),
    ];

    return entries.slice(0, 3).map((entry) => ({
        id: entry.id,
        localActorId: entry.id,
        name: entry.name,
        classLineId: entry.classKey,
        currentTier: sanitizePositiveInt(entry.tier, 1),
        level: sanitizePositiveInt(entry.level, 1),
        tile: { x: 0, y: 0 },
        stats: createBaseStats(entry.baseStats),
        statuses: [],
        actionGauge: 0,
        remainingAp: 0,
        majorActionUsed: false,
        facing: 'down',
        isDead: false,
    }));
}

function readRosterEntries(save: CharacterSave): Map<string, { id: string; name: string; classKey: string; tier: number; level: number; baseStats: Partial<CharacterStats> }> {
    const rawCharacters = Array.isArray(save.rosterSnapshot.characters) ? save.rosterSnapshot.characters : [];
    const entries = new Map<string, { id: string; name: string; classKey: string; tier: number; level: number; baseStats: Partial<CharacterStats> }>();
    for (const raw of rawCharacters) {
        if (!isRecord(raw)) continue;
        const id = typeof raw.id === 'string' ? raw.id : null;
        const name = typeof raw.name === 'string' ? raw.name : null;
        const classKey = typeof raw.classKey === 'string'
            ? raw.classKey
            : typeof raw.classLineId === 'string'
                ? raw.classLineId
                : null;
        if (!id || !name || !classKey) continue;
        entries.set(id, {
            id,
            name,
            classKey,
            tier: sanitizePositiveInt(raw.tier ?? raw.currentTier, 1),
            level: sanitizePositiveInt(raw.level, 1),
            baseStats: isRecord(raw.baseStats) ? raw.baseStats as Partial<CharacterStats> : {},
        });
    }
    return entries;
}

function readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function sanitizePositiveInt(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
