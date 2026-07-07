import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveServerRuntimeConfig } from '../../server/ServerRuntimeConfig';

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

test('server runtime config chooses postgres only when DATABASE_URL is set', () => {
    assert.deepEqual(resolveServerRuntimeConfig({ NODE_ENV: 'development' }), {
        databaseUrl: null,
        authStoreKind: 'memory',
    });
    assert.deepEqual(resolveServerRuntimeConfig({ NODE_ENV: 'production', DATABASE_URL: ' postgres://db ' }), {
        databaseUrl: 'postgres://db',
        authStoreKind: 'postgres',
    });
});
