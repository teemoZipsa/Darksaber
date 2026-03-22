/**
 * Darksaber Multiplayer WebSocket Server
 * Simple room-based server: all connected clients share the same world.
 * Broadcasts player movements, combat events, and boss kills.
 *
 * Run with: npx tsx server/index.ts
 */

import { WebSocketServer, WebSocket } from 'ws';

interface PlayerData {
    id: string;
    name: string;
    x: number;
    y: number;
    ws: WebSocket;
}

const PORT = 8765;
const wss = new WebSocketServer({ port: PORT });
const players: Map<string, PlayerData> = new Map();
let nextId = 1;

console.log(`🌐 Darksaber Multiplayer Server started on ws://localhost:${PORT}`);

wss.on('connection', (ws: WebSocket) => {
    const playerId = `player_${nextId++}`;
    let playerData: PlayerData | null = null;

    ws.on('message', (data: Buffer) => {
        try {
            const msg = JSON.parse(data.toString());

            switch (msg.type) {
                case 'PLAYER_JOIN': {
                    playerData = {
                        id: playerId,
                        name: msg.playerName || `Player ${nextId}`,
                        x: 0,
                        y: 0,
                        ws,
                    };
                    players.set(playerId, playerData);

                    // Send WELCOME to the new player with existing players list
                    const existingPlayers = Array.from(players.values())
                        .filter(p => p.id !== playerId)
                        .map(p => ({ id: p.id, name: p.name, x: p.x, y: p.y }));

                    ws.send(JSON.stringify({
                        type: 'WELCOME',
                        playerId,
                        players: existingPlayers,
                    }));

                    // Broadcast PLAYER_JOIN to all others
                    broadcast({
                        type: 'PLAYER_JOIN',
                        playerId,
                        playerName: playerData.name,
                        x: 0,
                        y: 0,
                    }, playerId);

                    console.log(`✅ ${playerData.name} (${playerId}) joined. Total: ${players.size}`);
                    break;
                }

                case 'PLAYER_MOVE': {
                    if (playerData) {
                        playerData.x = msg.x ?? 0;
                        playerData.y = msg.y ?? 0;

                        broadcast({
                            type: 'PLAYER_MOVE',
                            playerId,
                            x: playerData.x,
                            y: playerData.y,
                        }, playerId);
                    }
                    break;
                }

                case 'PLAYER_ATTACK': {
                    broadcast({
                        type: 'PLAYER_ATTACK',
                        playerId,
                        enemyId: msg.enemyId,
                    }, playerId);
                    break;
                }

                case 'BOSS_KILLED': {
                    broadcast({
                        type: 'BOSS_KILLED',
                        playerId,
                        enemyId: msg.enemyId,
                    }, playerId);
                    break;
                }
            }
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    });

    ws.on('close', () => {
        if (playerData) {
            console.log(`❌ ${playerData.name} (${playerId}) left. Total: ${players.size - 1}`);
            players.delete(playerId);

            broadcast({
                type: 'PLAYER_LEAVE',
                playerId,
            });
        }
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for ${playerId}:`, error.message);
    });
});

function broadcast(msg: object, excludeId?: string): void {
    const data = JSON.stringify(msg);
    for (const [id, player] of players) {
        if (id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(data);
        }
    }
}
