/**
 * NetworkManager — Client-side WebSocket manager for multiplayer.
 * Handles connection, message sending/receiving, and auto-reconnect.
 */

export type MessageType =
    | 'PLAYER_JOIN'
    | 'PLAYER_MOVE'
    | 'PLAYER_LEAVE'
    | 'PLAYER_ATTACK'
    | 'BOSS_KILLED'
    | 'WELCOME'
    | 'CHAT';

export interface NetworkMessage {
    type: MessageType;
    playerId?: string;
    playerName?: string;
    x?: number;
    y?: number;
    enemyId?: string;
    message?: string;
    players?: Array<{ id: string; name: string; x: number; y: number }>;
}

export type NetworkCallback = (msg: NetworkMessage) => void;

export class NetworkManager {
    private ws: WebSocket | null = null;
    private url: string = '';
    private playerName: string = '';
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private _connected: boolean = false;
    private _connecting: boolean = false;

    // Event callbacks
    public onPlayerJoin: NetworkCallback | null = null;
    public onPlayerMove: NetworkCallback | null = null;
    public onPlayerLeave: NetworkCallback | null = null;
    public onPlayerAttack: NetworkCallback | null = null;
    public onBossKilled: NetworkCallback | null = null;
    public onWelcome: NetworkCallback | null = null;
    public onConnectionChange: ((connected: boolean) => void) | null = null;

    public get connected(): boolean { return this._connected; }
    public get connecting(): boolean { return this._connecting; }

    public connect(url: string, playerName: string): void {
        if (this.ws) this.disconnect();

        this.url = url;
        this.playerName = playerName;
        this._connecting = true;

        try {
            this.ws = new WebSocket(url);
        } catch (e) {
            console.error('WebSocket connection failed:', e);
            this._connecting = false;
            return;
        }

        this.ws.onopen = () => {
            this._connected = true;
            this._connecting = false;
            console.log('🌐 Connected to server');

            // Send join message
            this.send({
                type: 'PLAYER_JOIN',
                playerName: this.playerName,
            });

            if (this.onConnectionChange) this.onConnectionChange(true);
        };

        this.ws.onmessage = (event) => {
            try {
                const msg: NetworkMessage = JSON.parse(event.data);
                this.handleMessage(msg);
            } catch (e) {
                console.error('Failed to parse network message:', e);
            }
        };

        this.ws.onclose = () => {
            this._connected = false;
            this._connecting = false;
            console.log('🌐 Disconnected from server');
            if (this.onConnectionChange) this.onConnectionChange(false);

            // Auto-reconnect after 3 seconds
            if (this.url) {
                this.reconnectTimer = setTimeout(() => {
                    console.log('🌐 Attempting reconnect...');
                    this.connect(this.url, this.playerName);
                }, 3000);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this._connecting = false;
        };
    }

    public disconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.url = ''; // Prevent auto-reconnect

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this._connected = false;
        this._connecting = false;
    }

    public sendMove(x: number, y: number): void {
        this.send({ type: 'PLAYER_MOVE', x, y });
    }

    public sendAttack(enemyId: string): void {
        this.send({ type: 'PLAYER_ATTACK', enemyId });
    }

    public sendBossKilled(bossId: string): void {
        this.send({ type: 'BOSS_KILLED', enemyId: bossId });
    }

    private send(msg: NetworkMessage): void {
        if (this.ws && this._connected) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    private handleMessage(msg: NetworkMessage): void {
        switch (msg.type) {
            case 'WELCOME':
                if (this.onWelcome) this.onWelcome(msg);
                break;
            case 'PLAYER_JOIN':
                if (this.onPlayerJoin) this.onPlayerJoin(msg);
                break;
            case 'PLAYER_MOVE':
                if (this.onPlayerMove) this.onPlayerMove(msg);
                break;
            case 'PLAYER_LEAVE':
                if (this.onPlayerLeave) this.onPlayerLeave(msg);
                break;
            case 'PLAYER_ATTACK':
                if (this.onPlayerAttack) this.onPlayerAttack(msg);
                break;
            case 'BOSS_KILLED':
                if (this.onBossKilled) this.onBossKilled(msg);
                break;
        }
    }
}
