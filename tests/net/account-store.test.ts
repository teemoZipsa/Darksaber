import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { STORY_QUESTS } from '../../src/data/StoryQuestData';
import { ServerAccountStore } from '../../server/ServerAccountStore';

test('server account store creates accounts and rejects mismatched secrets', () => {
    const store = new ServerAccountStore({ now: () => 100 });
    const accountId = 'acct_test_1234567890';
    const accountSecret = 'secret_1234567890_1234567890';

    const created = store.authenticate(accountId, accountSecret);
    assert.equal(created.accepted, true);
    assert.equal(created.created, true);
    assert.equal(created.account?.accountId, accountId);

    const rejected = store.authenticate(accountId, `${accountSecret}_wrong`);
    assert.equal(rejected.accepted, false);
    assert.match(rejected.reason ?? '', /does not match/);
});

test('server account store persists only recognized story quest progress', () => {
    const dir = mkdtempSync(join(tmpdir(), 'darksaber-account-'));
    const persistPath = join(dir, 'accounts.json');
    const accountId = 'acct_test_abcdefghij';
    const accountSecret = 'secret_abcdefghij_abcdefghij';
    const questId = STORY_QUESTS[0].id;

    try {
        const store = new ServerAccountStore({ persistPath, now: () => 200 });
        assert.equal(store.authenticate(accountId, accountSecret).accepted, true);
        store.recordRaidSurvival(accountId, [questId, 'not_a_story_quest'], 'master_sanctum');
        store.flushSave();

        const loaded = new ServerAccountStore({ persistPath, now: () => 300 });
        const account = loaded.getAccount(accountId);
        assert.deepEqual(account?.completedQuestIds, [questId]);
        assert.equal(account?.currentHubTownId, 'master_sanctum');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
