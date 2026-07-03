import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createOriginPolicy,
    isAllowedOrigin,
    parseAllowedOrigins,
} from '../../server/OriginPolicy';

test('origin policy allows configured browser origins and rejects unknown browser origins', () => {
    const policy = createOriginPolicy({
        allowedOrigins: ['http://client.test'],
    });

    assert.equal(isAllowedOrigin('http://client.test', policy), true);
    assert.equal(isAllowedOrigin('http://evil.test', policy), false);
});

test('origin policy explicitly allows missing Origin for non-browser clients by default', () => {
    const policy = createOriginPolicy({
        allowedOrigins: ['http://client.test'],
    });

    assert.equal(isAllowedOrigin(null, policy), true);
});

test('origin policy can reject missing Origin when a deployment requires browser-only access', () => {
    const policy = createOriginPolicy({
        allowedOrigins: ['http://client.test'],
        allowMissingOrigin: false,
    });

    assert.equal(isAllowedOrigin(null, policy), false);
});

test('allowed origin parser trims configured origins and falls back to local dev clients', () => {
    assert.deepEqual(parseAllowedOrigins(' http://a.test, ,http://b.test '), [
        'http://a.test',
        'http://b.test',
    ]);
    assert.ok(parseAllowedOrigins(undefined).includes('http://127.0.0.1:5731'));
});
