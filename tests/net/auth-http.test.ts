import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { createAuthHttpHandler } from '../../server/AuthHttp';
import { MemoryRateLimiter } from '../../server/AuthRateLimit';
import { verifyAccessToken } from '../../server/AuthCrypto';
import { InMemoryAuthStore, normalizeLoginName } from '../../server/AuthStore';
import type { JwtOptions } from '../../server/AuthCrypto';

const jwt: JwtOptions = {
    secret: 'test-secret',
    issuer: 'darksaber-test',
    audience: 'darksaber-client-test',
    ttlSeconds: 300,
};

test('auth HTTP register stores argon2id hash and returns secure refresh cookie', async () => {
    const harness = await createHarness();
    try {
        const registered = await harness.request('/auth/register', {
            method: 'POST',
            body: { loginName: 'User01', password: 'password-1234' },
        });

        assert.equal(registered.status, 201);
        assert.equal(typeof registered.body.accessToken, 'string');
        assert.match(registered.setCookie, /HttpOnly/);
        assert.match(registered.setCookie, /Secure/);
        assert.match(registered.setCookie, /SameSite=Lax/);

        const account = await harness.store.findAccountByLoginNameNormalized(normalizeLoginName(' user01 '));
        assert.ok(account);
        assert.match(account.passwordHash, /^\$argon2id\$/);

        const claims = verifyAccessToken(String(registered.body.accessToken), jwt);
        assert.equal(claims?.accountId, account.id);

        const me = await harness.request('/account/me', {
            method: 'GET',
            accessToken: String(registered.body.accessToken),
        });
        assert.equal(me.status, 200);
        assert.equal(asRecord(me.body.account).loginName, 'User01');
    } finally {
        await harness.close();
    }
});

test('refresh token rotation rejects reused tokens and revokes the family', async () => {
    const harness = await createHarness();
    try {
        const registered = await harness.request('/auth/register', {
            method: 'POST',
            body: { loginName: 'rotate01', password: 'password-1234' },
        });
        const firstCookie = extractRefreshCookie(registered.setCookie);

        const refreshed = await harness.request('/auth/refresh', {
            method: 'POST',
            cookie: firstCookie,
        });
        assert.equal(refreshed.status, 200);
        const secondCookie = extractRefreshCookie(refreshed.setCookie);
        assert.notEqual(firstCookie, secondCookie);

        const reused = await harness.request('/auth/refresh', {
            method: 'POST',
            cookie: firstCookie,
        });
        assert.equal(reused.status, 401);
        assert.equal(reused.body.error, 'refresh_reused');

        const familyRevoked = await harness.request('/auth/refresh', {
            method: 'POST',
            cookie: secondCookie,
        });
        assert.equal(familyRevoked.status, 401);
    } finally {
        await harness.close();
    }
});

test('character APIs enforce ownership and save revision conflicts', async () => {
    const harness = await createHarness();
    try {
        const a = await harness.request('/auth/register', {
            method: 'POST',
            body: { loginName: 'owner01', password: 'password-1234' },
        });
        const b = await harness.request('/auth/register', {
            method: 'POST',
            body: { loginName: 'other01', password: 'password-1234' },
        });

        const created = await harness.request('/characters', {
            method: 'POST',
            accessToken: String(a.body.accessToken),
            body: { name: 'Commander', classKey: 'infantry', gender: 'M' },
        });
        assert.equal(created.status, 201);
        const characterId = String(asRecord(created.body.character).id);

        const selected = await harness.request(`/characters/${characterId}/select`, {
            method: 'POST',
            accessToken: String(a.body.accessToken),
        });
        assert.equal(selected.status, 200);
        assert.equal(asRecord(selected.body.save).revision, 1);

        const denied = await harness.request(`/characters/${characterId}/save`, {
            method: 'GET',
            accessToken: String(b.body.accessToken),
        });
        assert.equal(denied.status, 404);

        const updated = await harness.request(`/characters/${characterId}/save`, {
            method: 'PATCH',
            accessToken: String(a.body.accessToken),
            body: {
                expectedRevision: 1,
                save: {
                    rosterSnapshot: {
                        characters: [{
                            id: characterId,
                            magicLoadout: [],
                        }],
                    },
                },
            },
        });
        assert.equal(updated.status, 200);
        assert.equal(asRecord(updated.body.save).revision, 2);

        const stale = await harness.request(`/characters/${characterId}/save`, {
            method: 'PATCH',
            accessToken: String(a.body.accessToken),
            body: {
                expectedRevision: 1,
                save: {
                    rosterSnapshot: {
                        characters: [{
                            id: characterId,
                            magicLoadout: [],
                        }],
                    },
                },
            },
        });
        assert.equal(stale.status, 409);
        assert.equal(stale.body.error, 'revision_conflict');
    } finally {
        await harness.close();
    }
});

test('character save HTTP rejects forbidden questState and unknown fields', async () => {
    const harness = await createHarness();
    try {
        const registered = await harness.request('/auth/register', {
            method: 'POST',
            body: { loginName: 'saveguard01', password: 'password-1234' },
        });
        const created = await harness.request('/characters', {
            method: 'POST',
            accessToken: String(registered.body.accessToken),
            body: { name: 'Guarded', classKey: 'infantry', gender: 'M' },
        });
        assert.equal(created.status, 201);
        const characterId = String(asRecord(created.body.character).id);

        const questStateAttempt = await harness.request(`/characters/${characterId}/save`, {
            method: 'PATCH',
            accessToken: String(registered.body.accessToken),
            body: {
                expectedRevision: 1,
                save: {
                    questState: { completedQuestIds: ['quest:fake'] },
                },
            },
        });
        assert.equal(questStateAttempt.status, 400);
        assert.equal(questStateAttempt.body.error, 'forbidden_save_field');

        const unknownField = await harness.request(`/characters/${characterId}/save`, {
            method: 'PATCH',
            accessToken: String(registered.body.accessToken),
            body: {
                expectedRevision: 1,
                save: { forged: true },
            },
        });
        assert.equal(unknownField.status, 400);
        assert.equal(unknownField.body.error, 'forbidden_save_field');
    } finally {
        await harness.close();
    }
});

test('character save HTTP allows hub inventory patch and strips acquiredInRaid', async () => {
    const harness = await createHarness();
    try {
        const registered = await harness.request('/auth/register', {
            method: 'POST',
            body: { loginName: 'hubpatch01', password: 'password-1234' },
        });
        const created = await harness.request('/characters', {
            method: 'POST',
            accessToken: String(registered.body.accessToken),
            body: { name: 'Merchant', classKey: 'infantry', gender: 'M' },
        });
        const characterId = String(asRecord(created.body.character).id);
        const updated = await harness.request(`/characters/${characterId}/save`, {
            method: 'PATCH',
            accessToken: String(registered.body.accessToken),
            body: {
                expectedRevision: 1,
                save: {
                    questState: { gold: 750 },
                    inventory: {
                        width: 10,
                        height: 6,
                        items: [{
                            itemId: 'herb_cheap',
                            gridX: 0,
                            gridY: 0,
                            quantity: 1,
                            durability: 1,
                            acquiredInRaid: true,
                        }],
                    },
                },
            },
        });
        assert.equal(updated.status, 200);
        const save = asRecord(updated.body.save);
        assert.equal((asRecord(save.questState).gold), 750);
        const items = asRecord(save.inventory).items as Array<Record<string, unknown>>;
        assert.equal(items.length, 1);
        assert.equal(items[0]?.acquiredInRaid, undefined);
    } finally {
        await harness.close();
    }
});

test('character save HTTP blocks hub patch during active raid session', async () => {
    const harness = await createHarness({ isHubPatchBlocked: () => true });
    try {
        const registered = await harness.request('/auth/register', {
            method: 'POST',
            body: { loginName: 'raidblock01', password: 'password-1234' },
        });
        const created = await harness.request('/characters', {
            method: 'POST',
            accessToken: String(registered.body.accessToken),
            body: { name: 'Raider', classKey: 'infantry', gender: 'M' },
        });
        const characterId = String(asRecord(created.body.character).id);
        const blocked = await harness.request(`/characters/${characterId}/save`, {
            method: 'PATCH',
            accessToken: String(registered.body.accessToken),
            body: {
                expectedRevision: 1,
                save: { questState: { gold: 100 } },
            },
        });
        assert.equal(blocked.status, 409);
        assert.equal(blocked.body.error, 'hub_flush_blocked_during_raid');
    } finally {
        await harness.close();
    }
});

test('character save HTTP preserves authoritative roster fields', async () => {
    const harness = await createHarness();
    try {
        const registered = await harness.request('/auth/register', {
            method: 'POST',
            body: { loginName: 'rosterguard01', password: 'password-1234' },
        });
        const created = await harness.request('/characters', {
            method: 'POST',
            accessToken: String(registered.body.accessToken),
            body: { name: 'RosterGuard', classKey: 'infantry', gender: 'M' },
        });
        assert.equal(created.status, 201);
        const characterId = String(asRecord(created.body.character).id);
        const originalSave = asRecord(created.body.save);
        const originalRoster = asRecord(originalSave.rosterSnapshot);
        const originalCharacter = asRecord((originalRoster.characters as unknown[])[0]);

        const updated = await harness.request(`/characters/${characterId}/save`, {
            method: 'PATCH',
            accessToken: String(registered.body.accessToken),
            body: {
                expectedRevision: 1,
                save: {
                    rosterSnapshot: {
                        characters: [{
                            id: characterId,
                            name: 'Forged',
                            classKey: 'magic',
                            tier: 7,
                            level: 99,
                            exp: 999999,
                            baseStats: { hp: 9999, attack: 9999 },
                            skillUpgradeLevels: { inf_t1: 5 },
                            magicLoadout: ['inf_t1'],
                        }],
                    },
                },
            },
        });

        assert.equal(updated.status, 200);
        const updatedSave = asRecord(updated.body.save);
        const updatedRoster = asRecord(updatedSave.rosterSnapshot);
        const updatedCharacter = asRecord((updatedRoster.characters as unknown[])[0]);
        assert.equal(updatedCharacter.name, originalCharacter.name);
        assert.equal(updatedCharacter.classKey, originalCharacter.classKey);
        assert.equal(updatedCharacter.tier, originalCharacter.tier);
        assert.equal(updatedCharacter.level, originalCharacter.level);
        assert.equal(updatedCharacter.exp, originalCharacter.exp);
        assert.deepEqual(updatedCharacter.baseStats, originalCharacter.baseStats);
        assert.equal(updatedCharacter.skillUpgradeLevels, undefined);
        assert.ok(Array.isArray(updatedCharacter.magicLoadout));
    } finally {
        await harness.close();
    }
});

test('register requests are rate limited per client IP', async () => {
    const harness = await createHarness({
        registerRateLimiter: new MemoryRateLimiter(2, 60_000),
    });
    try {
        const first = await harness.request('/auth/register', {
            method: 'POST',
            body: { loginName: 'rate01', password: 'password-1234' },
        });
        const second = await harness.request('/auth/register', {
            method: 'POST',
            body: { loginName: 'rate02', password: 'password-1234' },
        });
        const third = await harness.request('/auth/register', {
            method: 'POST',
            body: { loginName: 'rate03', password: 'password-1234' },
        });

        assert.equal(first.status, 201);
        assert.equal(second.status, 201);
        assert.equal(third.status, 429);
        assert.equal(third.body.error, 'register_rate_limited');
    } finally {
        await harness.close();
    }
});

test('login IP rate limit ignores spoofed x-forwarded-for when trust proxy is disabled', async () => {
    const harness = await createHarness({
        trustProxy: false,
        loginIpRateLimiter: new MemoryRateLimiter(2, 60_000),
    });
    try {
        const first = await harness.request('/auth/login', {
            method: 'POST',
            headers: { 'x-forwarded-for': '203.0.113.10' },
            body: { loginName: 'missing01', password: 'password-1234' },
        });
        const second = await harness.request('/auth/login', {
            method: 'POST',
            headers: { 'x-forwarded-for': '203.0.113.20' },
            body: { loginName: 'missing02', password: 'password-1234' },
        });
        const third = await harness.request('/auth/login', {
            method: 'POST',
            headers: { 'x-forwarded-for': '203.0.113.30' },
            body: { loginName: 'missing03', password: 'password-1234' },
        });

        assert.equal(first.status, 401);
        assert.equal(second.status, 401);
        assert.equal(third.status, 429);
        assert.equal(third.body.error, 'login_rate_limited');
    } finally {
        await harness.close();
    }
});

test('login IP rate limit uses x-forwarded-for when trust proxy is enabled', async () => {
    const harness = await createHarness({
        trustProxy: true,
        loginIpRateLimiter: new MemoryRateLimiter(2, 60_000),
    });
    try {
        const first = await harness.request('/auth/login', {
            method: 'POST',
            headers: { 'x-forwarded-for': '203.0.113.50' },
            body: { loginName: 'missing01', password: 'password-1234' },
        });
        const second = await harness.request('/auth/login', {
            method: 'POST',
            headers: { 'x-forwarded-for': '203.0.113.50' },
            body: { loginName: 'missing02', password: 'password-1234' },
        });
        const third = await harness.request('/auth/login', {
            method: 'POST',
            headers: { 'x-forwarded-for': '203.0.113.50' },
            body: { loginName: 'missing03', password: 'password-1234' },
        });

        assert.equal(first.status, 401);
        assert.equal(second.status, 401);
        assert.equal(third.status, 429);
        assert.equal(third.body.error, 'login_rate_limited');
    } finally {
        await harness.close();
    }
});

test('auth HTTP rejects browser requests from origins outside the allowlist', async () => {
    const harness = await createHarness();
    try {
        const rejected = await harness.request('/auth/register', {
            method: 'POST',
            origin: 'http://evil.test',
            body: { loginName: 'originblock01', password: 'password-1234' },
        });

        assert.equal(rejected.status, 403);
        assert.equal(rejected.body.error, 'origin_forbidden');
    } finally {
        await harness.close();
    }
});

test('auth HTTP allows requests without Origin for non-browser clients', async () => {
    const harness = await createHarness();
    try {
        const accepted = await harness.request('/auth/register', {
            method: 'POST',
            origin: null,
            body: { loginName: 'nativeclient01', password: 'password-1234' },
        });

        assert.equal(accepted.status, 201);
        assert.equal(accepted.accessControlAllowOrigin, '');
    } finally {
        await harness.close();
    }
});

async function createHarness(options: {
    trustProxy?: boolean;
    registerRateLimiter?: MemoryRateLimiter;
    loginIpRateLimiter?: MemoryRateLimiter;
    isHubPatchBlocked?: (accountId: string, characterId: string) => boolean;
} = {}): Promise<{
    store: InMemoryAuthStore;
    request(path: string, options: {
        method: string;
        body?: unknown;
        accessToken?: string;
        cookie?: string;
        origin?: string | null;
        headers?: Record<string, string>;
    }): Promise<{ status: number; body: Record<string, unknown>; setCookie: string; accessControlAllowOrigin: string }>;
    close(): Promise<void>;
}> {
    const store = new InMemoryAuthStore();
    await store.initialize();
    const handler = createAuthHttpHandler({
        store,
        jwt,
        allowedOrigins: ['http://client.test'],
        refreshCookieSecure: true,
        sameSite: 'Lax',
        trustProxy: options.trustProxy,
        registerRateLimiter: options.registerRateLimiter,
        loginIpRateLimiter: options.loginIpRateLimiter,
        isHubPatchBlocked: options.isHubPatchBlocked,
    });
    const server = createServer((request, response) => {
        void handler(request, response).then((handled) => {
            if (!handled) {
                response.writeHead(404);
                response.end();
            }
        });
    });
    server.listen(0);
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    return {
        store,
        request: async (path, options) => {
            const headers: Record<string, string> = {
                ...options.headers,
            };
            if (options.origin !== null) headers.Origin = options.origin ?? 'http://client.test';
            if (options.body !== undefined) headers['Content-Type'] = 'application/json';
            if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
            if (options.cookie) headers.Cookie = options.cookie;
            const response = await fetch(`${baseUrl}${path}`, {
                method: options.method,
                headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
            });
            const text = await response.text();
            const parsed = text ? JSON.parse(text) as Record<string, unknown> : {};
            return {
                status: response.status,
                body: parsed,
                setCookie: response.headers.get('set-cookie') ?? '',
                accessControlAllowOrigin: response.headers.get('access-control-allow-origin') ?? '',
            };
        },
        close: () => closeServer(server),
    };
}

function extractRefreshCookie(setCookie: string): string {
    const match = /^ds_refresh=[^;]+/.exec(setCookie);
    assert.ok(match);
    return match[0];
}

function asRecord(value: unknown): Record<string, unknown> {
    assert.equal(typeof value, 'object');
    assert.notEqual(value, null);
    return value as Record<string, unknown>;
}

async function closeServer(server: Server): Promise<void> {
    server.close();
    await once(server, 'close');
}
