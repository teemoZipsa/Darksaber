import test from 'node:test';
import assert from 'node:assert/strict';
import { Socket } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { MemoryRateLimiter, resolveClientIp } from '../../server/AuthRateLimit';

test('resolveClientIp ignores x-forwarded-for unless trust proxy is enabled', () => {
    const request = fakeRequest({ 'x-forwarded-for': '203.0.113.50' }, '10.0.0.5');
    assert.equal(resolveClientIp(request, false), '10.0.0.5');
    assert.equal(resolveClientIp(request, true), '203.0.113.50');
});

test('memory rate limiter enforces fixed window limits', () => {
    const limiter = new MemoryRateLimiter(2, 60_000);
    const now = 1_000;
    limiter.consume('a', now);
    limiter.consume('a', now);
    assert.equal(limiter.isAllowed('a', now), false);
    assert.throws(() => limiter.consume('a', now));
    assert.equal(limiter.isAllowed('a', now + 60_001), true);
});

function fakeRequest(headers: Record<string, string>, remoteAddress = '127.0.0.1'): IncomingMessage {
    const socket = new Socket();
    Object.defineProperty(socket, 'remoteAddress', { value: remoteAddress });
    return { headers, socket } as IncomingMessage;
}
