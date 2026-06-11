import { NetworkRaidClient, type NetworkRaidStatus } from '../../net/NetworkRaidClient';
import type { PlayerIntentKind } from '../../net/WorldProtocol';

export type NetworkRaidCloseReason = 'town' | 'wipe' | 'manual';

export class NetworkRaidState {
    private client: NetworkRaidClient | null = null;
    private active = false;
    private connecting = false;
    private playerIdValue: string | null = null;
    private wasReconnecting = false;
    private readonly enteredDungeonIds = new Set<string>();

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
}
