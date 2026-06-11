import type { StartingClassId } from '../data/characterClasses';
import type { CharacterStats } from '../data/Stats';

export const DEFAULT_AUTH_SERVER_URL = readAuthServerUrl();

export interface AuthAccount {
    id: string;
    loginName: string;
    lastSelectedCharacterId: string | null;
    createdAt: string;
    updatedAt: string;
    disabledAt: string | null;
}

export interface AuthCharacter {
    id: string;
    slotNo: number;
    name: string;
    classKey: StartingClassId;
    tier: number;
    level: number;
    exp: number;
    baseStats: CharacterStats;
    createdAt: string;
    updatedAt: string;
}

export interface InventorySaveItem {
    uid?: string;
    itemId: string;
    gridX: number;
    gridY: number;
    quantity: number;
    durability: number;
    acquiredInRaid?: boolean;
    sockets?: string[];
}

export interface CharacterSave {
    characterId: string;
    saveVersion: number;
    revision: number;
    hubLocation: Record<string, unknown>;
    questState: Record<string, unknown>;
    inventory: {
        width: number;
        height: number;
        items: InventorySaveItem[];
    };
    equipment: Record<string, unknown>;
    partySnapshot: Record<string, unknown>;
    rosterSnapshot: Record<string, unknown>;
    updatedAt: string;
}

export interface AccountProgress {
    accountId: string;
    completedQuests: string[];
    unlocks: Record<string, unknown>;
    flags: Record<string, unknown>;
    updatedAt: string;
}

export interface AuthSessionResponse {
    accessToken: string;
    accessTokenExpiresAt: number;
    account: AuthAccount;
    characters: AuthCharacter[];
    lastSelectedCharacterId: string | null;
    accountProgress: AccountProgress;
    saveVersion: number;
}

export interface AccountMeResponse {
    account: AuthAccount;
    characters: AuthCharacter[];
    lastSelectedCharacterId: string | null;
    accountProgress: AccountProgress;
}

export interface CharacterSelectResponse {
    account: AuthAccount;
    character: AuthCharacter;
    save: CharacterSave;
    accountProgress: AccountProgress;
}

export interface CharacterCreateResponse {
    character: AuthCharacter;
    save: CharacterSave;
}

export class AuthApiError extends Error {
    public constructor(public readonly status: number, public readonly code: string, message: string) {
        super(message);
    }
}

export class AuthClient {
    private accessToken: string | null = null;

    public constructor(private readonly baseUrl: string = DEFAULT_AUTH_SERVER_URL) {}

    public getAccessToken(): string | null {
        return this.accessToken;
    }

    public async register(loginName: string, password: string): Promise<AuthSessionResponse> {
        const response = await this.request<AuthSessionResponse>('/auth/register', {
            method: 'POST',
            body: { loginName, password },
        });
        this.accessToken = response.accessToken;
        return response;
    }

    public async login(loginName: string, password: string): Promise<AuthSessionResponse> {
        const response = await this.request<AuthSessionResponse>('/auth/login', {
            method: 'POST',
            body: { loginName, password },
        });
        this.accessToken = response.accessToken;
        return response;
    }

    public async refresh(): Promise<AuthSessionResponse> {
        const response = await this.request<AuthSessionResponse>('/auth/refresh', { method: 'POST' });
        this.accessToken = response.accessToken;
        return response;
    }

    public async logout(): Promise<void> {
        try {
            await this.request('/auth/logout', { method: 'POST' });
        } finally {
            this.accessToken = null;
        }
    }

    public async logoutAll(): Promise<void> {
        try {
            await this.request('/auth/logout-all', { method: 'POST', auth: true });
        } finally {
            this.accessToken = null;
        }
    }

    public async me(): Promise<AccountMeResponse> {
        return this.request<AccountMeResponse>('/account/me', { method: 'GET', auth: true });
    }

    public async createCharacter(name: string, classKey: StartingClassId, gender: 'M' | 'F'): Promise<CharacterCreateResponse> {
        return this.request<CharacterCreateResponse>('/characters', {
            method: 'POST',
            auth: true,
            body: { name, classKey, gender },
        });
    }

    public async selectCharacter(characterId: string): Promise<CharacterSelectResponse> {
        return this.request<CharacterSelectResponse>(`/characters/${encodeURIComponent(characterId)}/select`, {
            method: 'POST',
            auth: true,
        });
    }

    public async deleteCharacter(characterId: string): Promise<void> {
        await this.request(`/characters/${encodeURIComponent(characterId)}`, {
            method: 'DELETE',
            auth: true,
        });
    }

    /**
     * Patch a character's persisted save (only the provided fields are written).
     * Uses optimistic concurrency: `expectedRevision` must match the stored
     * revision or the server returns 409. Returns the updated save.
     */
    public async updateCharacterSave(
        characterId: string,
        patch: Partial<Pick<CharacterSave, 'rosterSnapshot'>>,
        expectedRevision: number
    ): Promise<CharacterSave> {
        const response = await this.request<{ save: CharacterSave }>(
            `/characters/${encodeURIComponent(characterId)}/save`,
            { method: 'PATCH', auth: true, body: { expectedRevision, save: patch } }
        );
        return response.save;
    }

    private async request<T = unknown>(path: string, options: { method: string; body?: unknown; auth?: boolean }): Promise<T> {
        const headers: Record<string, string> = {};
        let body: string | undefined;
        if (options.body !== undefined) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(options.body);
        }
        if (options.auth) {
            if (!this.accessToken) throw new AuthApiError(401, 'access_missing', 'Access token is missing.');
            headers.Authorization = `Bearer ${this.accessToken}`;
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            method: options.method,
            headers,
            body,
            credentials: 'include',
        });
        const parsed = await parseResponse(response);
        if (!response.ok) {
            const error = isRecord(parsed) && typeof parsed.error === 'string' ? parsed.error : 'request_failed';
            const message = isRecord(parsed) && typeof parsed.message === 'string' ? parsed.message : response.statusText;
            throw new AuthApiError(response.status, error, message);
        }
        return parsed as T;
    }
}

async function parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return {};
    }
}

function readAuthServerUrl(): string {
    const configured = import.meta.env?.VITE_AUTH_SERVER_URL?.trim();
    if (configured) return configured.replace(/\/$/, '');
    if (import.meta.env?.DEV) return 'http://localhost:8765';
    if (typeof window === 'undefined') return 'http://localhost:8765';
    return window.location.origin;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
