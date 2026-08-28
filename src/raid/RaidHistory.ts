import type { RaidOutcome } from './RaidOutcome';

export const RAID_HISTORY_LIMIT = 20;

export type RaidHistoryResult = 'SURVIVED' | 'DEAD' | 'MIA' | 'LEFT';

let localRaidHistorySequence = 0;

/** Compact, character-scoped summary of a finalized raid. Newest entries come first. */
export interface RaidHistoryEntry {
    id: string;
    completedAt: number;
    result: RaidHistoryResult;
    elapsedSeconds: number;
    kills: number;
    departureTownId: string;
    extractionTownId: string;
    securedItems: number;
    lostItems: number;
    equipmentLost: number;
    goldReward: number;
}

export function createRaidHistoryEntry(entry: RaidHistoryEntry): RaidHistoryEntry {
    const departureTownId = normalizeRequiredString(entry.departureTownId, 'central_castle');
    return {
        id: normalizeRequiredString(entry.id, 'raid-history'),
        completedAt: normalizeTimestamp(entry.completedAt),
        result: entry.result,
        elapsedSeconds: normalizeCount(entry.elapsedSeconds),
        kills: normalizeCount(entry.kills),
        departureTownId,
        extractionTownId: normalizeRequiredString(entry.extractionTownId, departureTownId),
        securedItems: normalizeCount(entry.securedItems),
        lostItems: normalizeCount(entry.lostItems),
        equipmentLost: normalizeCount(entry.equipmentLost),
        goldReward: normalizeCount(entry.goldReward),
    };
}

export function createLocalRaidHistoryEntry(
    outcome: RaidOutcome,
    completedAt: number = Date.now(),
): RaidHistoryEntry {
    return createRaidHistoryEntry({
        id: `local:${completedAt}:${localRaidHistorySequence++}`,
        completedAt,
        result: outcome.result,
        elapsedSeconds: outcome.elapsedSeconds,
        kills: outcome.kills,
        departureTownId: outcome.departureTownId,
        extractionTownId: outcome.extractionTownId ?? outcome.departureTownId,
        securedItems: sumItemQuantities(outcome.secured),
        lostItems: sumItemQuantities(outcome.lost),
        equipmentLost: outcome.equipmentLost.length,
        goldReward: outcome.goldReward ?? 0,
    });
}

export function prependRaidHistory(current: unknown, entry: RaidHistoryEntry): RaidHistoryEntry[] {
    return normalizeRaidHistory([createRaidHistoryEntry(entry), ...normalizeRaidHistory(current)]);
}

export function normalizeRaidHistory(value: unknown): RaidHistoryEntry[] {
    if (!Array.isArray(value)) return [];
    const normalized = value
        .map(normalizeRaidHistoryEntry)
        .filter((entry): entry is RaidHistoryEntry => entry !== null)
        .sort((left, right) => right.completedAt - left.completedAt);
    const ids = new Set<string>();
    const result: RaidHistoryEntry[] = [];
    for (const entry of normalized) {
        if (ids.has(entry.id)) continue;
        ids.add(entry.id);
        result.push(entry);
        if (result.length >= RAID_HISTORY_LIMIT) break;
    }
    return result;
}

function normalizeRaidHistoryEntry(value: unknown): RaidHistoryEntry | null {
    if (!isRecord(value)) return null;
    if (!isRaidHistoryResult(value.result)) return null;
    const id = normalizeOptionalString(value.id);
    const departureTownId = normalizeOptionalString(value.departureTownId);
    const extractionTownId = normalizeOptionalString(value.extractionTownId);
    if (!id || !departureTownId || !extractionTownId) return null;
    if (typeof value.completedAt !== 'number' || !Number.isFinite(value.completedAt)) return null;
    return createRaidHistoryEntry({
        id,
        completedAt: value.completedAt,
        result: value.result,
        elapsedSeconds: readCount(value.elapsedSeconds),
        kills: readCount(value.kills),
        departureTownId,
        extractionTownId,
        securedItems: readCount(value.securedItems),
        lostItems: readCount(value.lostItems),
        equipmentLost: readCount(value.equipmentLost),
        goldReward: readCount(value.goldReward),
    });
}

function sumItemQuantities(items: readonly { quantity: number }[]): number {
    return items.reduce((total, item) => total + normalizeCount(item.quantity), 0);
}

function isRaidHistoryResult(value: unknown): value is RaidHistoryResult {
    return value === 'SURVIVED' || value === 'DEAD' || value === 'MIA' || value === 'LEFT';
}

function readCount(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? normalizeCount(value) : 0;
}

function normalizeCount(value: number): number {
    return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
}

function normalizeTimestamp(value: number): number {
    return Math.max(0, Math.min(8_640_000_000_000_000, Math.floor(value)));
}

function normalizeRequiredString(value: string, fallback: string): string {
    return normalizeOptionalString(value) ?? fallback;
}

function normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().slice(0, 160);
    return normalized || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
