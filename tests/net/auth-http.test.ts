import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { createAuthHttpHandler } from '../../server/AuthHttp';
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
                    hubLocation: { realm: 'mortal', townId: 'w_forest_village' },
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
                    hubLocation: { realm: 'mortal', townId: 'central_castle' },
                },
            },
        });
        assert.equal(stale.status, 409);
        assert.equal(stale.body.error, 'revision_conflict');
    } finally {
        await harness.close();
    }
});

async function createHarness(): Promise<{
    store: InMemoryAuthStore;
    request(path: string, options: { method: string; body?: unknown; accessToken?: string; cookie?: string }): Promise<{ status: number; body: Record<string, unknown>; setCookie: string }>;
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
            const headers: Record<string, string> = { Origin: 'http://client.test' };
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
