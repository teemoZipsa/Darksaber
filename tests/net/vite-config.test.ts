import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionClientEnv } from '../../vite.config';

test('Vercel production client builds require auth and world server URLs', () => {
    assert.throws(
        () => validateProductionClientEnv({ VERCEL: '1' }),
        /VITE_AUTH_SERVER_URL, VITE_WORLD_SERVER_URL/
    );
    assert.throws(
        () => validateProductionClientEnv({
            DARKSABER_REQUIRE_PROD_CLIENT_ENV: '1',
            VITE_AUTH_SERVER_URL: 'https://server.example',
        }),
        /VITE_WORLD_SERVER_URL/
    );
});

test('local client builds can run without production server URLs', () => {
    assert.doesNotThrow(() => validateProductionClientEnv({}));
    assert.doesNotThrow(() => validateProductionClientEnv({
        VERCEL: '1',
        VITE_AUTH_SERVER_URL: 'https://server.example',
        VITE_WORLD_SERVER_URL: 'wss://server.example',
    }));
});
