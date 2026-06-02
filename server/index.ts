/**
 * Authoritative world PvE WebSocket server.
 *
 * Run with: npm run server
 */

import 'dotenv/config';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createBaseStats, type CharacterStats } from '../src/data/Stats';
import { isMarketClientMessage, WORLD_PROTOCOL_VERSION } from '../src/net/WorldProtocol';
import type {
    ActorSnapshot,
    RaidResultMessage,
    WorldClientMessage,
    WorldRealmId,
    WorldJoinMessage,
    WorldServerMessage,
    WorldWelcomeMessage,
} from '../src/net/WorldProtocol';
import { getStoryQuestByDungeonId } from '../src/data/StoryQuestData';
import { ServerMarketSession } from './ServerMarketSession';
import { WorldSession, WORLD_TICK_MS, type WorldCharacterSavePatch } from './WorldSession';
import { authenticateAccessToken, createAuthHttpHandler } from './AuthHttp';
import { InMemoryAuthStore, PostgresAuthStore, type AccountProgress, type AuthAccount, type AuthCharacter, type AuthStore, type CharacterSave } from './AuthStore';
import type { JwtOptions } from './AuthCrypto';

const PORT = Number(process.env.PORT ?? 8765);
const HOST = process.env.HOST;
const ENABLE_DEBUG_COUNTS = process.env.WORLD_DEBUG_COUNTS === '1';
const WORLD_SHARD_COUNT = Math.max(1, Math.floor(Number(process.env.WORLD_SHARD_COUNT ?? 1)));
const MAX_WS_PAYLOAD_BYTES = Math.max(1024, Math.floor(Number(process.env.WORLD_WS_MAX_PAYLOAD_BYTES ?? 64 * 1024)));
const WS_RATE_LIMIT_WINDOW_MS = 10_000;
const WS_RATE_LIMIT_MESSAGES = Math.max(1, Math.floor(Number(process.env.WORLD_WS_RATE_LIMIT ?? 120)));
const WS_IDLE_TIMEOUT_MS = Math.max(10_000, Math.floor(Number(process.env.WORLD_WS_IDLE_TIMEOUT_MS ?? 60_000)));
export const WORLD_SAVE_AUTOSAVE_MS = clampInt(Number(process.env.WORLD_SAVE_AUTOSAVE_MS ?? 90_000), 60_000, 120_000);
const WORLD_SAVE_RETRY_LIMIT = Math.max(1, Math.floor(Number(process.env.WORLD_SAVE_RETRY_LIMIT ?? 3)));
const WORLD_SAVE_RETRY_BASE_MS = Math.max(100, Math.floor(Number(process.env.WORLD_SAVE_RETRY_BASE_MS ?? 750)));
const allowedOrigins = parseAllowedOrigins(process.env.AUTH_ALLOWED_ORIGINS);
const authStoreKind = process.env.DATABASE_URL ? 'postgres' : 'memory';
const jwtSecret = process.env.AUTH_JWT_SECRET ?? process.env.JWT_SECRET ?? (process.env.NODE_ENV === 'production' ? '' : 'darksaber-dev-jwt-secret-change-me');
if (!jwtSecret) throw new Error('AUTH_JWT_SECRET is required when NODE_ENV=production.');
const jwtOptions: JwtOptions = {
    secret: jwtSecret,
    issuer: process.env.AUTH_JWT_ISSUER ?? 'darksaber-world',
    audience: process.env.AUTH_JWT_AUDIENCE ?? 'darksaber-client',
    ttlSeconds: Math.max(60, Math.floor(Number(process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS ?? 900))),
};
const authStore: AuthStore = process.env.DATABASE_URL
    ? new PostgresAuthStore(process.env.DATABASE_URL)
    : new InMemoryAuthStore();
await authStore.initialize();
const handleAuthHttpRequest = createAuthHttpHandler({
    store: authStore,
    jwt: jwtOptions,
    allowedOrigins,
    refreshCookieSecure: process.env.AUTH_REFRESH_COOKIE_SECURE !== '0',
    sameSite: parseSameSite(process.env.AUTH_REFRESH_COOKIE_SAMESITE),
});
const server = createServer(async (request, response) => {
    if (await handleAuthHttpRequest(request, response)) return;

    if (request.url === '/healthz') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true, protocol: WORLD_PROTOCOL_VERSION, authStore: authStoreKind, shards: WORLD_SHARD_COUNT, sessions: sessions.size }));
        return;
    }

    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Darksaber world server is running.\n');
});
const wss = new WebSocketServer({ server, maxPayload: MAX_WS_PAYLOAD_BYTES });
const sessions = new Map<string, WorldSession>();
const marketSession = new ServerMarketSession({
    persistPath: fileURLToPath(new URL('./.runtime/market-state.json', import.meta.url)),
});
interface SocketBinding {
    sessionKey: string;
    playerId: string;
    accountId: string;
    characterId: string;
    sessionId: string;
}
interface PlayerSaveTracker {
    sessionKey: string;
    playerId: string;
    accountId: string;
    characterId: string;
    expectedRevision: number;
    dirty: boolean;
    saving: boolean;
    lastDirtyAt: number;
    lastSavedAt: number;
}
const playerBySocket = new Map<WebSocket, SocketBinding>();
const socketByPlayer = new Map<string, WebSocket>();
const socketRateLimits = new Map<WebSocket, { windowStart: number; count: number; lastMessageAt: number; isAlive: boolean }>();
const saveTrackers = new Map<string, PlayerSaveTracker>();
let immediateSnapshotFlushScheduled = false;

server.listen(PORT, HOST, () => {
    const hostLabel = HOST ?? '0.0.0.0';
    console.log(`Darksaber world server started on ws://${hostLabel}:${PORT}`);
    console.log(`Auth store: ${authStoreKind}`);
});

wss.on('connection', (ws: WebSocket, request) => {
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : null;
    if (!isAllowedWsOrigin(origin)) {
        send(ws, { type: 'ERROR', code: 'ORIGIN_FORBIDDEN', message: 'WebSocket origin is not allowed.' });
        ws.close(1008, 'origin forbidden');
        return;
    }
    if (!isAllowedTransportSecurity(request)) {
        send(ws, { type: 'ERROR', code: 'WSS_REQUIRED', message: 'Secure WebSocket transport is required.' });
        ws.close(1008, 'wss required');
        return;
    }

    socketRateLimits.set(ws, {
        windowStart: Date.now(),
        count: 0,
        lastMessageAt: Date.now(),
        isAlive: true,
    });

    ws.on('pong', () => {
        const state = socketRateLimits.get(ws);
        if (state) {
            state.isAlive = true;
            state.lastMessageAt = Date.now();
        }
    });

    ws.on('message', (data: RawData) => {
        void handleSocketMessage(ws, data).catch((error) => {
            console.error('World socket message error:', error instanceof Error ? error.message : error);
            send(ws, { type: 'ERROR', code: 'SERVER_ERROR', message: 'World server error.' });
        });
    });

    ws.on('close', () => cleanupSocket(ws));

    ws.on('error', (error) => {
        console.error('World socket error:', error.message);
    });
});

setInterval(() => {
    const now = Date.now();
    const marketUpdate = marketSession.tick(now);
    if (marketUpdate) broadcastToAll(marketUpdate);

    for (const [sessionKey, session] of sessions) {
        const result = session.tick(now);
        for (const event of result.events) broadcastToSession(sessionKey, event);
        for (const entry of result.perPlayerMessages) {
            const ws = socketByPlayer.get(socketPlayerKey(sessionKey, entry.playerId));
            if (ws) send(ws, entry.message);
            const binding = findBinding(sessionKey, entry.playerId);
            if (binding) persistRaidResult(binding, entry.message);
            if (entry.message.type === 'RAID_RESULT') {
                void flushCharacterSave(sessionKey, entry.playerId, 'raid_result', true);
            }
        }
        consumeSessionSaveDirtyPlayers(sessionKey, session);
    }
    sendSnapshotsToActive(now);
}, WORLD_TICK_MS);

setInterval(() => {
    const now = Date.now();
    for (const tracker of saveTrackers.values()) {
        if (!tracker.dirty || tracker.saving) continue;
        if (now - tracker.lastDirtyAt < WORLD_SAVE_AUTOSAVE_MS) continue;
        void flushCharacterSave(tracker.sessionKey, tracker.playerId, 'autosave', false);
    }
}, Math.min(30_000, WORLD_SAVE_AUTOSAVE_MS));

if (ENABLE_DEBUG_COUNTS) {
    setInterval(() => {
        for (const [sessionKey, session] of sessions) {
            const counts = session.getDebugCounts();
            console.log(
                `[WorldSession:${sessionKey}] counts activePlayers=${counts.activePlayers} ghosts=${counts.ghostPlayers} enemies=${counts.enemies} lootLocks=${counts.lootLocks}`
            );
        }
    }, 5_000);
}

setInterval(() => {
    const now = Date.now();
    for (const ws of wss.clients) {
        const state = socketRateLimits.get(ws);
        if (!state) continue;
        if (now - state.lastMessageAt > WS_IDLE_TIMEOUT_MS) {
            ws.close(1001, 'idle timeout');
            continue;
        }
        if (!state.isAlive) {
            ws.terminate();
            continue;
        }
        state.isAlive = false;
        ws.ping();
    }
    void closeRevokedSockets(now);
}, Math.min(15_000, Math.max(5_000, Math.floor(WS_IDLE_TIMEOUT_MS / 2))));

async function handleSocketMessage(ws: WebSocket, data: RawData): Promise<void> {
    if (!acceptSocketPayload(ws, data)) return;
    const message = parseMessage(rawDataToBuffer(data));
    if (!message) {
        console.warn('Malformed WebSocket message rejected.');
        send(ws, { type: 'ERROR', code: 'BAD_JSON', message: 'Invalid JSON message.' });
        return;
    }

    if (isMarketClientMessage(message)) {
        const replies = marketSession.handleMessage(message);
        for (const reply of replies) send(ws, reply);
        return;
    }

    if (message.type === 'CLIENT_HEARTBEAT') {
        send(ws, {
            type: 'SERVER_HEARTBEAT_ACK',
            clientTime: Number.isFinite(message.clientTime) ? message.clientTime : 0,
            serverTime: Date.now(),
            joined: playerBySocket.has(ws),
        });
        return;
    }

    if (message.type === 'WORLD_JOIN') {
        await handleWorldJoin(ws, message);
        return;
    }

    if (message.type === 'RECONNECT') {
        await handleReconnect(ws, message.resumeToken, message.accessToken);
        return;
    }

    const binding = playerBySocket.get(ws);
    if (!binding) {
        send(ws, { type: 'ERROR', code: 'NOT_JOINED', message: 'WORLD_JOIN is required before gameplay messages.' });
        return;
    }
    const authSession = await authStore.getSession(binding.sessionId);
    if (!authSession || authSession.revokedAt || Date.parse(authSession.expiresAt) <= Date.now()) {
        send(ws, { type: 'ERROR', code: 'AUTH_REVOKED', message: 'Account session is no longer active.' });
        ws.close(1008, 'auth revoked');
        return;
    }
    const session = sessions.get(binding.sessionKey);
    if (!session) {
        send(ws, { type: 'ERROR', code: 'SESSION_NOT_FOUND', message: 'World session is no longer available.' });
        return;
    }

    const result = session.handleMessage(binding.playerId, message);
    for (const reply of result.replies) {
        send(ws, reply);
        persistRaidResult(binding, reply);
    }
    for (const broadcast of result.broadcasts) broadcastToSession(binding.sessionKey, broadcast);
    if (shouldSendImmediateSnapshots(message, result.replies)) queueImmediateSnapshots(binding.sessionKey);
    consumeSessionSaveDirtyPlayers(binding.sessionKey, session);
    if (message.type === 'WORLD_LEAVE') {
        await flushCharacterSave(binding.sessionKey, binding.playerId, 'world_leave', true);
        cleanupJoinedSocket(ws, binding);
    }
}

async function handleWorldJoin(ws: WebSocket, message: WorldJoinMessage): Promise<void> {
    if (playerBySocket.has(ws)) {
        send(ws, { type: 'ERROR', code: 'ALREADY_JOINED', message: 'This connection already joined a raid.' });
        return;
    }
    if (message.clientVersion !== WORLD_PROTOCOL_VERSION) {
        send(ws, { type: 'ERROR', code: 'VERSION_MISMATCH', message: `Unsupported client version: ${message.clientVersion}` });
        return;
    }
    if (typeof message.accessToken !== 'string' || typeof message.characterId !== 'string') {
        send(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'WORLD_JOIN requires an access token and characterId.' });
        return;
    }
    const auth = await authenticateAccessToken(authStore, message.accessToken, jwtOptions);
    if (!auth) {
        send(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Access token is invalid or expired.' });
        return;
    }
    const [character, save, progress] = await Promise.all([
        authStore.getCharacter(auth.account.id, message.characterId),
        authStore.getCharacterSave(auth.account.id, message.characterId),
        authStore.getAccountProgress(auth.account.id),
    ]);
    if (!character || !save) {
        console.warn(`WORLD_JOIN denied account=${auth.account.id} character=${message.characterId}`);
        send(ws, { type: 'ERROR', code: 'CHARACTER_FORBIDDEN', message: 'Selected character does not belong to this account.' });
        return;
    }

    const realm = normalizeRealm(message.requestedRealm);
    const { sessionKey, session } = getOrCreateSession(realm, auth.account.id);
    const serverJoinMessage = buildAuthoritativeJoinMessage(message, character, save, progress);
    const result = session.join(serverJoinMessage, Date.now(), {
        accountId: auth.account.id,
        characterId: character.id,
        completedQuestIds: serverJoinMessage.completedQuestIds,
        shardId: sessionKey,
        saveSnapshot: save,
    });
    bindPlayer(ws, sessionKey, result.playerId, auth.account, character.id, auth.session.id);
    ensureSaveTracker(sessionKey, result.playerId, auth.account.id, character.id, save.revision);
    send(ws, result.welcome);
    send(ws, { type: 'WORLD_SNAPSHOT', snapshot: session.createSnapshot(result.playerId) });
}

async function handleReconnect(ws: WebSocket, resumeToken: string, accessToken: unknown): Promise<void> {
    if (typeof accessToken !== 'string') {
        send(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'RECONNECT requires an access token.' });
        return;
    }
    const auth = await authenticateAccessToken(authStore, accessToken, jwtOptions);
    if (!auth) {
        send(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Access token is invalid or expired.' });
        return;
    }
    const resumed = findReconnectSession(resumeToken, auth.account.id);
    if (!resumed) {
        send(ws, { type: 'ERROR', code: 'RESUME_FAILED', message: 'Resume token is expired or unknown.' });
        return;
    }
    const [progress, save] = await Promise.all([
        authStore.getAccountProgress(auth.account.id),
        authStore.getCharacterSave(auth.account.id, resumed.characterId),
    ]);
    bindPlayer(ws, resumed.sessionKey, resumed.playerId, auth.account, resumed.characterId, auth.session.id);
    if (save) ensureSaveTracker(resumed.sessionKey, resumed.playerId, auth.account.id, resumed.characterId, save.revision);
    send(ws, {
        ...resumed.welcome,
        accountId: auth.account.id,
        shardId: resumed.sessionKey,
        completedQuestIds: progress.completedQuests,
    });
    send(ws, { type: 'WORLD_SNAPSHOT', snapshot: resumed.session.createSnapshot(resumed.playerId) });
}

function bindPlayer(ws: WebSocket, sessionKey: string, playerId: string, account: AuthAccount, characterId: string, sessionId: string): void {
    const key = socketPlayerKey(sessionKey, playerId);
    const previous = socketByPlayer.get(key);
    if (previous && previous !== ws && previous.readyState === WebSocket.OPEN) {
        previous.close();
    }
    playerBySocket.set(ws, { sessionKey, playerId, accountId: account.id, characterId, sessionId });
    socketByPlayer.set(key, ws);
}

function parseMessage(data: Buffer): WorldClientMessage | null {
    try {
        const parsed = JSON.parse(data.toString()) as WorldClientMessage;
        if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') return null;
        return parsed;
    } catch {
        return null;
    }
}

function acceptSocketPayload(ws: WebSocket, data: RawData): boolean {
    const state = socketRateLimits.get(ws);
    const now = Date.now();
    if (rawDataLength(data) > MAX_WS_PAYLOAD_BYTES) {
        console.warn('Oversized WebSocket payload rejected.');
        send(ws, { type: 'ERROR', code: 'PAYLOAD_TOO_LARGE', message: 'Message payload is too large.' });
        ws.close(1009, 'payload too large');
        return false;
    }
    if (state) {
        if (now - state.windowStart > WS_RATE_LIMIT_WINDOW_MS) {
            state.windowStart = now;
            state.count = 0;
        }
        state.count += 1;
        state.lastMessageAt = now;
        state.isAlive = true;
        if (state.count > WS_RATE_LIMIT_MESSAGES) {
            console.warn('WebSocket rate limit exceeded.');
            send(ws, { type: 'ERROR', code: 'RATE_LIMITED', message: 'Too many messages.' });
            ws.close(1008, 'rate limited');
            return false;
        }
    }
    return true;
}

function rawDataLength(data: RawData): number {
    if (Buffer.isBuffer(data)) return data.length;
    if (Array.isArray(data)) return data.reduce((sum, entry) => sum + entry.length, 0);
    if (data instanceof ArrayBuffer) return data.byteLength;
    return 0;
}

function rawDataToBuffer(data: RawData): Buffer {
    if (Buffer.isBuffer(data)) return data;
    if (Array.isArray(data)) return Buffer.concat(data);
    return Buffer.from(data);
}

function send(ws: WebSocket, message: WorldServerMessage): void {
    sendSerialized(ws, JSON.stringify(message));
}

function queueImmediateSnapshots(sessionKey?: string): void {
    if (immediateSnapshotFlushScheduled) return;
    immediateSnapshotFlushScheduled = true;
    setImmediate(() => {
        immediateSnapshotFlushScheduled = false;
        sendSnapshotsToActive(Date.now(), sessionKey);
    });
}

function sendSnapshotsToActive(now: number, onlySessionKey?: string): void {
    for (const [sessionKey, session] of sessions) {
        if (onlySessionKey && sessionKey !== onlySessionKey) continue;
        for (const playerId of session.getActivePlayerIds()) {
            const ws = socketByPlayer.get(socketPlayerKey(sessionKey, playerId));
            if (ws) send(ws, { type: 'WORLD_SNAPSHOT', snapshot: session.createSnapshot(playerId, now) });
        }
    }
}

function shouldSendImmediateSnapshots(message: WorldClientMessage, replies: readonly WorldServerMessage[]): boolean {
    if (
        message.type !== 'PLAYER_INTENT'
        && message.type !== 'LOOT_PICKUP'
        && message.type !== 'AUTO_LOOT_RESOLVE'
        && message.type !== 'SCENARIO_ENTER'
    ) {
        return false;
    }
    return !replies.some((reply) => reply.type === 'ACTION_REJECTED');
}

function sendSerialized(ws: WebSocket, payload: string): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(payload);
}

function broadcastToSession(sessionKey: string, message: WorldServerMessage): void {
    const payload = JSON.stringify(message);
    const session = sessions.get(sessionKey);
    if (!session) return;
    for (const playerId of session.getActivePlayerIds()) {
        const ws = socketByPlayer.get(socketPlayerKey(sessionKey, playerId));
        if (ws) sendSerialized(ws, payload);
    }
}

function broadcastToAll(message: WorldServerMessage): void {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
        sendSerialized(client, payload);
    }
}

async function closeRevokedSockets(_now: number): Promise<void> {
    for (const [ws, binding] of playerBySocket) {
        const session = await authStore.getSession(binding.sessionId);
        if (session && !session.revokedAt && Date.parse(session.expiresAt) > Date.now()) continue;
        send(ws, { type: 'ERROR', code: 'AUTH_REVOKED', message: 'Account session is no longer active.' });
        ws.close(1008, 'auth revoked');
    }
}

function getOrCreateSession(realm: WorldRealmId, accountId: string): { sessionKey: string; session: WorldSession } {
    const shardIndex = stableHash(accountId) % WORLD_SHARD_COUNT;
    const sessionKey = `${realm}:${shardIndex}`;
    let session = sessions.get(sessionKey);
    if (!session) {
        session = new WorldSession({
            realm,
            logger: (message) => console.log(`[WorldSession:${sessionKey}] ${message}`),
        });
        sessions.set(sessionKey, session);
    }
    return { sessionKey, session };
}

function findReconnectSession(resumeToken: string, accountId: string): {
    sessionKey: string;
    session: WorldSession;
    playerId: string;
    characterId: string;
    welcome: WorldWelcomeMessage;
} | null {
    for (const [sessionKey, session] of sessions) {
        const player = session.getPlayerByResumeToken(resumeToken);
        if (!player) continue;
        if (player.accountId !== accountId || !player.characterId) continue;
        const result = session.reconnect(resumeToken);
        if (!result) return null;
        return { sessionKey, session, playerId: result.playerId, characterId: player.characterId, welcome: result.welcome };
    }
    return null;
}

function persistRaidResult(binding: SocketBinding, message: WorldServerMessage): void {
    if (message.type !== 'RAID_RESULT') return;
    if (message.result !== 'SURVIVED') return;
    const questIds = completedDungeonIdsToQuestIds(message);
    void withRetry(() => authStore.recordRaidSurvival(binding.accountId, binding.characterId, questIds, message.extractionTownId)).catch((error) => {
        console.error('Failed to persist raid result:', error instanceof Error ? error.message : error);
    });
}

function ensureSaveTracker(sessionKey: string, playerId: string, accountId: string, characterId: string, expectedRevision: number): PlayerSaveTracker {
    const key = socketPlayerKey(sessionKey, playerId);
    const existing = saveTrackers.get(key);
    if (existing) {
        existing.accountId = accountId;
        existing.characterId = characterId;
        existing.expectedRevision = Math.max(existing.expectedRevision, expectedRevision);
        return existing;
    }
    const tracker: PlayerSaveTracker = {
        sessionKey,
        playerId,
        accountId,
        characterId,
        expectedRevision,
        dirty: false,
        saving: false,
        lastDirtyAt: 0,
        lastSavedAt: 0,
    };
    saveTrackers.set(key, tracker);
    return tracker;
}

function consumeSessionSaveDirtyPlayers(sessionKey: string, session: WorldSession): void {
    for (const playerId of session.consumeSaveDirtyPlayerIds()) {
        const tracker = saveTrackers.get(socketPlayerKey(sessionKey, playerId));
        if (!tracker) continue;
        tracker.dirty = true;
        tracker.lastDirtyAt = Date.now();
    }
}

async function flushCharacterSave(sessionKey: string, playerId: string, reason: string, force: boolean): Promise<void> {
    const key = socketPlayerKey(sessionKey, playerId);
    const tracker = saveTrackers.get(key);
    if (!tracker || tracker.saving) return;
    if (!force && !tracker.dirty) return;
    const session = sessions.get(sessionKey);
    const patch = session?.createCharacterSavePatch(playerId);
    if (!patch) {
        tracker.dirty = false;
        return;
    }

    tracker.saving = true;
    tracker.dirty = false;
    const isFinalPatch = Boolean(session?.hasFinalCharacterSavePatch(playerId));
    try {
        const updatedRevision = await updateCharacterSaveWithRetry(tracker, patch);
        tracker.expectedRevision = updatedRevision;
        tracker.lastSavedAt = Date.now();
        if (isFinalPatch) {
            session?.consumeFinalCharacterSavePatch(playerId);
            saveTrackers.delete(key);
        }
        if (ENABLE_DEBUG_COUNTS) {
            console.log(`character save flush reason=${reason} player=${playerId} revision=${updatedRevision}`);
        }
    } catch (error) {
        tracker.dirty = true;
        tracker.lastDirtyAt = Date.now();
        console.error(`Failed to flush character save (${reason}):`, error instanceof Error ? error.message : error);
    } finally {
        tracker.saving = false;
    }
}

async function updateCharacterSaveWithRetry(tracker: PlayerSaveTracker, patch: WorldCharacterSavePatch): Promise<number> {
    let expectedRevision = tracker.expectedRevision;
    for (let attempt = 0; attempt < WORLD_SAVE_RETRY_LIMIT; attempt++) {
        try {
            const result = await authStore.updateCharacterSave(tracker.accountId, tracker.characterId, {
                expectedRevision,
                patch,
            });
            if (result.status === 'updated') return result.save.revision;
            if (result.status === 'conflict') {
                expectedRevision = result.currentRevision;
                tracker.expectedRevision = result.currentRevision;
                continue;
            }
            throw new Error('character save was not found');
        } catch (error) {
            if (attempt >= WORLD_SAVE_RETRY_LIMIT - 1) throw error;
            await sleep(WORLD_SAVE_RETRY_BASE_MS * (attempt + 1));
        }
    }
    throw new Error('character save retry limit exhausted');
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < WORLD_SAVE_RETRY_LIMIT; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= WORLD_SAVE_RETRY_LIMIT - 1) throw error;
            await sleep(WORLD_SAVE_RETRY_BASE_MS * (attempt + 1));
        }
    }
    throw new Error('retry limit exhausted');
}

function completedDungeonIdsToQuestIds(message: RaidResultMessage): string[] {
    return message.completedDungeonIds.flatMap((dungeonId) => {
        const quest = getStoryQuestByDungeonId(dungeonId);
        return quest ? [quest.id] : [];
    });
}

function findBinding(sessionKey: string, playerId: string): SocketBinding | null {
    for (const binding of playerBySocket.values()) {
        if (binding.sessionKey === sessionKey && binding.playerId === playerId) return binding;
    }
    return null;
}

function cleanupSocket(ws: WebSocket): void {
    const binding = playerBySocket.get(ws);
    socketRateLimits.delete(ws);
    if (!binding) return;
    void flushCharacterSave(binding.sessionKey, binding.playerId, 'socket_close', true);
    cleanupJoinedSocket(ws, binding);
    sessions.get(binding.sessionKey)?.disconnect(binding.playerId);
}

function cleanupJoinedSocket(ws: WebSocket, binding: SocketBinding): void {
    playerBySocket.delete(ws);
    const key = socketPlayerKey(binding.sessionKey, binding.playerId);
    if (socketByPlayer.get(key) === ws) socketByPlayer.delete(key);
}

function socketPlayerKey(sessionKey: string, playerId: string): string {
    return `${sessionKey}:${playerId}`;
}

function buildAuthoritativeJoinMessage(
    clientMessage: WorldJoinMessage,
    character: AuthCharacter,
    save: CharacterSave,
    progress: AccountProgress
): WorldJoinMessage {
    const completedQuestIds = uniqueStrings([
        ...progress.completedQuests,
        ...readStringArray(save.questState.completedQuestIds),
    ]);
    return {
        type: 'WORLD_JOIN',
        originHubId: readHubTownId(save),
        partyComposition: createPartyCompositionFromSave(character, save),
        clientVersion: clientMessage.clientVersion,
        carriedWeight: 0,
        resumeToken: clientMessage.resumeToken,
        completedQuestIds,
        characterId: character.id,
        requestedRealm: clientMessage.requestedRealm,
        carriedItems: createCarriedItemCountsFromSave(save),
    };
}

function createPartyCompositionFromSave(character: AuthCharacter, save: CharacterSave): ActorSnapshot[] {
    const rosterEntries = readRosterEntries(save);
    const activeIds = readStringArray(save.partySnapshot.activeCharacterIds);
    const selected = activeIds.length > 0
        ? activeIds.flatMap((id) => rosterEntries.get(id) ?? [])
        : [];
    const entries = selected.length > 0
        ? selected
        : [{
            id: character.id,
            name: character.name,
            classKey: character.classKey,
            tier: character.tier,
            level: character.level,
            baseStats: character.baseStats,
        }];

    return entries.slice(0, 3).map((entry) => ({
        id: entry.id,
        localActorId: entry.id,
        name: entry.name,
        classLineId: entry.classKey,
        currentTier: sanitizePositiveInt(entry.tier, 1),
        level: sanitizePositiveInt(entry.level, 1),
        tile: { x: 0, y: 0 },
        stats: createBaseStats(entry.baseStats),
        statuses: [],
        actionGauge: 0,
        remainingAp: 0,
        majorActionUsed: false,
        facing: 'down',
        isDead: false,
    }));
}

function readRosterEntries(save: CharacterSave): Map<string, { id: string; name: string; classKey: string; tier: number; level: number; baseStats: Partial<CharacterStats> }> {
    const rawCharacters = Array.isArray(save.rosterSnapshot.characters) ? save.rosterSnapshot.characters : [];
    const entries = new Map<string, { id: string; name: string; classKey: string; tier: number; level: number; baseStats: Partial<CharacterStats> }>();
    for (const raw of rawCharacters) {
        if (!isRecord(raw)) continue;
        const id = typeof raw.id === 'string' ? raw.id : null;
        const name = typeof raw.name === 'string' ? raw.name : null;
        const classKey = typeof raw.classKey === 'string'
            ? raw.classKey
            : typeof raw.classLineId === 'string'
                ? raw.classLineId
                : null;
        if (!id || !name || !classKey) continue;
        entries.set(id, {
            id,
            name,
            classKey,
            tier: sanitizePositiveInt(raw.tier ?? raw.currentTier, 1),
            level: sanitizePositiveInt(raw.level, 1),
            baseStats: isRecord(raw.baseStats) ? raw.baseStats as Partial<CharacterStats> : {},
        });
    }
    return entries;
}

function createCarriedItemCountsFromSave(save: CharacterSave): Array<{ itemId: string; quantity: number }> {
    const counts = new Map<string, number>();
    for (const item of save.inventory.items) {
        counts.set(item.itemId, (counts.get(item.itemId) ?? 0) + Math.max(1, Math.floor(item.quantity)));
    }
    return [...counts.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
}

function readHubTownId(save: CharacterSave): string {
    return typeof save.hubLocation.townId === 'string' ? save.hubLocation.townId : 'central_castle';
}

function readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function uniqueStrings(values: readonly string[]): string[] {
    return [...new Set(values.filter((value) => value.length > 0))];
}

function sanitizePositiveInt(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeRealm(value: unknown): WorldRealmId {
    return value === 'master' ? 'master' : 'mortal';
}

function isAllowedWsOrigin(origin: string | null): boolean {
    if (!origin) return true;
    return allowedOrigins.includes(origin);
}

function isAllowedTransportSecurity(request: { headers: Record<string, string | string[] | undefined>; socket: unknown }): boolean {
    if (process.env.NODE_ENV !== 'production') return true;
    const forwardedProto = request.headers['x-forwarded-proto'];
    if (typeof forwardedProto === 'string' && forwardedProto.split(',')[0]?.trim() === 'https') return true;
    return typeof request.socket === 'object'
        && request.socket !== null
        && 'encrypted' in request.socket
        && (request.socket as { encrypted?: boolean }).encrypted === true;
}

function parseAllowedOrigins(value: string | undefined): string[] {
    const configured = value
        ?.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
    if (configured && configured.length > 0) return configured;
    return [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:4173',
        'http://127.0.0.1:4173',
    ];
}

function parseSameSite(value: string | undefined): 'Lax' | 'Strict' | 'None' {
    if (value === 'Strict' || value === 'None') return value;
    return 'Lax';
}

function clampInt(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, Math.floor(value)));
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableHash(value: string): number {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
