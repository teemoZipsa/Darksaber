import test from 'node:test';
import assert from 'node:assert/strict';
import { hashRefreshToken } from '../../server/AuthCrypto';

test('refresh token hash uses an environment secret in production paths', () => {
    const originalSecret = process.env.AUTH_REFRESH_TOKEN_HASH_SECRET;
    const originalNodeEnv = process.env.NODE_ENV;

    try {
        delete process.env.AUTH_REFRESH_TOKEN_HASH_SECRET;
        process.env.NODE_ENV = 'test';
        const devHash = hashRefreshToken('refresh-token');

        process.env.AUTH_REFRESH_TOKEN_HASH_SECRET = 'test-refresh-secret';
        const configuredHash = hashRefreshToken('refresh-token');
        assert.notEqual(configuredHash, devHash);
        assert.equal(configuredHash, hashRefreshToken('refresh-token'));

        delete process.env.AUTH_REFRESH_TOKEN_HASH_SECRET;
        process.env.NODE_ENV = 'production';
        assert.throws(() => hashRefreshToken('refresh-token'), /AUTH_REFRESH_TOKEN_HASH_SECRET/);
    } finally {
        if (originalSecret === undefined) delete process.env.AUTH_REFRESH_TOKEN_HASH_SECRET;
        else process.env.AUTH_REFRESH_TOKEN_HASH_SECRET = originalSecret;

        if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalNodeEnv;
    }
});
