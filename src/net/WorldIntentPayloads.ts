import type { TilePoint } from '../field/FieldPathing';

export interface MoveIntentPayload {
    tile: TilePoint;
    path: TilePoint[];
    apCost: number;
    pathCost: number;
}

export interface AttackIntentPayload {
    targetId: string;
}

export interface InteractIntentPayload {
    lootId: string;
}

export interface UseItemIntentPayload {
    itemId: string;
}

export interface CastSkillIntentPayload {
    skillId: string;
    targetId?: string;
}

export interface EndTurnIntentPayload {
    reason: string;
}

export function createMoveIntentPayload(
    tile: TilePoint,
    path: TilePoint[],
    apCost: number,
    pathCost: number
): MoveIntentPayload {
    return { tile, path, apCost, pathCost };
}

export function createAttackIntentPayload(targetId: string): AttackIntentPayload {
    return { targetId };
}

export function createInteractIntentPayload(lootId: string): InteractIntentPayload {
    return { lootId };
}

export function createUseItemIntentPayload(itemId: string): UseItemIntentPayload {
    return { itemId };
}

export function createCastSkillIntentPayload(skillId: string, targetId?: string): CastSkillIntentPayload {
    return targetId ? { skillId, targetId } : { skillId };
}

export function createEndTurnIntentPayload(reason: string): EndTurnIntentPayload {
    return { reason };
}

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

export function readAttackTargetId(payload: unknown): string | null {
    return readStringPayload(payload, 'targetId') ?? readStringPayload(payload, 'enemyId');
}

export function readSkillTargetId(payload: unknown): string | null {
    return readStringPayload(payload, 'targetId') ?? readStringPayload(payload, 'enemyId');
}
