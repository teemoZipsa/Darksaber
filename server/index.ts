/**
 * Authoritative world PvE WebSocket server.
 *
 * Run with: npm run server
 */

import { WebSocketServer, WebSocket } from 'ws';
import { WORLD_PROTOCOL_VERSION } from '../src/net/WorldProtocol';
import type {
    WorldClientMessage,
    WorldServerMessage,
} from '../src/net/WorldProtocol';
import { WorldSession, WORLD_TICK_MS } from './WorldSession';

const PORT = 8765;
const wss = new WebSocketServer({ port: PORT });
const session = new WorldSession();
const playerBySocket = new Map<WebSocket, string>();
const socketByPlayer = new Map<string, WebSocket>();

console.log(`Darksaber world server started on ws://localhost:${PORT}`);

wss.on('connection', (ws: WebSocket) => {
    ws.on('message', (data: Buffer) => {
        const message = parseMessage(data);
        if (!message) {
            send(ws, { type: 'ERROR', code: 'BAD_JSON', message: 'Invalid JSON message.' });
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
    const result = session.tick(Date.now());
    for (const event of result.events) broadcastToActive(event);
    for (const entry of result.perPlayerMessages) {
        const ws = socketByPlayer.get(entry.playerId);
        if (ws) send(ws, entry.message);
    }
    for (const playerId of session.getActivePlayerIds()) {
        const ws = socketByPlayer.get(playerId);
        if (ws) send(ws, { type: 'WORLD_SNAPSHOT', snapshot: session.createSnapshot(playerId) });
    }
}, WORLD_TICK_MS);

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
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(message));
}

function broadcastToActive(message: WorldServerMessage): void {
    for (const playerId of session.getActivePlayerIds()) {
        const ws = socketByPlayer.get(playerId);
        if (ws) send(ws, message);
    }
}
