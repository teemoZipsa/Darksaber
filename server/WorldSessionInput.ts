import { getClassLine } from '../src/data/ClassTree';
import { getItemDef } from '../src/data/ItemDB';
import type { TilePoint } from '../src/field/FieldPathing';
import type { ActorSnapshot } from '../src/net/WorldProtocol';

export function readTilePayload(payload: unknown): TilePoint | null {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const tile = (record.tile ?? record.targetTile) as Record<string, unknown> | undefined;
    if (!tile || typeof tile.x !== 'number' || typeof tile.y !== 'number') return null;
    return { x: Math.floor(tile.x), y: Math.floor(tile.y) };
}

export function readStringPayload(payload: unknown, key: string): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const value = (payload as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
}

export function sanitizeCarriedWeight(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.round(value * 10) / 10);
}

export function sanitizeCarriedItems(value: unknown): Map<string, number> {
    const items = new Map<string, number>();
    if (!Array.isArray(value)) return items;
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const record = entry as Record<string, unknown>;
        const itemId = typeof record.itemId === 'string' ? record.itemId.trim() : '';
        if (!itemId || !getItemDef(itemId)) continue;
        const quantity = typeof record.quantity === 'number' && Number.isFinite(record.quantity)
            ? Math.floor(record.quantity)
            : 0;
        if (quantity <= 0) continue;
        items.set(itemId, Math.min(999, (items.get(itemId) ?? 0) + quantity));
    }
    return items;
}

export function sanitizeTier(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(10, Math.floor(value)));
}

export function sanitizeStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : [];
}

export function createFallbackActorSnapshot(): ActorSnapshot {
    return {
        id: 'fallback_actor',
        name: 'Adventurer',
        classLineId: 'infantry',
        currentTier: 1,
        level: 1,
        tile: { x: 0, y: 0 },
        stats: {
            hp: 100,
            maxHp: 100,
            mp: 30,
            maxMp: 30,
            atk: 10,
            def: 5,
            magAtk: 5,
            magDef: 3,
            spd: 5,
            mov: getClassLine('infantry')?.baseMovRange ?? 5,
            hitRate: 80,
            critRate: 5,
            actionLimit: 15,
            evasion: 10,
            magHit: 80,
            magEva: 5,
            cmdRange: 6,
            atkMod: 0,
            defMod: 0,
        },
        statuses: [],
        actionGauge: 0,
        remainingAp: 0,
        majorActionUsed: false,
        facing: 'down',
        isDead: false,
    };
}
