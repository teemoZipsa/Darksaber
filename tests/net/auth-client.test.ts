import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthApiError, AuthClient, type AuthSessionResponse } from '../../src/net/AuthClient';
import { shouldReturnToAuthAfterRefreshFailure } from '../../src/ui/react/auth/AuthGate';

const originalFetch = globalThis.fetch;

function session(accessToken: string): AuthSessionResponse {
    return {
        accessToken,
        accessTokenExpiresAt: Date.now() + 60_000,
        account: {
            id: 'account',
            loginName: 'tester',
            lastSelectedCharacterId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            disabledAt: null,
        },
        characters: [],
        lastSelectedCharacterId: null,
        accountProgress: {
            accountId: 'account',
            completedQuests: [],
            unlocks: {},
            flags: {},
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
        saveVersion: 1,
    };
}

test('AuthClient shares one in-flight refresh request between callers', async () => {
    let resolveFetch!: (response: Response) => void;
    let fetchCalls = 0;
    globalThis.fetch = (() => {
        fetchCalls++;
        return new Promise<Response>((resolve) => { resolveFetch = resolve; });
    }) as typeof fetch;

    try {
        const client = new AuthClient('http://auth.test');
        const first = client.refresh();
        const second = client.refresh();
        assert.equal(fetchCalls, 1);

        resolveFetch(Response.json(session('fresh-token')));
        const [firstSession, secondSession] = await Promise.all([first, second]);

        assert.equal(firstSession.accessToken, 'fresh-token');
        assert.equal(secondSession.accessToken, 'fresh-token');
        assert.equal(client.getAccessToken(), 'fresh-token');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('AuthClient retries one stale refresh rotation with the latest cookie', async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
        fetchCalls++;
        if (fetchCalls === 1) {
            return Response.json({ error: 'refresh_stale', message: 'rotated' }, { status: 409 });
        }
        return Response.json(session('rotated-token'));
    }) as typeof fetch;

    try {
        const client = new AuthClient('http://auth.test');
        const refreshed = await client.refresh();

        assert.equal(fetchCalls, 2);
        assert.equal(refreshed.accessToken, 'rotated-token');
        assert.equal(client.getAccessToken(), 'rotated-token');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('AuthClient opts save PATCH requests into keepalive only when requested', async () => {
    const requestOptions: RequestInit[] = [];
    globalThis.fetch = (async (_input, options) => {
        requestOptions.push(options ?? {});
        return Response.json({ save: {} });
    }) as typeof fetch;

    try {
        const client = new AuthClient('http://auth.test');
        client.setAccessToken('access-token');

        await client.updateCharacterSave('hero-default', {}, 1);
        await client.updateCharacterSave('hero-keepalive', {}, 2, { keepalive: true });

        assert.equal(requestOptions[0]?.method, 'PATCH');
        assert.equal(requestOptions[0]?.keepalive, undefined);
        assert.equal(requestOptions[1]?.method, 'PATCH');
        assert.equal(requestOptions[1]?.keepalive, true);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('periodic refresh failures do not replace an active game with the auth screen', () => {
    assert.equal(shouldReturnToAuthAfterRefreshFailure(
        'playing',
        new AuthApiError(401, 'refresh_invalid', 'expired')
    ), false);
    assert.equal(shouldReturnToAuthAfterRefreshFailure(
        'select',
        new AuthApiError(503, 'request_failed', 'temporary')
    ), false);
    assert.equal(shouldReturnToAuthAfterRefreshFailure(
        'select',
        new AuthApiError(401, 'refresh_invalid', 'expired')
    ), true);
});
