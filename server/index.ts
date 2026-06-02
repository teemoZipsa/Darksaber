/**
 * Authoritative world PvE WebSocket server.
 *
 * Run with: npm run server
 */

import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { isMarketClientMessage, WORLD_PROTOCOL_VERSION } from '../src/net/WorldProtocol';
import type {
    RaidResultMessage,
    WorldClientMessage,
    WorldRealmId,
    WorldServerMessage,
    WorldWelcomeMessage,
} from '../src/net/WorldProtocol';
import { getStoryQuestByDungeonId } from '../src/data/StoryQuestData';
import { ServerMarketSession } from './ServerMarketSession';
import { WorldSession, WORLD_TICK_MS } from './WorldSession';
import { ServerAccountStore, type ServerAccountRecord } from './ServerAccountStore';

const PORT = Number(process.env.PORT ?? 8765);
const HOST = process.env.HOST;
const ENABLE_DEBUG_COUNTS = process.env.WORLD_DEBUG_COUNTS === '1';
const WORLD_SHARD_COUNT = Math.max(1, Math.floor(Number(process.env.WORLD_SHARD_COUNT ?? 1)));
const server = createServer((request, response) => {
    if (request.url === '/healthz') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true, protocol: WORLD_PROTOCOL_VERSION, shards: WORLD_SHARD_COUNT, sessions: sessions.size }));
        return;
    }

    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Darksaber world server is running.\n');
});
const wss = new WebSocketServer({ server });
const sessions = new Map<string, WorldSession>();
const accountStore = new ServerAccountStore({
    persistPath: fileURLToPath(new URL('./.runtime/accounts.json', import.meta.url)),
});
const marketSession = new ServerMarketSession({
    persistPath: fileURLToPath(new URL('./.runtime/market-state.json', import.meta.url)),
});
interface SocketBinding {
    sessionKey: string;
    playerId: string;
    accountId: string;
}
const playerBySocket = new Map<WebSocket, SocketBinding>();
const socketByPlayer = new Map<string, WebSocket>();
let immediateSnapshotFlushScheduled = false;

server.listen(PORT, HOST, () => {
    const hostLabel = HOST ?? '0.0.0.0';
    console.log(`Darksaber world server started on ws://${hostLabel}:${PORT}`);
});

wss.on('connection', (ws: WebSocket) => {
    ws.on('message', (data: Buffer) => {
        const message = parseMessage(data);
        if (!message) {
            send(ws, { type: 'ERROR', code: 'BAD_JSON', message: 'Invalid JSON message.' });
            return;
        }

        if (isMarketClientMessage(message)) {
            const replies = marketSession.handleMessage(message);
            for (const reply of replies) send(ws, reply);
            return;
        }

        if (message.type === 'WORLD_JOIN') {
            if (playerBySocket.has(ws)) {
                send(ws, { type: 'ERROR', code: 'ALREADY_JOINED', message: 'This connection already joined a raid.' });
                return;
            }
            if (message.clientVersion !== WORLD_PROTOCOL_VERSION) {
                send(ws, { type: 'ERROR', code: 'VERSION_MISMATCH', message: `Unsupported client version: ${message.clientVersion}` });
                return;
            }
            const auth = accountStore.authenticate(message.accountId, message.accountSecret);
            if (!auth.accepted || !auth.account) {
                send(ws, { type: 'ERROR', code: 'AUTH_FAILED', message: auth.reason ?? 'Account authentication failed.' });
                return;
            }
            const realm = normalizeRealm(message.requestedRealm);
            const { sessionKey, session } = getOrCreateSession(realm, auth.account.accountId);
            const serverJoinMessage: WorldJoinMessage = {
                ...message,
                originHubId: auth.account.currentHubTownId || message.originHubId,
                completedQuestIds: auth.account.completedQuestIds,
            };
            const result = session.join(serverJoinMessage, Date.now(), {
                accountId: auth.account.accountId,
                completedQuestIds: auth.account.completedQuestIds,
                shardId: sessionKey,
            });
            bindPlayer(ws, sessionKey, result.playerId, auth.account);
            send(ws, result.welcome);
            send(ws, { type: 'WORLD_SNAPSHOT', snapshot: session.createSnapshot(result.playerId) });
            return;
        }

        if (message.type === 'RECONNECT') {
            const resumed = findReconnectSession(message.resumeToken);
            if (!resumed) {
                send(ws, { type: 'ERROR', code: 'RESUME_FAILED', message: 'Resume token is expired or unknown.' });
                return;
            }
            bindPlayer(ws, resumed.sessionKey, resumed.playerId, resumed.account);
            send(ws, {
                ...resumed.welcome,
                accountId: resumed.account.accountId,
                shardId: resumed.sessionKey,
                completedQuestIds: resumed.account.completedQuestIds,
            });
            send(ws, { type: 'WORLD_SNAPSHOT', snapshot: resumed.session.createSnapshot(resumed.playerId) });
            return;
        }

        const binding = playerBySocket.get(ws);
        if (!binding) {
            send(ws, { type: 'ERROR', code: 'NOT_JOINED', message: 'WORLD_JOIN is required before gameplay messages.' });
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
        if (message.type === 'WORLD_LEAVE') {
            playerBySocket.delete(ws);
            socketByPlayer.delete(socketPlayerKey(binding.sessionKey, binding.playerId));
        }
    });

    ws.on('close', () => {
        const binding = playerBySocket.get(ws);
        if (!binding) return;
        playerBySocket.delete(ws);
        const key = socketPlayerKey(binding.sessionKey, binding.playerId);
        if (socketByPlayer.get(key) === ws) socketByPlayer.delete(key);
        sessions.get(binding.sessionKey)?.disconnect(binding.playerId);
    });

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
        }
    }
    sendSnapshotsToActive(now);
}, WORLD_TICK_MS);

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

function bindPlayer(ws: WebSocket, sessionKey: string, playerId: string, account: ServerAccountRecord): void {
    const key = socketPlayerKey(sessionKey, playerId);
    const previous = socketByPlayer.get(key);
    if (previous && previous !== ws && previous.readyState === WebSocket.OPEN) {
        previous.close();
    }
    playerBySocket.set(ws, { sessionKey, playerId, accountId: account.accountId });
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

function findReconnectSession(resumeToken: string): {
    sessionKey: string;
    session: WorldSession;
    playerId: string;
    account: ServerAccountRecord;
    welcome: WorldWelcomeMessage;
} | null {
    for (const [sessionKey, session] of sessions) {
        const player = session.getPlayerByResumeToken(resumeToken);
        if (!player) continue;
        const account = accountStore.getAccount(player.accountId ?? '');
        if (!account) continue;
        const result = session.reconnect(resumeToken);
        if (!result) return null;
        return { sessionKey, session, playerId: result.playerId, account, welcome: result.welcome };
    }
    return null;
}

function persistRaidResult(binding: SocketBinding, message: WorldServerMessage): void {
    if (message.type !== 'RAID_RESULT') return;
    if (message.result !== 'SURVIVED') return;
    const questIds = completedDungeonIdsToQuestIds(message);
    accountStore.recordRaidSurvival(binding.accountId, questIds, message.extractionTownId);
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

function socketPlayerKey(sessionKey: string, playerId: string): string {
    return `${sessionKey}:${playerId}`;
}

function normalizeRealm(value: unknown): WorldRealmId {
    return value === 'master' ? 'master' : 'mortal';
}

function stableHash(value: string): number {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
