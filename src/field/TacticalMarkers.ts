import type { TilePoint } from './FieldPathing';

export type TacticalTargetKind = 'ground' | 'blocked' | 'enemy' | 'loot' | 'party';
export type TacticalCommand = 'ping' | 'rally' | 'watch' | 'clear';
export type TacticalMarkerKind = 'ping' | 'rally' | 'watch';

export interface TacticalTargetRef {
    kind: TacticalTargetKind;
    tile: TilePoint;
    targetKey?: string;
}

export interface TacticalMenuItem {
    command: TacticalCommand;
    labelKey: string;
}

export interface TacticalMarker {
    id: string;
    kind: TacticalMarkerKind;
    tile: TilePoint;
    ttl: number;
    targetKind: TacticalTargetKind;
    targetKey?: string;
}

export const PING_TTL_SECONDS = 3;
export const TACTICAL_MARK_TTL_SECONDS = 30;

const PING_LABELS: Record<TacticalTargetKind, string> = {
    ground: 'tactical.ping.position',
    blocked: 'tactical.ping.position',
    enemy: 'tactical.ping.danger',
    loot: 'tactical.ping.loot',
    party: 'tactical.ping.party',
};

export function buildTacticalMenuItems(target: TacticalTargetRef): TacticalMenuItem[] {
    const items: TacticalMenuItem[] = [
        { command: 'ping', labelKey: PING_LABELS[target.kind] },
    ];

    if (target.kind === 'ground') {
        items.push({ command: 'rally', labelKey: 'tactical.rally' });
    }

    if (target.targetKey) {
        items.push({ command: 'watch', labelKey: 'tactical.watch' });
    }

    items.push({ command: 'clear', labelKey: 'tactical.clear' });
    return items;
}

export function makeTacticalTargetKey(kind: Exclude<TacticalTargetKind, 'ground' | 'blocked'>, id: string): string {
    return `${kind}:${id}`;
}

export class TacticalMarkerStore {
    private pings: TacticalMarker[] = [];
    private rally: TacticalMarker | null = null;
    private watches: Map<string, TacticalMarker> = new Map();
    private nextId = 1;

    public addPing(target: TacticalTargetRef): TacticalMarker {
        const marker = this.createMarker('ping', target, PING_TTL_SECONDS);
        this.pings.push(marker);
        return marker;
    }

    public setRally(tile: TilePoint): TacticalMarker {
        const marker = this.createMarker('rally', { kind: 'ground', tile }, TACTICAL_MARK_TTL_SECONDS);
        this.rally = marker;
        return marker;
    }

    public setWatch(target: TacticalTargetRef): TacticalMarker | null {
        if (!target.targetKey) return null;
        const marker = this.createMarker('watch', target, TACTICAL_MARK_TTL_SECONDS);
        this.watches.set(target.targetKey, marker);
        return marker;
    }

    public clear(target: TacticalTargetRef): number {
        let removed = 0;
        const beforePings = this.pings.length;
        this.pings = this.pings.filter((marker) => !sameTile(marker.tile, target.tile));
        removed += beforePings - this.pings.length;

        if (target.targetKey && this.watches.delete(target.targetKey)) {
            removed += 1;
        }

        if ((target.kind === 'ground' || target.kind === 'blocked') && this.rally && sameTile(this.rally.tile, target.tile)) {
            this.rally = null;
            removed += 1;
        }

        return removed;
    }

    public update(dt: number, resolveTargetTile?: (targetKey: string) => TilePoint | null): void {
        this.pings = this.pings
            .map((marker) => decrementMarker(marker, dt))
            .filter((marker) => marker.ttl > 0);

        if (this.rally) {
            this.rally = decrementMarker(this.rally, dt);
            if (this.rally.ttl <= 0) this.rally = null;
        }

        for (const [key, marker] of this.watches) {
            if (resolveTargetTile) {
                const tile = resolveTargetTile(key);
                if (!tile) {
                    this.watches.delete(key);
                    continue;
                }
                marker.tile = { ...tile };
            }

            marker.ttl -= dt;
            if (marker.ttl <= 0) this.watches.delete(key);
        }
    }

    public getMarkers(): TacticalMarker[] {
        return [
            ...this.pings,
            ...(this.rally ? [this.rally] : []),
            ...this.watches.values(),
        ];
    }

    private createMarker(kind: TacticalMarkerKind, target: TacticalTargetRef, ttl: number): TacticalMarker {
        return {
            id: `${kind}-${this.nextId++}`,
            kind,
            tile: { ...target.tile },
            ttl,
            targetKind: target.kind,
            targetKey: target.targetKey,
        };
    }
}

function decrementMarker(marker: TacticalMarker, dt: number): TacticalMarker {
    marker.ttl -= dt;
    return marker;
}

function sameTile(a: TilePoint, b: TilePoint): boolean {
    return a.x === b.x && a.y === b.y;
}
