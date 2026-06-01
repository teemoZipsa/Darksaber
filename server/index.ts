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
    WorldClientMessage,
    WorldServerMessage,
} from '../src/net/WorldProtocol';
import { ServerMarketSession } from './ServerMarketSession';
import { WorldSession, WORLD_TICK_MS } from './WorldSession';

const PORT = Number(process.env.PORT ?? 8765);
const HOST = process.env.HOST;
const ENABLE_DEBUG_COUNTS = process.env.WORLD_DEBUG_COUNTS === '1';
const server = createServer((request, response) => {
    if (request.url === '/healthz') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true, protocol: WORLD_PROTOCOL_VERSION }));
        return;
    }

    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Darksaber world server is running.\n');
});
const wss = new WebSocketServer({ server });
const session = new WorldSession({
    logger: (message) => console.log(`[WorldSession] ${message}`),
});
const marketSession = new ServerMarketSession({
    persistPath: fileURLToPath(new URL('./.runtime/market-state.json', import.meta.url)),
});
const playerBySocket = new Map<WebSocket, string>();
const socketByPlayer = new Map<string, WebSocket>();

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
            const result = session.join(message);
            bindPlayer(ws, result.playerId);
            send(ws, result.welcome);
            send(ws, { type: 'WORLD_SNAPSHOT', snapshot: session.createSnapshot(result.playerId) });
            return;
        }

        if (message.type === 'RECONNECT') {
            const result = session.reconnect(message.resumeToken);
            if (!result) {
                send(ws, { type: 'ERROR', code: 'RESUME_FAILED', message: 'Resume token is expired or unknown.' });
                return;
            }
            bindPlayer(ws, result.playerId);
            send(ws, result.welcome);
            send(ws, { type: 'WORLD_SNAPSHOT', snapshot: session.createSnapshot(result.playerId) });
            return;
        }

        const playerId = playerBySocket.get(ws);
        if (!playerId) {
            send(ws, { type: 'ERROR', code: 'NOT_JOINED', message: 'WORLD_JOIN is required before gameplay messages.' });
            return;
        }

        const result = session.handleMessage(playerId, message);
        for (const reply of result.replies) send(ws, reply);
        for (const broadcast of result.broadcasts) broadcastToActive(broadcast);
        if (message.type === 'WORLD_LEAVE') {
            playerBySocket.delete(ws);
            socketByPlayer.delete(playerId);
        }
    });

    ws.on('close', () => {
        const playerId = playerBySocket.get(ws);
        if (!playerId) return;
        playerBySocket.delete(ws);
        if (socketByPlayer.get(playerId) === ws) socketByPlayer.delete(playerId);
        session.disconnect(playerId);
    });

    ws.on('error', (error) => {
        console.error('World socket error:', error.message);
    });
});

setInterval(() => {
    const now = Date.now();
    const marketUpdate = marketSession.tick(now);
    if (marketUpdate) broadcastToAll(marketUpdate);

    const result = session.tick(now);
    for (const event of result.events) broadcastToActive(event);
    for (const entry of result.perPlayerMessages) {
        const ws = socketByPlayer.get(entry.playerId);
        if (ws) send(ws, entry.message);
    }
    const activePlayerIds = session.getActivePlayerIds();
    for (const playerId of activePlayerIds) {
        const ws = socketByPlayer.get(playerId);
        if (ws) send(ws, { type: 'WORLD_SNAPSHOT', snapshot: session.createSnapshot(playerId, now) });
    }
}, WORLD_TICK_MS);

if (ENABLE_DEBUG_COUNTS) {
    setInterval(() => {
        const counts = session.getDebugCounts();
        console.log(
            `[WorldSession] counts activePlayers=${counts.activePlayers} ghosts=${counts.ghostPlayers} enemies=${counts.enemies} lootLocks=${counts.lootLocks}`
        );
    }, 5_000);
}

function bindPlayer(ws: WebSocket, playerId: string): void {
    const previous = socketByPlayer.get(playerId);
    if (previous && previous !== ws && previous.readyState === WebSocket.OPEN) {
        previous.close();
    }
    playerBySocket.set(ws, playerId);
    socketByPlayer.set(playerId, ws);
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

function sendSerialized(ws: WebSocket, payload: string): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(payload);
}

function broadcastToActive(message: WorldServerMessage): void {
    const payload = JSON.stringify(message);
    for (const playerId of session.getActivePlayerIds()) {
        const ws = socketByPlayer.get(playerId);
        if (ws) sendSerialized(ws, payload);
    }
}

function broadcastToAll(message: WorldServerMessage): void {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
        sendSerialized(client, payload);
    }
}
