import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createWorldSessionKey,
    DEFAULT_WORLD_RAID_INSTANCE_ID,
    normalizeRaidInstanceId,
    resolveWorldSessionRoute,
} from '../../server/WorldSessionRouter';

test('world session router keeps legacy default key and supports explicit raid instance keys', () => {
    const defaultRoute = resolveWorldSessionRoute({ realm: 'mortal' });
    assert.equal(defaultRoute.raidInstanceId, DEFAULT_WORLD_RAID_INSTANCE_ID);
    assert.equal(createWorldSessionKey(defaultRoute), 'mortal:primary');

    const partyRoute = resolveWorldSessionRoute({ realm: 'mortal', requestedRaidInstanceId: 'Party_Alpha-01' });
    assert.equal(partyRoute.raidInstanceId, 'party_alpha-01');
    assert.equal(createWorldSessionKey(partyRoute), 'mortal:raid:party_alpha-01');

    const masterRoute = resolveWorldSessionRoute({ realm: 'master', requestedRaidInstanceId: 'party_alpha-01' });
    assert.equal(createWorldSessionKey(masterRoute), 'master:raid:party_alpha-01');
});

test('world session router ignores invalid raid instance ids instead of account sharding', () => {
    assert.equal(normalizeRaidInstanceId(''), DEFAULT_WORLD_RAID_INSTANCE_ID);
    assert.equal(normalizeRaidInstanceId('../escape'), DEFAULT_WORLD_RAID_INSTANCE_ID);
    assert.equal(normalizeRaidInstanceId('x'.repeat(65)), DEFAULT_WORLD_RAID_INSTANCE_ID);

    const accountA = resolveWorldSessionRoute({ realm: 'mortal', requestedRaidInstanceId: 'shared-party' });
    const accountB = resolveWorldSessionRoute({ realm: 'mortal', requestedRaidInstanceId: 'shared-party' });
    assert.equal(createWorldSessionKey(accountA), createWorldSessionKey(accountB));
});
