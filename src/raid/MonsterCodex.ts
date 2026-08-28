import {
    MONSTER_IDS,
    isMonsterId,
    type MonsterId,
} from '../data/MonsterCatalog';

export const MONSTER_CODEX_MAX_COUNT = 999_999;
const MONSTER_CODEX_MAX_LEVEL = 99;
const MONSTER_CODEX_MAX_TIMESTAMP = 8_639_999_999_999_999;

export interface MonsterCodexEntry {
    monsterId: MonsterId;
    /** Distinct enemy instances that entered this character's detection range. */
    encounters: number;
    /** Server-authoritative (or local DEV) confirmed defeats. */
    kills: number;
    highestDefeatedLevel: number;
    firstEncounteredAt: number;
    lastEncounteredAt: number;
    lastDefeatedAt?: number;
}

export interface MonsterCodexObservation {
    monsterId: string;
    level: number;
    timestamp?: number;
}

export interface MonsterCodexProgress {
    encountered: number;
    defeated: number;
    total: number;
}

const CATALOG_INDEX = new Map<MonsterId, number>(MONSTER_IDS.map((id, index) => [id, index]));

export function normalizeMonsterCodex(value: unknown): MonsterCodexEntry[] {
    if (!Array.isArray(value)) return [];
    const merged = new Map<MonsterId, MonsterCodexEntry>();
    for (const raw of value) {
        const entry = normalizeMonsterCodexEntry(raw);
        if (!entry) continue;
        const previous = merged.get(entry.monsterId);
        merged.set(entry.monsterId, previous ? mergeEntries(previous, entry) : entry);
    }
    return sortEntries([...merged.values()]);
}

export function recordMonsterEncounter(
    value: unknown,
    observation: MonsterCodexObservation,
): MonsterCodexEntry[] {
    if (!isMonsterId(observation.monsterId)) return normalizeMonsterCodex(value);
    const entries = normalizeMonsterCodex(value);
    const timestamp = normalizeTimestamp(observation.timestamp ?? Date.now());
    const existing = entries.find((entry) => entry.monsterId === observation.monsterId);
    const next: MonsterCodexEntry = existing ? {
        ...existing,
        encounters: increment(existing.encounters),
        lastEncounteredAt: Math.max(existing.lastEncounteredAt, timestamp),
    } : {
        monsterId: observation.monsterId,
        encounters: 1,
        kills: 0,
        highestDefeatedLevel: 0,
        firstEncounteredAt: timestamp,
        lastEncounteredAt: timestamp,
    };
    return replaceEntry(entries, next);
}

export function recordMonsterDefeat(
    value: unknown,
    observation: MonsterCodexObservation,
): MonsterCodexEntry[] {
    if (!isMonsterId(observation.monsterId)) return normalizeMonsterCodex(value);
    const entries = normalizeMonsterCodex(value);
    const timestamp = normalizeTimestamp(observation.timestamp ?? Date.now());
    const level = normalizeLevel(observation.level);
    const existing = entries.find((entry) => entry.monsterId === observation.monsterId);
    const kills = increment(existing?.kills ?? 0);
    const next: MonsterCodexEntry = existing ? {
        ...existing,
        encounters: Math.max(existing.encounters, kills),
        kills,
        highestDefeatedLevel: Math.max(existing.highestDefeatedLevel, level),
        lastEncounteredAt: Math.max(existing.lastEncounteredAt, timestamp),
        lastDefeatedAt: Math.max(existing.lastDefeatedAt ?? 0, timestamp),
    } : {
        monsterId: observation.monsterId,
        encounters: 1,
        kills: 1,
        highestDefeatedLevel: level,
        firstEncounteredAt: timestamp,
        lastEncounteredAt: timestamp,
        lastDefeatedAt: timestamp,
    };
    return replaceEntry(entries, next);
}

export function getMonsterCodexEntry(
    value: unknown,
    monsterId: MonsterId,
): MonsterCodexEntry | undefined {
    return normalizeMonsterCodex(value).find((entry) => entry.monsterId === monsterId);
}

export function getMonsterCodexProgress(value: unknown): MonsterCodexProgress {
    const entries = normalizeMonsterCodex(value);
    return {
        encountered: entries.length,
        defeated: entries.filter((entry) => entry.kills > 0).length,
        total: MONSTER_IDS.length,
    };
}

function normalizeMonsterCodexEntry(value: unknown): MonsterCodexEntry | null {
    if (!isRecord(value) || typeof value.monsterId !== 'string' || !isMonsterId(value.monsterId)) return null;
    const kills = normalizeCount(value.kills);
    const encounters = Math.max(normalizeCount(value.encounters), kills);
    if (encounters <= 0) return null;
    const firstEncounteredAt = normalizeTimestamp(value.firstEncounteredAt);
    const lastEncounteredAt = Math.max(firstEncounteredAt, normalizeTimestamp(value.lastEncounteredAt));
    const lastDefeatedAt = kills > 0 ? normalizeOptionalTimestamp(value.lastDefeatedAt) : undefined;
    return {
        monsterId: value.monsterId,
        encounters,
        kills,
        highestDefeatedLevel: kills > 0 ? normalizeLevel(value.highestDefeatedLevel) : 0,
        firstEncounteredAt,
        lastEncounteredAt,
        ...(lastDefeatedAt !== undefined ? { lastDefeatedAt } : {}),
    };
}

function mergeEntries(left: MonsterCodexEntry, right: MonsterCodexEntry): MonsterCodexEntry {
    const kills = Math.max(left.kills, right.kills);
    const lastDefeatedAt = Math.max(left.lastDefeatedAt ?? 0, right.lastDefeatedAt ?? 0);
    return {
        monsterId: left.monsterId,
        encounters: Math.max(left.encounters, right.encounters, kills),
        kills,
        highestDefeatedLevel: Math.max(left.highestDefeatedLevel, right.highestDefeatedLevel),
        firstEncounteredAt: Math.min(left.firstEncounteredAt, right.firstEncounteredAt),
        lastEncounteredAt: Math.max(left.lastEncounteredAt, right.lastEncounteredAt),
        ...(lastDefeatedAt > 0 ? { lastDefeatedAt } : {}),
    };
}

function replaceEntry(entries: readonly MonsterCodexEntry[], next: MonsterCodexEntry): MonsterCodexEntry[] {
    return sortEntries([
        ...entries.filter((entry) => entry.monsterId !== next.monsterId),
        next,
    ]);
}

function sortEntries(entries: MonsterCodexEntry[]): MonsterCodexEntry[] {
    return entries.sort((left, right) => (
        (CATALOG_INDEX.get(left.monsterId) ?? Number.MAX_SAFE_INTEGER)
        - (CATALOG_INDEX.get(right.monsterId) ?? Number.MAX_SAFE_INTEGER)
    ));
}

function increment(value: number): number {
    return Math.min(MONSTER_CODEX_MAX_COUNT, value + 1);
}

function normalizeCount(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.min(MONSTER_CODEX_MAX_COUNT, Math.floor(value)))
        : 0;
}

function normalizeLevel(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(1, Math.min(MONSTER_CODEX_MAX_LEVEL, Math.floor(value)))
        : 1;
}

function normalizeTimestamp(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.min(MONSTER_CODEX_MAX_TIMESTAMP, Math.floor(value)))
        : 0;
}

function normalizeOptionalTimestamp(value: unknown): number | undefined {
    const timestamp = normalizeTimestamp(value);
    return timestamp > 0 ? timestamp : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
