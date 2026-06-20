import type { StatusEffect } from '../src/combat/StatusEffects';
import type { CharacterStats } from '../src/data/Stats';
import { getClassLine } from '../src/data/ClassTree';
import type { EnemyAIUnit } from '../src/field/EnemyAI';
import type { TilePoint } from '../src/field/FieldPathing';
import type { Enemy } from '../src/entity/Enemy';
import type {
    ActionRejectedMessage,
    CombatEventMessage,
    GridSnapshot,
    NetFacing,
} from '../src/net/WorldProtocol';
import type { WorldRealm } from '../src/map/BiomeMask';
import type { ServerActor, WorldSessionMessageResult } from './WorldSessionTypes';

export function gridToSnapshot(grid: { width: number; height: number; items: Array<{ item: { id: string }; gridX: number; gridY: number; durability: number; quantity: number; acquiredInRaid?: boolean; sockets?: Array<{ id: string }> }> }): GridSnapshot {
    return {
        width: grid.width,
        height: grid.height,
        items: grid.items.map((placed) => ({
            itemId: placed.item.id,
            gridX: placed.gridX,
            gridY: placed.gridY,
            durability: placed.durability,
            quantity: placed.quantity,
            acquiredInRaid: placed.acquiredInRaid,
            sockets: placed.sockets?.map((item) => item.id),
        })),
    };
}

export function reject(intentId: string, reason: string): WorldSessionMessageResult {
    return {
        replies: [{ type: 'ACTION_REJECTED', intentId, reason } satisfies ActionRejectedMessage],
        broadcasts: [],
    };
}

export function scenarioFlagSnapshot(flagsByDungeonId: Map<string, Set<string>>): Record<string, string[]> {
    const snapshot: Record<string, string[]> = {};
    for (const [dungeonId, flags] of flagsByDungeonId) {
        snapshot[dungeonId] = [...flags].sort();
    }
    return snapshot;
}

export function createActorEvent(
    kind: string,
    source: ServerActor,
    target: ServerActor,
    value?: number,
    statusEffect?: StatusEffect
): CombatEventMessage {
    return {
        type: 'COMBAT_EVENT',
        kind,
        sourceId: source.id,
        targetId: target.id,
        sourceName: source.name,
        targetName: target.name,
        value,
        statusEffect,
    };
}

export function createEnemyEvent(
    kind: string,
    source: ServerActor,
    target: Enemy,
    value?: number,
    statusEffect?: StatusEffect
): CombatEventMessage {
    return {
        type: 'COMBAT_EVENT',
        kind,
        sourceId: source.id,
        targetId: target.id,
        sourceName: source.name,
        targetName: target.name,
        value,
        statusEffect,
    };
}

export function cloneStats(stats: CharacterStats): CharacterStats {
    return { ...stats };
}

export function syncStatsMovementToClass(stats: CharacterStats, classLineId: string): CharacterStats {
    const synced = cloneStats(stats);
    const baseMovRange = getClassLine(classLineId)?.baseMovRange;
    if (baseMovRange !== undefined) synced.mov = baseMovRange;
    return synced;
}

export function cloneStatuses(statuses: StatusEffect[] | undefined): StatusEffect[] {
    return (statuses ?? []).map((status) => ({ ...status }));
}

export function createToken(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function formationOffset(index: number): TilePoint {
    const offsets: TilePoint[] = [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
    ];
    return offsets[index % offsets.length] ?? { x: 0, y: 0 };
}

export function nestStateKey(realm: WorldRealm, chunkX: number, chunkY: number): string {
    return `${realm}:${chunkX}:${chunkY}`;
}

export function chunkOffsetsByDistance(radiusChunks: number): { dx: number; dy: number }[] {
    const offsets: { dx: number; dy: number }[] = [];
    for (let dy = -radiusChunks; dy <= radiusChunks; dy++) {
        for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
            offsets.push({ dx, dy });
        }
    }
    return offsets.sort((a, b) => {
        const da = a.dx * a.dx + a.dy * a.dy;
        const db = b.dx * b.dx + b.dy * b.dy;
        if (da !== db) return da - db;
        if (a.dy !== b.dy) return a.dy - b.dy;
        return a.dx - b.dx;
    });
}

export function storyScenarioGuardOffsets(count: number, hasBoss: boolean): TilePoint[] {
    const offsets: TilePoint[] = hasBoss
        ? [
            { x: 2, y: -1 }, { x: 2, y: 1 }, { x: 3, y: -2 }, { x: 3, y: 2 },
            { x: 1, y: -2 }, { x: 1, y: 2 }, { x: 4, y: -2 }, { x: 4, y: 2 },
            { x: 5, y: -1 }, { x: 5, y: 1 },
        ]
        : [
            { x: 2, y: 0 }, { x: 3, y: -1 }, { x: 3, y: 1 }, { x: 4, y: 0 },
            { x: 2, y: -2 }, { x: 2, y: 2 }, { x: 5, y: -1 }, { x: 5, y: 1 },
            { x: 4, y: -2 }, { x: 4, y: 2 },
        ];
    return offsets.slice(0, Math.max(0, count));
}

export function directionFromTo(from: TilePoint, to: TilePoint): NetFacing {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
}

export function toEnemyAIUnit(enemy: Enemy): EnemyAIUnit {
    return {
        id: enemy.id,
        name: enemy.name,
        tile: { x: enemy.gridX, y: enemy.gridY },
        hp: enemy.stats.hp,
        maxHp: enemy.stats.maxHp,
        role: enemy.role,
        isBoss: enemy.isBoss,
        isAggro: enemy.isAggro,
        statusKinds: enemy.statuses.map((status) => status.kind),
    };
}

export function toActorAIUnit(actor: ServerActor): EnemyAIUnit {
    return {
        id: actor.id,
        name: actor.name,
        tile: actor.tile,
        hp: actor.stats.hp,
        maxHp: actor.stats.maxHp,
        role: 'bruiser',
        statusKinds: actor.statuses.map((status) => status.kind),
    };
}

export function hashInt(value: number): number {
    let h = value | 0;
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return h;
}
