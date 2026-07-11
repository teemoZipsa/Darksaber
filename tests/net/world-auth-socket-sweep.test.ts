import assert from 'node:assert/strict';
import test from 'node:test';
import { sweepRevokedSockets } from '../../server/WorldAuthSocketSweep';

test('auth socket sweep contains store failures and continues checking clients', async () => {
    const revoked: string[] = [];
    const errors: string[] = [];
    const sockets: Array<readonly [{ id: string }, { sessionId: string }]> = [
        [{ id: 'socket-a' }, { sessionId: 'session-error' }],
        [{ id: 'socket-b' }, { sessionId: 'session-revoked' }],
        [{ id: 'socket-c' }, { sessionId: 'session-active' }],
    ];

    await sweepRevokedSockets({
        bindings: sockets,
        getSession: async (sessionId) => {
            if (sessionId === 'session-error') throw new Error('database unavailable');
            if (sessionId === 'session-revoked') {
                return { revokedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z' };
            }
            return { revokedAt: null, expiresAt: '2027-01-01T00:00:00.000Z' };
        },
        revokeSocket: (socket) => { revoked.push(socket.id); },
        onError: (_error, sessionId) => { errors.push(sessionId); },
        now: Date.parse('2026-06-01T00:00:00.000Z'),
    });

    assert.deepEqual(errors, ['session-error']);
    assert.deepEqual(revoked, ['socket-b']);
});
