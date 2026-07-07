import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveServerRuntimeConfig } from '../../server/ServerRuntimeConfig';
import { DEFAULT_DEV_ALLOWED_ORIGINS } from '../../server/OriginPolicy';

test('production server requires DATABASE_URL', () => {
    assert.throws(
        () => resolveServerRuntimeConfig({ NODE_ENV: 'production' }),
        /DATABASE_URL is required/
    );
    assert.throws(
        () => resolveServerRuntimeConfig({ NODE_ENV: 'production', DATABASE_URL: '   ' }),
        /DATABASE_URL is required/
    );
});

test('production server requires AUTH_ALLOWED_ORIGINS', () => {
    assert.throws(
        () => resolveServerRuntimeConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db' }),
        /AUTH_ALLOWED_ORIGINS is required/
    );
    assert.throws(
        () => resolveServerRuntimeConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db', AUTH_ALLOWED_ORIGINS: '   ' }),
        /AUTH_ALLOWED_ORIGINS is required/
    );
});

test('server runtime config chooses postgres only when DATABASE_URL is set', () => {
    assert.deepEqual(resolveServerRuntimeConfig({ NODE_ENV: 'development' }), {
        databaseUrl: null,
        authStoreKind: 'memory',
        allowedOrigins: [...DEFAULT_DEV_ALLOWED_ORIGINS],
    });
    assert.deepEqual(resolveServerRuntimeConfig({
        NODE_ENV: 'production',
        DATABASE_URL: ' postgres://db ',
        AUTH_ALLOWED_ORIGINS: 'https://game.example, http://localhost:5173',
    }), {
        databaseUrl: 'postgres://db',
        authStoreKind: 'postgres',
        allowedOrigins: ['https://game.example', 'http://localhost:5173'],
    });
});
