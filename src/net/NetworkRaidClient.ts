import {
    DEFAULT_WORLD_SERVER_URL,
    WORLD_PROTOCOL_VERSION,
    type ActorSnapshot,
    type ActionRejectedMessage,
    type AutoLootCell,
    type AutoLootGrantMessage,
    type CombatEventMessage,
    type InventoryConsumedMessage,
    type InventoryItemCountSnapshot,
    type LootGrantMessage,
    type MarketRecordAckMessage,
    type MarketSnapshotMessage,
    type PlayerIntentKind,
    type RaidResultMessage,
    type ScenarioEnemyDefeatEventMessage,
    type ScenarioFieldEventBroadcastMessage,
    type ScenarioFieldEventRewardResult,
    type ScenarioFieldEventResultMessage,
    type WorldRealmId,
    type WorldClientMessage,
    type WorldErrorMessage,
    type WorldLeaveMessage,
    type WorldServerMessage,
    type WorldSnapshot,
    type WorldWelcomeMessage,
} from './WorldProtocol';

export type NetworkRaidStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface NetworkRaidJoinInput {
    accessToken: string;
    characterId: string;
    originHubId: string;
    partyComposition: ActorSnapshot[];
    carriedWeight?: number;
    carriedItems?: InventoryItemCountSnapshot[];
    resumeToken?: string;
    completedQuestIds?: string[];
    requestedRealm?: WorldRealmId;
    requestedRaidInstanceId?: string;
}

export interface NetworkRaidClientOptions {
    url?: string;
    onSnapshot?: (snapshot: WorldSnapshot) => void;
    onCombatEvent?: (event: CombatEventMessage) => void;
    onLootGrant?: (grant: LootGrantMessage) => void;
    onAutoLootGrant?: (grant: AutoLootGrantMessage) => void;
    onInventoryConsumed?: (message: InventoryConsumedMessage) => void;
    onScenarioFieldEventResult?: (message: ScenarioFieldEventResultMessage) => void;
    onScenarioFieldEventBroadcast?: (message: ScenarioFieldEventBroadcastMessage) => void;
    onScenarioEnemyDefeatEvent?: (message: ScenarioEnemyDefeatEventMessage) => void;
    onRaidResult?: (result: RaidResultMessage) => void;
    onMarketSnapshot?: (message: MarketSnapshotMessage) => void;
    onMarketRecordAck?: (message: MarketRecordAckMessage) => void;
    onActionRejected?: (rejection: ActionRejectedMessage) => void;
    onErrorMessage?: (error: WorldErrorMessage) => void;
    onStatusChange?: (status: NetworkRaidStatus) => void;
    onGraceExpired?: () => void;
}

export class WorldServerError extends Error {
    public constructor(public readonly code: string, message: string) {
        super(`${code}: ${message}`);
    }
}

const RESUME_TOKEN_KEY = 'darksaber_world_resume_token';
const LEGACY_ACCOUNT_ID_KEY = 'darksaber_world_account_id';
const LEGACY_ACCOUNT_SECRET_KEY = 'darksaber_world_account_secret';
const GRACE_MS = 30_000;
const RECONNECT_INTERVAL_MS = 2_000;
export const CLIENT_HEARTBEAT_INTERVAL_MS = 45_000;

export class NetworkRaidClient {
    private readonly url: string;
    private readonly options: NetworkRaidClientOptions;
    private socket: WebSocket | null = null;
    private latestSeq = -1;
    private playerId: string | null = null;
    private resumeToken: string | null = null;
    private resumeTokenCharacterId: string | null = null;
    private manualClose = false;
    private reconnecting = false;
    private reconnectTimer: number | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
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
        this.clearLegacyAccountCredentials();
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

    public updateAccessToken(accessToken: string): void {
        if (!accessToken || !this.joinInput) return;
        this.joinInput = { ...this.joinInput, accessToken };
    }

    public static hasStoredResumeToken(characterId?: string): boolean {
        try {
            return characterId
                ? Boolean(localStorage.getItem(scopedResumeTokenKey(characterId)))
                : Boolean(localStorage.getItem(RESUME_TOKEN_KEY));
        } catch {
            return false;
        }
    }

    public static clearStoredResumeTokens(): void {
        try {
            localStorage.removeItem(RESUME_TOKEN_KEY);
            const scopedPrefix = `${RESUME_TOKEN_KEY}:`;
            for (let i = localStorage.length - 1; i >= 0; i -= 1) {
                const key = localStorage.key(i);
                if (key?.startsWith(scopedPrefix)) localStorage.removeItem(key);
            }
        } catch {
            // Storage may be unavailable in restricted browser contexts.
        }
    }

    public async connectAndJoin(input: NetworkRaidJoinInput): Promise<WorldWelcomeMessage> {
        if (!input.accessToken || !input.characterId) {
            throw new Error('Network join requires an access token and selected character.');
        }
        if (this.pendingWelcome) {
            this.rejectPendingWelcome(new Error('Previous join request was superseded.'));
        }
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
            this.socket.close();
        }

        const inMemoryResumeToken = this.resumeTokenCharacterId === input.characterId ? this.resumeToken : null;
        const resumeToken = input.resumeToken ?? inMemoryResumeToken ?? this.readStoredResumeToken(input.characterId) ?? undefined;

        this.socket = null;
        this.playerId = null;
        this.latestSeq = -1;
        this.sessionEpoch = null;
        this.manualClose = false;
        this.resumeToken = resumeToken ?? null;
        this.resumeTokenCharacterId = resumeToken ? input.characterId : null;
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
            this.startHeartbeat();
            this.sendJoinOrReconnect();
        };
        socket.onmessage = (event) => {
            if (this.socket !== socket) return;
            this.handleMessage(event.data);
        };
        socket.onerror = () => {
            if (this.socket !== socket) return;
            if (this.pendingWelcome) {
                this.rejectPendingWelcome(new Error(`Failed to connect to ${this.url}`));
                this.closeSocketAfterJoinFailure();
            }
        };
        socket.onclose = () => {
            if (this.socket !== socket) return;
            this.stopHeartbeat();
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
            this.send({
                type: 'RECONNECT',
                resumeToken: this.resumeToken,
                accessToken: this.joinInput?.accessToken,
            });
            return;
        }
        const input = this.joinInput;
        if (!input) return;
        this.send({
            type: 'WORLD_JOIN',
            originHubId: input.originHubId,
            partyComposition: input.partyComposition,
            accessToken: input.accessToken,
            characterId: input.characterId,
            carriedWeight: input.carriedWeight,
            carriedItems: input.carriedItems,
            clientVersion: WORLD_PROTOCOL_VERSION,
            resumeToken: input.resumeToken,
            completedQuestIds: input.completedQuestIds,
            requestedRealm: input.requestedRealm,
            requestedRaidInstanceId: input.requestedRaidInstanceId,
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

    public sendScenarioEnter(actorId: string, dungeonId: string, intentId: string = createIntentId()): string {
        this.send({
            type: 'SCENARIO_ENTER',
            intentId,
            actorId,
            dungeonId,
        });
        return intentId;
    }

    public sendScenarioFieldEventInteract(
        actorId: string,
        dungeonId: string,
        eventId: string,
        intentId: string = createIntentId()
    ): string {
        this.send({
            type: 'SCENARIO_FIELD_EVENT_INTERACT',
            intentId,
            actorId,
            dungeonId,
            eventId,
        });
        return intentId;
    }

    public leave(reason: WorldLeaveMessage['reason']): void {
        this.send({ type: 'WORLD_LEAVE', reason });
        this.clearStoredResumeToken(this.joinInput?.characterId);
        this.close();
    }

    public close(): void {
        this.manualClose = true;
        this.clearReconnect();
        this.stopHeartbeat();
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
                this.resumeTokenCharacterId = this.joinInput?.characterId ?? null;
                this.storeResumeToken(message.resumeToken, this.joinInput?.characterId);
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
            case 'INVENTORY_CONSUMED':
                this.options.onInventoryConsumed?.(message);
                break;
            case 'SCENARIO_FIELD_EVENT_RESULT':
                if (!isScenarioFieldEventResultMessage(message)) {
                    this.reportBadMessage('Malformed SCENARIO_FIELD_EVENT_RESULT message.');
                    return;
                }
                this.options.onScenarioFieldEventResult?.(message);
                break;
            case 'SCENARIO_FIELD_EVENT_BROADCAST':
                if (!isScenarioFieldEventBroadcastMessage(message)) {
                    this.reportBadMessage('Malformed SCENARIO_FIELD_EVENT_BROADCAST message.');
                    return;
                }
                this.options.onScenarioFieldEventBroadcast?.(message);
                break;
            case 'SCENARIO_ENEMY_DEFEAT_EVENT':
                if (!isScenarioEnemyDefeatEventMessage(message)) {
                    this.reportBadMessage('Malformed SCENARIO_ENEMY_DEFEAT_EVENT message.');
                    return;
                }
                this.options.onScenarioEnemyDefeatEvent?.(message);
                break;
            case 'RAID_RESULT':
                if (!isRaidResultMessage(message)) {
                    this.reportBadMessage('Malformed RAID_RESULT message.');
                    return;
                }
                this.clearStoredResumeToken(this.joinInput?.characterId);
                this.manualClose = true;
                this.clearReconnect();
                this.stopHeartbeat();
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
            case 'SERVER_HEARTBEAT_ACK':
                break;
            case 'ERROR':
                if (!isWorldErrorMessage(message)) {
                    this.reportBadMessage('Malformed ERROR message.');
                    return;
                }
                {
                    const hadPendingWelcome = this.pendingWelcome !== null;
                    if (hadPendingWelcome) this.rejectPendingWelcome(new WorldServerError(message.code, message.message));
                    if (message.code === 'RESUME_FAILED' || message.code === 'RESUME_RECOVERED') this.expireGrace();
                    else if (hadPendingWelcome) this.closeSocketAfterJoinFailure();
                }
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
        this.clearStoredResumeToken(this.joinInput?.characterId);
        this.stopHeartbeat();
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) this.socket.close();
        this.socket = null;
        this.playerId = null;
        this.setStatus('disconnected');
        if (wasReconnecting) this.options.onGraceExpired?.();
    }

    private closeSocketAfterJoinFailure(): void {
        this.manualClose = true;
        this.clearReconnect();
        this.stopHeartbeat();
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) this.socket.close();
        this.socket = null;
        this.playerId = null;
        this.setStatus('disconnected');
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

    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatTimer = globalThis.setInterval(() => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                this.stopHeartbeat();
                return;
            }
            this.socket.send(JSON.stringify({
                type: 'CLIENT_HEARTBEAT',
                clientTime: Date.now(),
            }));
        }, CLIENT_HEARTBEAT_INTERVAL_MS);
        (this.heartbeatTimer as { unref?: () => void }).unref?.();
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer === null) return;
        globalThis.clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
    }

    private setStatus(status: NetworkRaidStatus): void {
        if (this.status === status) return;
        this.status = status;
        this.options.onStatusChange?.(status);
    }

    private readStoredResumeToken(characterId: string): string | null {
        try {
            localStorage.removeItem(RESUME_TOKEN_KEY);
            return localStorage.getItem(scopedResumeTokenKey(characterId));
        } catch {
            return null;
        }
    }

    private storeResumeToken(token: string, characterId: string | undefined): void {
        if (!characterId) return;
        try {
            localStorage.removeItem(RESUME_TOKEN_KEY);
            localStorage.setItem(scopedResumeTokenKey(characterId), token);
        } catch {
            // Ignore storage failures; reconnect just starts fresh.
        }
    }

    private clearStoredResumeToken(characterId: string | undefined): void {
        this.resumeToken = null;
        this.resumeTokenCharacterId = null;
        try {
            localStorage.removeItem(RESUME_TOKEN_KEY);
            if (characterId) localStorage.removeItem(scopedResumeTokenKey(characterId));
        } catch {
            // Ignore storage failures.
        }
    }

    private clearLegacyAccountCredentials(): void {
        try {
            localStorage.removeItem(LEGACY_ACCOUNT_ID_KEY);
            localStorage.removeItem(LEGACY_ACCOUNT_SECRET_KEY);
        } catch {
            // Ignore storage failures; the legacy account secret must not be recreated.
        }
    }
}

function createIntentId(): string {
    return `intent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function scopedResumeTokenKey(characterId: string): string {
    return `${RESUME_TOKEN_KEY}:${characterId}`;
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
        && typeof message.extractionTownId === 'string'
        && Array.isArray(message.completedDungeonIds);
}

function isWorldErrorMessage(message: unknown): message is WorldErrorMessage {
    if (!isRecord(message)) return false;
    return message.type === 'ERROR'
        && typeof message.code === 'string'
        && typeof message.message === 'string';
}

function isScenarioFieldEventResultMessage(message: unknown): message is ScenarioFieldEventResultMessage {
    if (!isRecord(message)) return false;
    return message.type === 'SCENARIO_FIELD_EVENT_RESULT'
        && typeof message.intentId === 'string'
        && typeof message.dungeonId === 'string'
        && typeof message.eventId === 'string'
        && (message.scope === 'player' || message.scope === 'shared')
        && typeof message.flag === 'string'
        && Array.isArray(message.presentationSteps)
        && Array.isArray(message.rewards)
        && message.rewards.every(isScenarioFieldEventRewardResult)
        && (
            message.trapDamage === undefined
            || (
                isRecord(message.trapDamage)
                && typeof message.trapDamage.actorId === 'string'
                && typeof message.trapDamage.damage === 'number'
                && Number.isInteger(message.trapDamage.damage)
                && message.trapDamage.damage > 0
            )
        );
}

function isScenarioFieldEventRewardResult(value: unknown): value is ScenarioFieldEventRewardResult {
    if (!isRecord(value)) return false;
    if (value.type === 'gold') return typeof value.amount === 'number' && Number.isInteger(value.amount) && value.amount > 0;
    return value.type === 'item'
        && typeof value.itemId === 'string'
        && (
            value.originalItemId === undefined
            || (typeof value.originalItemId === 'number' && Number.isInteger(value.originalItemId) && value.originalItemId > 0)
        );
}

function isScenarioFieldEventBroadcastMessage(message: unknown): message is ScenarioFieldEventBroadcastMessage {
    if (!isRecord(message)) return false;
    return message.type === 'SCENARIO_FIELD_EVENT_BROADCAST'
        && typeof message.dungeonId === 'string'
        && typeof message.eventId === 'string'
        && message.scope === 'shared'
        && typeof message.flag === 'string'
        && Array.isArray(message.presentationSteps);
}

function isScenarioEnemyDefeatEventMessage(message: unknown): message is ScenarioEnemyDefeatEventMessage {
    if (!isRecord(message)) return false;
    return message.type === 'SCENARIO_ENEMY_DEFEAT_EVENT'
        && typeof message.dungeonId === 'string'
        && typeof message.enemyId === 'string'
        && typeof message.eventId === 'string'
        && Array.isArray(message.presentationSteps);
}
