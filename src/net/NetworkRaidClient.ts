import {
    DEFAULT_WORLD_SERVER_URL,
    WORLD_PROTOCOL_VERSION,
    type ActorSnapshot,
    type ActionRejectedMessage,
    type CombatEventMessage,
    type LootGrantMessage,
    type PlayerIntentKind,
    type RaidResultMessage,
    type WorldClientMessage,
    type WorldErrorMessage,
    type WorldLeaveMessage,
    type WorldServerMessage,
    type WorldSnapshot,
    type WorldWelcomeMessage,
} from './WorldProtocol';

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
    onRaidResult?: (result: RaidResultMessage) => void;
    onActionRejected?: (rejection: ActionRejectedMessage) => void;
    onErrorMessage?: (error: WorldErrorMessage) => void;
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

    public async connectAndJoin(input: NetworkRaidJoinInput): Promise<WorldWelcomeMessage> {
        this.manualClose = false;
        this.joinInput = input;
        this.clearReconnect();

        const welcomePromise = new Promise<WorldWelcomeMessage>((resolve, reject) => {
            this.pendingWelcome = { resolve, reject };
        });
        this.openSocket();
        return welcomePromise;
    }

    private openSocket(): void {
        const socket = new WebSocket(this.url);
        this.socket = socket;
        socket.onopen = () => this.sendJoinOrReconnect();
        socket.onmessage = (event) => this.handleMessage(event.data);
        socket.onerror = () => {
            if (this.pendingWelcome) this.rejectPendingWelcome(new Error(`Failed to connect to ${this.url}`));
        };
        socket.onclose = () => {
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
        const resumeToken = input.resumeToken ?? this.resumeToken ?? undefined;
        this.send({
            type: 'WORLD_JOIN',
            originHubId: input.originHubId,
            partyComposition: input.partyComposition,
            clientVersion: WORLD_PROTOCOL_VERSION,
            resumeToken,
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

    public leave(reason: WorldLeaveMessage['reason']): void {
        this.send({ type: 'WORLD_LEAVE', reason });
        this.close();
    }

    public close(): void {
        this.manualClose = true;
        this.clearReconnect();
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) this.socket.close();
        this.socket = null;
        this.pendingWelcome = null;
    }

    private handleMessage(raw: unknown): void {
        let message: WorldServerMessage;
        try {
            message = JSON.parse(String(raw)) as WorldServerMessage;
        } catch {
            this.options.onErrorMessage?.({ type: 'ERROR', code: 'BAD_JSON', message: 'Invalid server message.' });
            return;
        }

        switch (message.type) {
            case 'WORLD_WELCOME':
                this.playerId = message.playerId;
                this.resumeToken = message.resumeToken;
                this.storeResumeToken(message.resumeToken);
                this.clearReconnect();
                this.pendingWelcome?.resolve(message);
                this.pendingWelcome = null;
                break;
            case 'WORLD_SNAPSHOT':
                if (message.snapshot.seq < this.latestSeq) return;
                this.latestSeq = message.snapshot.seq;
                this.options.onSnapshot?.(message.snapshot);
                break;
            case 'COMBAT_EVENT':
                this.options.onCombatEvent?.(message);
                break;
            case 'LOOT_GRANT':
                this.options.onLootGrant?.(message);
                break;
            case 'RAID_RESULT':
                this.clearStoredResumeToken();
                this.options.onRaidResult?.(message);
                break;
            case 'ACTION_REJECTED':
                this.options.onActionRejected?.(message);
                break;
            case 'ERROR':
                if (message.code === 'RESUME_FAILED') this.expireGrace();
                this.options.onErrorMessage?.(message);
                break;
        }
    }

    private send(message: WorldClientMessage): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.socket.send(JSON.stringify(message));
    }

    private rejectPendingWelcome(error: Error): void {
        this.pendingWelcome?.reject(error);
        this.pendingWelcome = null;
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
        if (wasReconnecting) this.options.onGraceExpired?.();
    }

    private clearReconnect(): void {
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnecting = false;
        this.graceDeadline = 0;
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
