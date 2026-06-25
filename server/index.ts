/**
 * Authoritative world PvE WebSocket server.
 *
 * Run with: npm run server
 */

import 'dotenv/config';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { createBaseStats, type CharacterStats } from '../src/data/Stats';
import { isMarketClientMessage, WORLD_PROTOCOL_VERSION } from '../src/net/WorldProtocol';
import { createRejectedMarketWriteAck, requiresJoinedWorldForMarketMessage } from './MarketSocketPolicy';
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
import { createServerHeartbeatAck } from './WorldHeartbeat';
import { WorldResumeFailedError, WorldSession, WORLD_TICK_MS, type WorldCharacterSavePatch } from './WorldSession';
import { authenticateAccessToken, createAuthHttpHandler } from './AuthHttp';
import { InMemoryAuthStore, PostgresAuthStore, type AccountProgress, type AuthAccount, type AuthCharacter, type AuthStore, type CharacterSave } from './AuthStore';
import type { JwtOptions } from './AuthCrypto';
import { replayWorldSaveSpool, WorldSaveSpool } from './WorldSaveSpool';
import {
    PostgresWorldSessionSnapshotStore,
    WorldSessionSnapshotStore,
    type WorldSessionSnapshotStoreBackend,
} from './WorldSessionSnapshotStore';
import { createWorldSessionKey, resolveWorldSessionRoute, type WorldSessionRoute } from './WorldSessionRouter';
import { createWorldServerMetrics, errorToLogValue, formatWorldServerMetrics, logServerEvent } from './WorldServerObservability';

const PORT = Number(process.env.PORT ?? 8765);
const HOST = process.env.HOST;
const ENABLE_DEBUG_COUNTS = process.env.WORLD_DEBUG_COUNTS === '1';
const WORLD_SHARD_COUNT = Math.max(1, Math.floor(Number(process.env.WORLD_SHARD_COUNT ?? 1)));
if (WORLD_SHARD_COUNT > 1) {
    throw new Error('WORLD_SHARD_COUNT > 1 requires party/raid-instance session keys. Keep WORLD_SHARD_COUNT=1 until multiplayer sharding is implemented.');
}
const MAX_WS_PAYLOAD_BYTES = Math.max(1024, Math.floor(Number(process.env.WORLD_WS_MAX_PAYLOAD_BYTES ?? 64 * 1024)));
const WS_RATE_LIMIT_WINDOW_MS = 10_000;
const WS_RATE_LIMIT_MESSAGES = Math.max(1, Math.floor(Number(process.env.WORLD_WS_RATE_LIMIT ?? 120)));
const WS_IDLE_TIMEOUT_MS = Math.max(10_000, Math.floor(Number(process.env.WORLD_WS_IDLE_TIMEOUT_MS ?? 60_000)));
export const WORLD_SAVE_AUTOSAVE_MS = clampInt(Number(process.env.WORLD_SAVE_AUTOSAVE_MS ?? 90_000), 60_000, 120_000);
export const WORLD_SESSION_SNAPSHOT_MS = clampInt(Number(process.env.WORLD_SESSION_SNAPSHOT_MS ?? 5_000), 1_000, 30_000);
const WORLD_SESSION_LEASE_TTL_MS = clampInt(Number(process.env.WORLD_SESSION_LEASE_TTL_MS ?? 15_000), 5_000, 120_000);
const WORLD_SAVE_RETRY_LIMIT = Math.max(1, Math.floor(Number(process.env.WORLD_SAVE_RETRY_LIMIT ?? 3)));
const WORLD_SAVE_RETRY_BASE_MS = Math.max(100, Math.floor(Number(process.env.WORLD_SAVE_RETRY_BASE_MS ?? 750)));
const WORLD_SHUTDOWN_FLUSH_TIMEOUT_MS = Math.max(1_000, Math.floor(Number(process.env.WORLD_SHUTDOWN_FLUSH_TIMEOUT_MS ?? 8_000)));
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
const metrics = createWorldServerMetrics();
const serverInstanceId = process.env.WORLD_SERVER_INSTANCE_ID?.trim() || randomUUID();
const worldSaveSpool = new WorldSaveSpool({
    persistPath: resolveServerPersistPath(process.env.WORLD_SAVE_SPOOL_PATH, './.runtime/world-save-spool.json'),
});
const worldSessionSnapshotStore = createWorldSessionSnapshotStore();
await worldSessionSnapshotStore.initialize();
const sessions = new Map<string, WorldSession>();
const replayedWorldSaves = await replayWorldSaveSpool(authStore, worldSaveSpool, {
    retryLimit: WORLD_SAVE_RETRY_LIMIT,
    retryBaseMs: WORLD_SAVE_RETRY_BASE_MS,
    logger: (message) => logServerEvent('error', 'world_save_spool_replay_error', { message }),
});
metrics.saveSpoolReplayAppliedTotal = replayedWorldSaves.applied;
metrics.saveSpoolReplayFailedTotal = replayedWorldSaves.failed;
const recoveredResumeTokens = new Set(replayedWorldSaves.recoveredResumeTokens);
if (replayedWorldSaves.applied > 0 || replayedWorldSaves.failed > 0) {
    logServerEvent('info', 'world_save_spool_replay_completed', replayedWorldSaves);
}
const restoredWorldSessions = await restorePersistedWorldSessions();
metrics.sessionSnapshotRestoreAppliedTotal = restoredWorldSessions.applied;
metrics.sessionSnapshotRestoreFailedTotal = restoredWorldSessions.failed;
if (restoredWorldSessions.applied > 0 || restoredWorldSessions.failed > 0) {
    logServerEvent('info', 'world_session_snapshot_restore_completed', restoredWorldSessions);
}
const handleAuthHttpRequest = createAuthHttpHandler({
    store: authStore,
    jwt: jwtOptions,
    allowedOrigins,
    refreshCookieSecure: process.env.AUTH_REFRESH_COOKIE_SECURE !== '0',
    sameSite: parseSameSite(process.env.AUTH_REFRESH_COOKIE_SAMESITE),
    isHubPatchBlocked: (accountId, characterId) => isCharacterInActiveWorldSession(accountId, characterId),
});
const server = createServer(async (request, response) => {
    if (await handleAuthHttpRequest(request, response)) return;

    if (request.url === '/healthz') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true, protocol: WORLD_PROTOCOL_VERSION, authStore: authStoreKind, shards: WORLD_SHARD_COUNT, sessions: sessions.size }));
        return;
    }

    if (request.url === '/metrics') {
        if (!isMetricsRequestAuthorized(request)) {
            response.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Unauthorized');
            return;
        }
        response.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
        response.end(formatWorldServerMetrics(metrics, {
            serverStartedAtMs,
            sessions: sessions.size,
            activePlayers: countActivePlayers(),
            websocketClients: wss.clients.size,
            pendingSaveSpoolEntries: worldSaveSpool.list().length,
            pendingSessionSnapshotEntries: (await worldSessionSnapshotStore.list()).length,
            dirtySaveTrackers: countSaveTrackers((tracker) => tracker.dirty),
            savingSaveTrackers: countSaveTrackers((tracker) => tracker.saving),
        }));
        return;
    }

    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Darksaber world server is running.\n');
});
const wss = new WebSocketServer({ server, maxPayload: MAX_WS_PAYLOAD_BYTES });
const marketSession = new ServerMarketSession({
    persistPath: fileURLToPath(new URL('./.runtime/market-state.json', import.meta.url)),
});
interface SocketBinding {
    sessionKey: string;
    playerId: string;
    accountId: string;
    characterId: string;
    resumeToken: string;
    sessionId: string;
}
interface PlayerSaveTracker {
    sessionKey: string;
    playerId: string;
    accountId: string;
    characterId: string;
    resumeToken: string;
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
const ownedSessionKeys = new Set<string>();
const serverStartedAtMs = Date.now();
let immediateSnapshotFlushScheduled = false;

server.listen(PORT, HOST, () => {
    const hostLabel = HOST ?? '0.0.0.0';
    logServerEvent('info', 'server_started', { host: hostLabel, port: PORT, authStore: authStoreKind, shards: WORLD_SHARD_COUNT });
});

let shutdownStarted = false;
process.once('SIGINT', () => { void shutdownWorldServer('SIGINT'); });
process.once('SIGTERM', () => { void shutdownWorldServer('SIGTERM'); });

wss.on('connection', (ws: WebSocket, request) => {
    metrics.wsConnectionsTotal += 1;
    if (shutdownStarted) {
        send(ws, { type: 'ERROR', code: 'SERVER_SHUTTING_DOWN', message: 'World server is shutting down.' });
        ws.close(1012, 'server shutting down');
        return;
    }
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
            logServerEvent('error', 'ws_message_handler_failed', { error: errorToLogValue(error) });
            send(ws, { type: 'ERROR', code: 'SERVER_ERROR', message: 'World server error.' });
        });
    });

    ws.on('close', () => cleanupSocket(ws));

    ws.on('error', (error) => {
        logServerEvent('error', 'ws_socket_error', { error: errorToLogValue(error) });
    });
});

setInterval(() => {
    const tickStartedAt = Date.now();
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
        if (result.events.length > 0 || result.perPlayerMessages.length > 0) {
            void persistWorldSessionSnapshot(sessionKey, session, 'tick');
        }
    }
    sendSnapshotsToActive(now);
    metrics.worldTickDurationMs = Date.now() - tickStartedAt;
}, WORLD_TICK_MS);

setInterval(() => {
    void persistAllWorldSessionSnapshots('interval');
}, WORLD_SESSION_SNAPSHOT_MS);

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
            logServerEvent('info', 'world_session_debug_counts', { sessionKey, ...counts });
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
        metrics.malformedMessagesTotal += 1;
        logServerEvent('warn', 'ws_message_rejected', { reason: 'bad_json' });
        send(ws, { type: 'ERROR', code: 'BAD_JSON', message: 'Invalid JSON message.' });
        return;
    }

    if (isMarketClientMessage(message)) {
        if (requiresJoinedWorldForMarketMessage(message) && !playerBySocket.has(ws)) {
            send(ws, createRejectedMarketWriteAck(message, marketSession.getSnapshot()));
            return;
        }
        const replies = marketSession.handleMessage(message);
        for (const reply of replies) send(ws, reply);
        return;
    }

    if (message.type === 'CLIENT_HEARTBEAT') {
        send(ws, createServerHeartbeatAck(message.clientTime, playerBySocket.has(ws)));
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
        metrics.authFailuresTotal += 1;
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
    metrics.actionRejectedTotal += countActionRejected(result.replies);
    for (const broadcast of result.broadcasts) broadcastToSession(binding.sessionKey, broadcast);
    if (shouldSendImmediateSnapshots(message, result.replies)) queueImmediateSnapshots(binding.sessionKey);
    consumeSessionSaveDirtyPlayers(binding.sessionKey, session);
    void persistWorldSessionSnapshot(binding.sessionKey, session, message.type);
    if (message.type === 'WORLD_LEAVE') {
        await flushCharacterSave(binding.sessionKey, binding.playerId, 'world_leave', true);
        cleanupJoinedSocket(ws, binding);
    }
}

async function handleWorldJoin(ws: WebSocket, message: WorldJoinMessage): Promise<void> {
    if (shutdownStarted) {
        metrics.rejectedJoinsDuringShutdownTotal += 1;
        send(ws, { type: 'ERROR', code: 'SERVER_SHUTTING_DOWN', message: 'World server is shutting down.' });
        return;
    }
    if (playerBySocket.has(ws)) {
        send(ws, { type: 'ERROR', code: 'ALREADY_JOINED', message: 'This connection already joined a raid.' });
        return;
    }
    if (message.clientVersion !== WORLD_PROTOCOL_VERSION) {
        send(ws, { type: 'ERROR', code: 'VERSION_MISMATCH', message: `Unsupported client version: ${message.clientVersion}` });
        return;
    }
    if (typeof message.accessToken !== 'string' || typeof message.characterId !== 'string') {
        metrics.authFailuresTotal += 1;
        send(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'WORLD_JOIN requires an access token and characterId.' });
        return;
    }
    const auth = await authenticateAccessToken(authStore, message.accessToken, jwtOptions);
    if (!auth) {
        metrics.authFailuresTotal += 1;
        send(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Access token is invalid or expired.' });
        return;
    }
    const [character, save, progress] = await Promise.all([
        authStore.getCharacter(auth.account.id, message.characterId),
        authStore.getCharacterSave(auth.account.id, message.characterId),
        authStore.getAccountProgress(auth.account.id),
    ]);
    if (!character || !save) {
        logServerEvent('warn', 'world_join_denied', { accountId: auth.account.id, characterId: message.characterId });
        send(ws, { type: 'ERROR', code: 'CHARACTER_FORBIDDEN', message: 'Selected character does not belong to this account.' });
        return;
    }

    const realm = normalizeRealm(message.requestedRealm);
    const route = resolveWorldSessionRoute({ realm, requestedRaidInstanceId: message.requestedRaidInstanceId });
    const routed = await getOrCreateSession(route);
    if (!routed) {
        send(ws, { type: 'ERROR', code: 'SESSION_OWNED_ELSEWHERE', message: 'Raid instance is owned by another world server.' });
        return;
    }
    const { sessionKey, session } = routed;
    const serverJoinMessage = buildAuthoritativeJoinMessage(message, character, save, progress);
    let result: ReturnType<WorldSession['join']>;
    try {
        result = session.join(serverJoinMessage, Date.now(), {
            accountId: auth.account.id,
            characterId: character.id,
            completedQuestIds: serverJoinMessage.completedQuestIds,
            shardId: sessionKey,
            saveSnapshot: save,
        });
    } catch (error) {
        if (error instanceof WorldResumeFailedError) {
            metrics.resumeFailuresTotal += 1;
            sendResumeFailure(ws, message.resumeToken, error.message);
            return;
        }
        throw error;
    }
    bindPlayer(ws, sessionKey, result.playerId, auth.account, character.id, result.welcome.resumeToken, auth.session.id);
    ensureSaveTracker(sessionKey, result.playerId, auth.account.id, character.id, result.welcome.resumeToken, save.revision);
    void persistWorldSessionSnapshot(sessionKey, session, 'join');
    send(ws, result.welcome);
    send(ws, { type: 'WORLD_SNAPSHOT', snapshot: session.createSnapshot(result.playerId) });
}

async function handleReconnect(ws: WebSocket, resumeToken: string, accessToken: unknown): Promise<void> {
    if (typeof accessToken !== 'string') {
        metrics.authFailuresTotal += 1;
        send(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'RECONNECT requires an access token.' });
        return;
    }
    const auth = await authenticateAccessToken(authStore, accessToken, jwtOptions);
    if (!auth) {
        metrics.authFailuresTotal += 1;
        send(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: 'Access token is invalid or expired.' });
        return;
    }
    const resumed = findReconnectSession(resumeToken, auth.account.id);
    if (!resumed) {
        metrics.resumeFailuresTotal += 1;
        sendResumeFailure(ws, resumeToken, 'Resume token is expired or unknown.');
        return;
    }
    const [progress, save] = await Promise.all([
        authStore.getAccountProgress(auth.account.id),
        authStore.getCharacterSave(auth.account.id, resumed.characterId),
    ]);
    bindPlayer(ws, resumed.sessionKey, resumed.playerId, auth.account, resumed.characterId, resumed.welcome.resumeToken, auth.session.id);
    if (save) ensureSaveTracker(resumed.sessionKey, resumed.playerId, auth.account.id, resumed.characterId, resumed.welcome.resumeToken, save.revision);
    void persistWorldSessionSnapshot(resumed.sessionKey, resumed.session, 'reconnect');
    send(ws, {
        ...resumed.welcome,
        accountId: auth.account.id,
        shardId: resumed.sessionKey,
        completedQuestIds: progress.completedQuests,
    });
    send(ws, { type: 'WORLD_SNAPSHOT', snapshot: resumed.session.createSnapshot(resumed.playerId) });
}

function bindPlayer(ws: WebSocket, sessionKey: string, playerId: string, account: AuthAccount, characterId: string, resumeToken: string, sessionId: string): void {
    const key = socketPlayerKey(sessionKey, playerId);
    const previous = socketByPlayer.get(key);
    if (previous && previous !== ws && previous.readyState === WebSocket.OPEN) {
        previous.close();
    }
    playerBySocket.set(ws, { sessionKey, playerId, accountId: account.id, characterId, resumeToken, sessionId });
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
        metrics.oversizedPayloadsTotal += 1;
        logServerEvent('warn', 'ws_message_rejected', { reason: 'payload_too_large' });
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
            metrics.rateLimitedSocketsTotal += 1;
            logServerEvent('warn', 'ws_message_rejected', { reason: 'rate_limited', count: state.count, windowMs: WS_RATE_LIMIT_WINDOW_MS });
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

function sendResumeFailure(ws: WebSocket, resumeToken: string | undefined, fallbackMessage: string): void {
    if (resumeToken && recoveredResumeTokens.delete(resumeToken)) {
        send(ws, {
            type: 'ERROR',
            code: 'RESUME_RECOVERED',
            message: 'Previous raid recovery was applied to your character save. Start a new raid to continue.',
        });
        return;
    }
    send(ws, { type: 'ERROR', code: 'RESUME_FAILED', message: fallbackMessage });
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
        && message.type !== 'SCENARIO_FIELD_EVENT_INTERACT'
    ) {
        return false;
    }
    return !replies.some((reply) => reply.type === 'ACTION_REJECTED');
}

function countActionRejected(replies: readonly WorldServerMessage[]): number {
    return replies.reduce((count, reply) => count + (reply.type === 'ACTION_REJECTED' ? 1 : 0), 0);
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

async function getOrCreateSession(route: WorldSessionRoute): Promise<{ sessionKey: string; session: WorldSession } | null> {
    const sessionKey = createWorldSessionKey(route);
    if (!await ensureWorldSessionLease(sessionKey)) return null;
    let session = sessions.get(sessionKey);
    if (!session) {
        session = new WorldSession({
            realm: route.realm,
            logger: (message) => logServerEvent('info', 'world_session_event', { sessionKey, message }),
        });
        sessions.set(sessionKey, session);
    }
    return { sessionKey, session };
}

function createWorldSessionSnapshotStore(): WorldSessionSnapshotStoreBackend {
    if (process.env.DATABASE_URL && process.env.WORLD_SESSION_SNAPSHOT_STORE !== 'file') {
        return new PostgresWorldSessionSnapshotStore({ connectionString: process.env.DATABASE_URL });
    }
    return new WorldSessionSnapshotStore({
        persistPath: resolveServerPersistPath(process.env.WORLD_SESSION_SNAPSHOT_PATH, './.runtime/world-session-snapshots.json'),
    });
}

async function restorePersistedWorldSessions(): Promise<{ applied: number; failed: number }> {
    let applied = 0;
    let failed = 0;
    const now = Date.now();
    for (const entry of await worldSessionSnapshotStore.list()) {
        try {
            if (!await ensureWorldSessionLease(entry.sessionKey)) continue;
            const session = WorldSession.restorePersistentSnapshot(entry.snapshot, {
                logger: (message) => logServerEvent('info', 'world_session_event', { sessionKey: entry.sessionKey, message }),
            });
            session.disconnectActivePlayersForServerRestart(now);
            sessions.set(entry.sessionKey, session);
            await worldSessionSnapshotStore.upsert({
                sessionKey: entry.sessionKey,
                snapshot: session.createPersistentSnapshot(),
                updatedAt: entry.updatedAt,
            });
            applied++;
        } catch (error) {
            failed++;
            await worldSessionSnapshotStore.remove(entry.sessionKey);
            logServerEvent('error', 'world_session_snapshot_restore_failed', {
                sessionKey: entry.sessionKey,
                error: errorToLogValue(error),
            });
        }
    }
    return { applied, failed };
}

async function persistAllWorldSessionSnapshots(reason: string): Promise<void> {
    for (const [sessionKey, session] of sessions) {
        await persistWorldSessionSnapshot(sessionKey, session, reason);
    }
}

async function persistWorldSessionSnapshot(sessionKey: string, session: WorldSession, reason: string): Promise<void> {
    try {
        if (!ownedSessionKeys.has(sessionKey)) return;
        if (!await renewWorldSessionLease(sessionKey)) return;
        const snapshot = session.createPersistentSnapshot();
        if (!snapshot.players.some((player) => player.active)) {
            await worldSessionSnapshotStore.remove(sessionKey);
            await releaseWorldSessionLease(sessionKey);
            return;
        }
        await worldSessionSnapshotStore.upsert({ sessionKey, snapshot });
    } catch (error) {
        metrics.sessionSnapshotSaveFailuresTotal += 1;
        logServerEvent('error', 'world_session_snapshot_save_failed', {
            reason,
            sessionKey,
            error: errorToLogValue(error),
        });
    }
}

async function ensureWorldSessionLease(sessionKey: string): Promise<boolean> {
    if (ownedSessionKeys.has(sessionKey)) return renewWorldSessionLease(sessionKey);
    const acquired = await worldSessionSnapshotStore.acquireLease(sessionKey, serverInstanceId, WORLD_SESSION_LEASE_TTL_MS);
    if (acquired) ownedSessionKeys.add(sessionKey);
    else metrics.sessionLeaseAcquireFailuresTotal += 1;
    return acquired;
}

async function renewWorldSessionLease(sessionKey: string): Promise<boolean> {
    const renewed = await worldSessionSnapshotStore.renewLease(sessionKey, serverInstanceId, WORLD_SESSION_LEASE_TTL_MS);
    if (!renewed) {
        metrics.sessionLeaseLostTotal += 1;
        ownedSessionKeys.delete(sessionKey);
        const session = sessions.get(sessionKey);
        sessions.delete(sessionKey);
        if (session) {
            logServerEvent('warn', 'world_session_lease_lost', { sessionKey, serverInstanceId });
        }
    }
    return renewed;
}

async function releaseWorldSessionLease(sessionKey: string): Promise<void> {
    ownedSessionKeys.delete(sessionKey);
    await worldSessionSnapshotStore.releaseLease(sessionKey, serverInstanceId);
}

async function releaseAllWorldSessionLeases(): Promise<void> {
    await Promise.allSettled([...ownedSessionKeys].map((sessionKey) => releaseWorldSessionLease(sessionKey)));
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
        logServerEvent('error', 'raid_result_persist_failed', {
            accountId: binding.accountId,
            characterId: binding.characterId,
            extractionTownId: message.extractionTownId,
            completedQuestIds: questIds,
            error: errorToLogValue(error),
        });
    });
}

function ensureSaveTracker(sessionKey: string, playerId: string, accountId: string, characterId: string, resumeToken: string, expectedRevision: number): PlayerSaveTracker {
    const key = socketPlayerKey(sessionKey, playerId);
    const existing = saveTrackers.get(key);
    if (existing) {
        existing.accountId = accountId;
        existing.characterId = characterId;
        existing.resumeToken = resumeToken;
        existing.expectedRevision = Math.max(existing.expectedRevision, expectedRevision);
        return existing;
    }
    const tracker: PlayerSaveTracker = {
        sessionKey,
        playerId,
        accountId,
        characterId,
        resumeToken,
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
        if (!tracker) {
            session.markCharacterSaveDirty(playerId);
            continue;
        }
        const patch = session.createRecoveryCharacterSavePatch(playerId);
        if (patch) spoolPendingCharacterSave(tracker, patch, 'dirty_recovery');
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
    const isFinalPatch = Boolean(session?.hasFinalCharacterSavePatch(playerId));
    const patch = session?.createCharacterSavePatch(playerId);
    if (!patch) {
        tracker.dirty = false;
        if (isFinalPatch) worldSaveSpool.remove(key);
        return;
    }

    // Non-final recovery patches stay in the spool; DB autosaves keep raid rewards uncommitted.
    if (isFinalPatch) spoolPendingCharacterSave(tracker, patch, reason);
    tracker.saving = true;
    tracker.dirty = false;
    try {
        const updatedRevision = await updateCharacterSaveWithRetry(tracker, patch);
        tracker.expectedRevision = updatedRevision;
        tracker.lastSavedAt = Date.now();
        if (isFinalPatch) {
            worldSaveSpool.remove(key);
            session?.consumeFinalCharacterSavePatch(playerId);
            saveTrackers.delete(key);
        }
        if (ENABLE_DEBUG_COUNTS) {
            logServerEvent('info', 'character_save_flushed', { reason, sessionKey, playerId, revision: updatedRevision });
        }
    } catch (error) {
        metrics.saveFailuresTotal += 1;
        tracker.dirty = true;
        tracker.lastDirtyAt = Date.now();
        logServerEvent('error', 'character_save_flush_failed', { reason, sessionKey, playerId, error: errorToLogValue(error) });
    } finally {
        tracker.saving = false;
    }
}

function spoolPendingCharacterSave(tracker: PlayerSaveTracker, patch: WorldCharacterSavePatch, reason: string): void {
    try {
        worldSaveSpool.upsert({
            key: socketPlayerKey(tracker.sessionKey, tracker.playerId),
            sessionKey: tracker.sessionKey,
            playerId: tracker.playerId,
            accountId: tracker.accountId,
            characterId: tracker.characterId,
            resumeToken: tracker.resumeToken,
            expectedRevision: tracker.expectedRevision,
            patch,
            reason,
        });
    } catch (error) {
        metrics.saveSpoolFailuresTotal += 1;
        logServerEvent('error', 'world_save_spool_failed', { reason, sessionKey: tracker.sessionKey, playerId: tracker.playerId, error: errorToLogValue(error) });
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
                metrics.saveConflictsTotal += 1;
                logServerEvent('warn', 'character_save_conflict', { playerId: tracker.playerId, accountId: tracker.accountId, characterId: tracker.characterId, currentRevision: result.currentRevision });
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
    const session = sessions.get(binding.sessionKey);
    session?.disconnect(binding.playerId);
    if (session) void persistWorldSessionSnapshot(binding.sessionKey, session, 'socket_close');
}

async function shutdownWorldServer(signal: NodeJS.Signals): Promise<void> {
    if (shutdownStarted) return;
    shutdownStarted = true;
    metrics.shutdownsTotal += 1;
    logServerEvent('info', 'server_shutdown_started', { signal, sessions: sessions.size, sockets: wss.clients.size });
    finishActiveRaidsForShutdown();
    await persistAllWorldSessionSnapshots('shutdown');
    for (const ws of wss.clients) send(ws, { type: 'ERROR', code: 'SERVER_SHUTTING_DOWN', message: 'World server is shutting down.' });
    for (const ws of wss.clients) ws.close(1001, 'server shutting down');
    const flush = flushAllCharacterSaves('shutdown');
    await Promise.race([
        flush,
        sleep(WORLD_SHUTDOWN_FLUSH_TIMEOUT_MS).then(() => {
            logServerEvent('error', 'server_shutdown_flush_timeout', { timeoutMs: WORLD_SHUTDOWN_FLUSH_TIMEOUT_MS });
        }),
    ]);
    await closeServers();
    process.exit(0);
}

function finishActiveRaidsForShutdown(): void {
    for (const [sessionKey, session] of sessions) {
        const result = session.finishActivePlayersForShutdown(Date.now());
        for (const entry of result.perPlayerMessages) {
            metrics.shutdownForcedRaidResultsTotal += 1;
            const ws = socketByPlayer.get(socketPlayerKey(sessionKey, entry.playerId));
            if (ws) send(ws, entry.message);
            const binding = findBinding(sessionKey, entry.playerId);
            if (binding) persistRaidResult(binding, entry.message);
        }
        consumeSessionSaveDirtyPlayers(sessionKey, session);
        if (result.events.length > 0 || result.perPlayerMessages.length > 0) {
            void persistWorldSessionSnapshot(sessionKey, session, 'shutdown_force_extract');
        }
    }
}

async function flushAllCharacterSaves(reason: string): Promise<void> {
    const trackers = [...saveTrackers.values()];
    await Promise.allSettled(
        trackers.map((tracker) => flushCharacterSave(tracker.sessionKey, tracker.playerId, reason, true))
    );
}

async function closeServers(): Promise<void> {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await releaseAllWorldSessionLeases();
    await worldSessionSnapshotStore.close?.();
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
        requestedRaidInstanceId: clientMessage.requestedRaidInstanceId,
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
        'http://localhost:5731',
        'http://127.0.0.1:5731',
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

function resolveServerPersistPath(envPath: string | undefined, fallbackRelative: string): string {
    if (envPath) return isAbsolute(envPath) ? envPath : resolve(process.cwd(), envPath);
    return fileURLToPath(new URL(fallbackRelative, import.meta.url));
}

function countActivePlayers(): number {
    let count = 0;
    for (const session of sessions.values()) count += session.getActivePlayerIds().length;
    return count;
}

function isCharacterInActiveWorldSession(accountId: string, characterId: string): boolean {
    for (const tracker of saveTrackers.values()) {
        if (tracker.accountId === accountId && tracker.characterId === characterId) return true;
    }
    return false;
}

function isMetricsRequestAuthorized(request: import('node:http').IncomingMessage): boolean {
    const requiredToken = process.env.WORLD_METRICS_TOKEN?.trim();
    if (!requiredToken) return process.env.NODE_ENV !== 'production';
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string') return false;
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    return match?.[1] === requiredToken;
}

function countSaveTrackers(predicate: (tracker: PlayerSaveTracker) => boolean): number {
    let count = 0;
    for (const tracker of saveTrackers.values()) {
        if (predicate(tracker)) count++;
    }
    return count;
}
