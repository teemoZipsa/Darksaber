import {
    DEFAULT_WORLD_SERVER_URL,
    WORLD_PROTOCOL_VERSION,
    type ActorSnapshot,
    type ActionRejectedMessage,
    type AutoLootCell,
    type AutoLootGrantMessage,
    type CombatEventMessage,
    type LootGrantMessage,
    type MarketRecordAckMessage,
    type MarketSnapshotMessage,
    type PlayerIntentKind,
    type RaidResultMessage,
    type WorldClientMessage,
    type WorldErrorMessage,
    type WorldLeaveMessage,
    type WorldServerMessage,
    type WorldSnapshot,
    type WorldWelcomeMessage,
} from './WorldProtocol';

export type NetworkRaidStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface NetworkRaidJoinInput {
    originHubId: string;
    partyComposition: ActorSnapshot[];
    resumeToken?: string;
}

export interface NetworkRaidClientOptions {
    url?: string;
    onSnapshot?: (snapshot: WorldSnapshot) => void;
    onCombatEvent?: (event: CombatEventMessage) => void;
    onLootGrant?: (grant: LootGrantMessage) => void;
    onAutoLootGrant?: (grant: AutoLootGrantMessage) => void;
    onRaidResult?: (result: RaidResultMessage) => void;
    onMarketSnapshot?: (message: MarketSnapshotMessage) => void;
    onMarketRecordAck?: (message: MarketRecordAckMessage) => void;
    onActionRejected?: (rejection: ActionRejectedMessage) => void;
    onErrorMessage?: (error: WorldErrorMessage) => void;
    onStatusChange?: (status: NetworkRaidStatus) => void;
    onGraceExpired?: () => void;
}

const RESUME_TOKEN_KEY = 'darksaber_world_resume_token';
const GRACE_MS = 30_000;
const RECONNECT_INTERVAL_MS = 2_000;

export class NetworkRaidClient {
    private readonly url: string;
    private readonly options: NetworkRaidClientOptions;
    private socket: WebSocket | null = null;
    private latestSeq = -1;
    private playerId: string | null = null;
    private resumeToken: string | null = null;
    private manualClose = false;
    private reconnecting = false;
    private reconnectTimer: number | null = null;
    private graceDeadline = 0;
    private joinInput: NetworkRaidJoinInput | null = null;
    private status: NetworkRaidStatus = 'idle';
    private sessionEpoch: number | null = null;
    private pendingWelcome:
        | { resolve: (welcome: WorldWelcomeMessage) => void; reject: (error: Error) => void }
        | null = null;

    constructor(options: NetworkRaidClientOptions = {}) {
        this.url = options.url ?? DEFAULT_WORLD_SERVER_URL;
        this.options = options;
        this.resumeToken = this.readStoredResumeToken();
    }

    public getPlayerId(): string | null {
        return this.playerId;
    }

    public getResumeToken(): string | null {
        return this.resumeToken;
    }

    public getIsOpen(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    public getStatus(): NetworkRaidStatus {
        return this.status;
    }

    public async connectAndJoin(input: NetworkRaidJoinInput): Promise<WorldWelcomeMessage> {
        if (this.pendingWelcome) {
            this.rejectPendingWelcome(new Error('Previous join request was superseded.'));
        }
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
            this.socket.close();
        }

        const resumeToken = input.resumeToken ?? this.resumeToken ?? undefined;

        this.socket = null;
        this.playerId = null;
        this.latestSeq = -1;
        this.sessionEpoch = null;
        this.manualClose = false;
        this.resumeToken = resumeToken ?? null;
        this.joinInput = { ...input, resumeToken };
        this.clearReconnect();
        this.setStatus('connecting');

        const welcomePromise = new Promise<WorldWelcomeMessage>((resolve, reject) => {
            this.pendingWelcome = { resolve, reject };
        });
        this.openSocket();
        return welcomePromise;
    }

    private openSocket(): void {
        if (!this.url) {
            this.rejectPendingWelcome(new Error('World server URL is not configured.'));
            this.setStatus('disconnected');
            return;
        }
        const socket = new WebSocket(this.url);
        this.socket = socket;
        socket.onopen = () => {
            if (this.socket !== socket) return;
            this.sendJoinOrReconnect();
        };
        socket.onmessage = (event) => {
            if (this.socket !== socket) return;
            this.handleMessage(event.data);
        };
        socket.onerror = () => {
            if (this.socket !== socket) return;
            if (this.pendingWelcome) this.rejectPendingWelcome(new Error(`Failed to connect to ${this.url}`));
        };
        socket.onclose = () => {
            if (this.socket !== socket) return;
            this.socket = null;
            if (this.pendingWelcome) {
                this.rejectPendingWelcome(new Error('World server connection closed before welcome.'));
                return;
            }
            // Only auto-reconnect once we have actually joined a session; a close before
            // any welcome is an initial-connect failure the caller already handles.
            if (!this.manualClose && this.playerId) this.scheduleReconnect();
        };
    }

    private sendJoinOrReconnect(): void {
        if (this.reconnecting && this.resumeToken) {
            this.send({ type: 'RECONNECT', resumeToken: this.resumeToken });
            return;
        }
        const input = this.joinInput;
        if (!input) return;
        this.send({
            type: 'WORLD_JOIN',
            originHubId: input.originHubId,
            partyComposition: input.partyComposition,
            clientVersion: WORLD_PROTOCOL_VERSION,
            resumeToken: input.resumeToken,
        });
    }

    public sendIntent(actorId: string, kind: PlayerIntentKind, payload: unknown, intentId: string = createIntentId()): string {
        this.send({
            type: 'PLAYER_INTENT',
            intentId,
            actorId,
            kind,
            payload,
        });
        return intentId;
    }

    public sendLootPickup(lootId: string, gridX: number, gridY: number, intentId: string = createIntentId()): string {
        this.send({
            type: 'LOOT_PICKUP',
            intentId,
            lootId,
            gridX,
            gridY,
        });
        return intentId;
    }

    public sendAutoLootResolve(lootId: string, acceptedCells: AutoLootCell[]): void {
        this.send({
            type: 'AUTO_LOOT_RESOLVE',
            lootId,
            acceptedCells,
        });
    }

    public leave(reason: WorldLeaveMessage['reason']): void {
        this.send({ type: 'WORLD_LEAVE', reason });
        this.close();
    }

    public close(): void {
        this.manualClose = true;
        this.clearReconnect();
        if (this.pendingWelcome) {
            this.rejectPendingWelcome(new Error('Connection closed by client.'));
        }
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) this.socket.close();
        this.socket = null;
        this.playerId = null;
        this.setStatus('disconnected');
    }

    private handleMessage(raw: unknown): void {
        let parsed: unknown;
        try {
            parsed = JSON.parse(String(raw));
        } catch {
            this.options.onErrorMessage?.({ type: 'ERROR', code: 'BAD_JSON', message: 'Invalid server message.' });
            return;
        }
        if (!isRecord(parsed) || typeof parsed.type !== 'string') {
            this.options.onErrorMessage?.({ type: 'ERROR', code: 'BAD_MESSAGE', message: 'Malformed server message.' });
            return;
        }

        const message = parsed as unknown as WorldServerMessage;

        switch (message.type) {
            case 'WORLD_WELCOME':
                if (!isWorldWelcomeMessage(message)) {
                    this.reportBadMessage('Malformed WORLD_WELCOME message.');
                    return;
                }
                if (this.sessionEpoch !== null && this.sessionEpoch !== message.sessionEpoch) {
                    this.latestSeq = -1;
                }
                this.sessionEpoch = message.sessionEpoch;
                this.playerId = message.playerId;
                this.resumeToken = message.resumeToken;
                this.storeResumeToken(message.resumeToken);
                this.clearReconnect();
                this.setStatus('connected');
                this.pendingWelcome?.resolve(message);
                this.pendingWelcome = null;
                break;
            case 'WORLD_SNAPSHOT':
                if (!isWorldSnapshotPayload(message)) {
                    this.reportBadMessage('Malformed WORLD_SNAPSHOT message.');
                    return;
                }
                if (message.snapshot.seq <= this.latestSeq) return;
                this.latestSeq = message.snapshot.seq;
                this.options.onSnapshot?.(message.snapshot);
                break;
            case 'COMBAT_EVENT':
                this.options.onCombatEvent?.(message);
                break;
            case 'LOOT_GRANT':
                this.options.onLootGrant?.(message);
                break;
            case 'AUTO_LOOT_GRANT':
                this.options.onAutoLootGrant?.(message);
                break;
            case 'RAID_RESULT':
                if (!isRaidResultMessage(message)) {
                    this.reportBadMessage('Malformed RAID_RESULT message.');
                    return;
                }
                this.clearStoredResumeToken();
                this.manualClose = true;
                this.clearReconnect();
                this.options.onRaidResult?.(message);
                if (this.socket && this.socket.readyState <= WebSocket.OPEN) this.socket.close();
                this.socket = null;
                this.playerId = null;
                this.setStatus('disconnected');
                break;
            case 'ACTION_REJECTED':
                this.options.onActionRejected?.(message);
                break;
            case 'MARKET_SNAPSHOT':
                this.options.onMarketSnapshot?.(message);
                break;
            case 'MARKET_RECORD_ACK':
                this.options.onMarketRecordAck?.(message);
                break;
            case 'ERROR':
                if (!isWorldErrorMessage(message)) {
                    this.reportBadMessage('Malformed ERROR message.');
                    return;
                }
                if (this.pendingWelcome) this.rejectPendingWelcome(new Error(message.message));
                if (message.code === 'RESUME_FAILED') this.expireGrace();
                this.options.onErrorMessage?.(message);
                break;
        }
    }

    private send(message: WorldClientMessage): boolean {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.options.onErrorMessage?.({
                type: 'ERROR',
                code: 'SOCKET_NOT_OPEN',
                message: 'Cannot send message because the world socket is not open.',
            });
            return false;
        }
        this.socket.send(JSON.stringify(message));
        return true;
    }

    private rejectPendingWelcome(error: Error): void {
        this.pendingWelcome?.reject(error);
        this.pendingWelcome = null;
        this.setStatus('disconnected');
    }

    private scheduleReconnect(): void {
        if (this.manualClose) return;
        if (!this.resumeToken) {
            this.expireGrace();
            return;
        }
        if (this.graceDeadline === 0) this.graceDeadline = Date.now() + GRACE_MS;
        if (Date.now() >= this.graceDeadline) {
            this.expireGrace();
            return;
        }
        this.reconnecting = true;
        this.setStatus('reconnecting');
        if (this.reconnectTimer !== null) return;
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            if (this.manualClose || this.socket) return;
            if (Date.now() >= this.graceDeadline) {
                this.expireGrace();
                return;
            }
            this.openSocket();
        }, RECONNECT_INTERVAL_MS);
    }

    private expireGrace(): void {
        const wasReconnecting = this.reconnecting || this.graceDeadline !== 0;
        this.clearReconnect();
        this.manualClose = true;
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) this.socket.close();
        this.socket = null;
        this.playerId = null;
        this.setStatus('disconnected');
        if (wasReconnecting) this.options.onGraceExpired?.();
    }

    private reportBadMessage(message: string): void {
        this.options.onErrorMessage?.({
            type: 'ERROR',
            code: 'BAD_MESSAGE',
            message,
        });
    }

    private clearReconnect(): void {
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnecting = false;
        this.graceDeadline = 0;
    }

    private setStatus(status: NetworkRaidStatus): void {
        if (this.status === status) return;
        this.status = status;
        this.options.onStatusChange?.(status);
    }

    private readStoredResumeToken(): string | null {
        try {
            return localStorage.getItem(RESUME_TOKEN_KEY);
        } catch {
            return null;
        }
    }

    private storeResumeToken(token: string): void {
        try {
            localStorage.setItem(RESUME_TOKEN_KEY, token);
        } catch {
            // Ignore storage failures; reconnect just starts fresh.
        }
    }

    private clearStoredResumeToken(): void {
        this.resumeToken = null;
        try {
            localStorage.removeItem(RESUME_TOKEN_KEY);
        } catch {
            // Ignore storage failures.
        }
    }
}

function createIntentId(): string {
    return `intent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isWorldWelcomeMessage(message: unknown): message is WorldWelcomeMessage {
    if (!isRecord(message)) return false;
    return message.type === 'WORLD_WELCOME'
        && typeof message.playerId === 'string'
        && typeof message.sessionEpoch === 'number'
        && typeof message.resumeToken === 'string'
        && isRecord(message.spawnTile)
        && typeof message.spawnTile.x === 'number'
        && typeof message.spawnTile.y === 'number';
}

function isWorldSnapshotPayload(message: unknown): message is { type: 'WORLD_SNAPSHOT'; snapshot: WorldSnapshot } {
    if (!isRecord(message)) return false;
    return message.type === 'WORLD_SNAPSHOT'
        && isRecord(message.snapshot)
        && typeof message.snapshot.seq === 'number';
}

function isRaidResultMessage(message: unknown): message is RaidResultMessage {
    if (!isRecord(message)) return false;
    return message.type === 'RAID_RESULT'
        && typeof message.playerId === 'string'
        && typeof message.result === 'string'
        && typeof message.elapsedSeconds === 'number'
        && typeof message.kills === 'number'
        && typeof message.departureTownId === 'string'
        && typeof message.extractionTownId === 'string';
}

function isWorldErrorMessage(message: unknown): message is WorldErrorMessage {
    if (!isRecord(message)) return false;
    return message.type === 'ERROR'
        && typeof message.code === 'string'
        && typeof message.message === 'string';
}
