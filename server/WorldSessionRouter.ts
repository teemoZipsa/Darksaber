import type { WorldRealmId } from '../src/net/WorldProtocol';

export const DEFAULT_WORLD_RAID_INSTANCE_ID = 'primary';
const RAID_INSTANCE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export interface WorldSessionRoute {
    realm: WorldRealmId;
    raidInstanceId: string;
}

export function resolveWorldSessionRoute(input: { realm: WorldRealmId; requestedRaidInstanceId?: unknown }): WorldSessionRoute {
    return {
        realm: input.realm,
        raidInstanceId: normalizeRaidInstanceId(input.requestedRaidInstanceId),
    };
}

export function createWorldSessionKey(route: WorldSessionRoute): string {
    if (route.raidInstanceId === DEFAULT_WORLD_RAID_INSTANCE_ID) return `${route.realm}:primary`;
    return `${route.realm}:raid:${route.raidInstanceId}`;
}

export function normalizeRaidInstanceId(value: unknown): string {
    if (typeof value !== 'string') return DEFAULT_WORLD_RAID_INSTANCE_ID;
    const normalized = value.trim().toLowerCase();
    if (!RAID_INSTANCE_ID_PATTERN.test(normalized)) return DEFAULT_WORLD_RAID_INSTANCE_ID;
    return normalized;
}
