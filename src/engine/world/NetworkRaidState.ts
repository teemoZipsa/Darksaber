import { NetworkRaidClient, type NetworkRaidStatus } from '../../net/NetworkRaidClient';
import type { TilePoint } from '../../field/FieldPathing';
import type { PlayerIntentKind } from '../../net/WorldProtocol';

export type NetworkRaidCloseReason = 'town' | 'wipe' | 'manual';

export interface PendingNetworkMoveReopen {
    intentId: string;
    actorId: string;
    tile: TilePoint;
}

export interface NetworkMovePathPreview {
    actorId: string;
    target: TilePoint;
    path: TilePoint[];
}

export interface NetworkMovePreviewActor {
    id: string;
    tile: TilePoint;
    isMoving: boolean;
    hasReachedTile(tile: TilePoint): boolean;
}

export class NetworkRaidState {
    private client: NetworkRaidClient | null = null;
    private active = false;
    private connecting = false;
    private playerIdValue: string | null = null;
    private wasReconnecting = false;
    private readonly enteredDungeonIds = new Set<string>();
    private pendingMoveReopen: PendingNetworkMoveReopen | null = null;
    private movePathPreview: NetworkMovePathPreview | null = null;

    public getClient(): NetworkRaidClient | null {
        return this.client;
    }

    public setClient(client: NetworkRaidClient): void {
        this.client = client;
    }

    public isActive(): boolean {
        return this.active;
    }

    public isConnecting(): boolean {
        return this.connecting;
    }

    public setConnecting(connecting: boolean): void {
        this.connecting = connecting;
    }

    public playerId(): string | null {
        return this.playerIdValue;
    }

    public activate(playerId: string): void {
        this.active = true;
        this.playerIdValue = playerId;
    }

    public deactivate(): void {
        this.active = false;
        this.playerIdValue = null;
    }

    public clearScenarioEntries(): void {
        this.enteredDungeonIds.clear();
    }

    public markScenarioEntered(dungeonId: string): boolean {
        if (this.enteredDungeonIds.has(dungeonId)) return false;
        this.enteredDungeonIds.add(dungeonId);
        return true;
    }

    public sendIntent(
        actorId: string,
        kind: PlayerIntentKind,
        payload: unknown,
        options: { requireOpen?: boolean } = {}
    ): string | null {
        const client = this.intentClient(options.requireOpen ?? true);
        return client ? client.sendIntent(actorId, kind, payload) : null;
    }

    public registerPendingMove(intentId: string, actorId: string, tile: TilePoint, path: TilePoint[]): void {
        this.pendingMoveReopen = { intentId, actorId, tile: { ...tile } };
        this.movePathPreview = {
            actorId,
            target: { ...tile },
            path: path.map((step) => ({ ...step })),
        };
    }

    public consumeRejectedMoveActorId(intentId: string): string | null {
        if (this.pendingMoveReopen?.intentId !== intentId) return null;
        const actorId = this.pendingMoveReopen.actorId;
        this.pendingMoveReopen = null;
        this.clearMovePathPreview(actorId);
        return actorId;
    }

    public getPathPreviewTiles(actorId: string, fallbackPath: TilePoint[]): TilePoint[] {
        return this.movePathPreview?.actorId === actorId ? this.movePathPreview.path : fallbackPath;
    }

    public refreshMovePathPreview(resolveActor: (actorId: string) => NetworkMovePreviewActor | null): void {
        const preview = this.movePathPreview;
        if (!preview) return;
        const actor = resolveActor(preview.actorId);
        if (!actor) {
            this.movePathPreview = null;
            return;
        }

        while (preview.path.length > 0 && actor.hasReachedTile(preview.path[0])) {
            preview.path.shift();
        }
        if (preview.path.length === 0) {
            this.movePathPreview = null;
            return;
        }

        const pendingMatches = this.pendingMoveReopen?.actorId === preview.actorId
            && this.pendingMoveReopen.tile.x === preview.target.x
            && this.pendingMoveReopen.tile.y === preview.target.y;
        const atTarget = actor.tile.x === preview.target.x && actor.tile.y === preview.target.y;

        if (atTarget && !actor.isMoving) {
            this.movePathPreview = null;
            return;
        }
        if (!pendingMatches && !atTarget) this.movePathPreview = null;
    }

    public consumePendingMoveReopen(ownActorIdsAtTiles: Set<string>): PendingNetworkMoveReopen | null {
        const pending = this.pendingMoveReopen;
        if (!pending) return null;
        if (!ownActorIdsAtTiles.has(this.pendingMoveKey(pending.actorId, pending.tile))) return null;
        this.pendingMoveReopen = null;
        return pending;
    }

    public clearPendingMoveReopen(actorId: string): void {
        if (this.pendingMoveReopen?.actorId === actorId) this.pendingMoveReopen = null;
    }

    private clearMovePathPreview(actorId: string | null): void {
        if (!actorId || this.movePathPreview?.actorId === actorId) this.movePathPreview = null;
    }

    public closeClient(sendLeave: boolean, reason: NetworkRaidCloseReason = 'manual'): void {
        if (!this.client) return;
        if (sendLeave) this.client.leave(reason);
        else this.client.close();
        this.client = null;
    }

    public statusWasReconnecting(status: NetworkRaidStatus): boolean {
        if (status === 'connected') {
            const restored = this.wasReconnecting;
            this.wasReconnecting = false;
            return restored;
        }
        if (status === 'reconnecting') this.wasReconnecting = true;
        if (status === 'disconnected') this.wasReconnecting = false;
        return false;
    }

    private intentClient(requireOpen: boolean): NetworkRaidClient | null {
        if (!this.active || !this.client) return null;
        if (requireOpen && !this.client.getIsOpen()) return null;
        return this.client;
    }

    private pendingMoveKey(actorId: string, tile: TilePoint): string {
        return `${actorId}:${tile.x},${tile.y}`;
    }
}
