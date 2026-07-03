import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InMemoryAuthStore, normalizeLoginName } from '../../server/AuthStore';
import { replayWorldSaveSpool, WorldSaveSpool } from '../../server/WorldSaveSpool';

test('world save spool persists pending patches and removes applied keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'darksaber-world-spool-'));
    const persistPath = join(dir, 'world-save-spool.json');
    try {
        const spool = new WorldSaveSpool({ persistPath, now: () => new Date('2026-01-01T00:00:00.000Z') });
        spool.upsert({
            key: 'realm:player_1',
            sessionKey: 'realm',
            playerId: 'player_1',
            accountId: 'account_1',
            characterId: 'character_1',
            resumeToken: 'resume_1',
            expectedRevision: 7,
            reason: 'dirty',
            patch: { hubLocation: { townId: 'central_castle' } },
        });

        const loaded = new WorldSaveSpool({ persistPath });
        assert.equal(loaded.list().length, 1);
        assert.equal(loaded.list()[0].updatedAt, '2026-01-01T00:00:00.000Z');

        loaded.remove('realm:player_1');
        assert.deepEqual(new WorldSaveSpool({ persistPath }).list(), []);
        assert.equal(existsSync(persistPath), true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('world save spool replay retries revision conflicts and clears successful entries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'darksaber-world-spool-'));
    const persistPath = join(dir, 'world-save-spool.json');
    try {
        const store = new InMemoryAuthStore();
        await store.initialize();
        const account = await store.createAccount({
            loginName: 'spooler',
            loginNameNormalized: normalizeLoginName('spooler'),
            passwordHash: 'hash',
        });
        const { character, save } = await store.createCharacter(account.id, {
            name: 'Spooler',
            classKey: 'infantry',
        });
        const preexistingUpdate = await store.updateCharacterSave(account.id, character.id, {
            expectedRevision: save.revision,
            patch: { hubLocation: { townId: 'master_sanctum' } },
        });
        assert.equal(preexistingUpdate.status, 'updated');

        const spool = new WorldSaveSpool({ persistPath });
        spool.upsert({
            key: 'mortal:player_1',
            sessionKey: 'mortal',
            playerId: 'player_1',
            accountId: account.id,
            characterId: character.id,
            resumeToken: 'resume_recovered',
            expectedRevision: save.revision,
            reason: 'dirty_recovery',
            patch: {
                hubLocation: { townId: 'w_forest_village' },
                questState: { completedQuestIds: ['tutorial_clear'] },
            },
        });

        const result = await replayWorldSaveSpool(store, spool, { retryLimit: 3 });
        assert.deepEqual(result, { applied: 1, failed: 0, recoveredResumeTokens: ['resume_recovered'] });
        assert.deepEqual(new WorldSaveSpool({ persistPath }).list(), []);

        const current = await store.getCharacterSave(account.id, character.id);
        assert.equal(current?.revision, 3);
        assert.deepEqual(current?.hubLocation, { townId: 'w_forest_village' });
        assert.deepEqual(current?.questState, { completedQuestIds: ['tutorial_clear'] });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('world save spool replay clears unrecoverable missing character entries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'darksaber-world-spool-'));
    const persistPath = join(dir, 'world-save-spool.json');
    try {
        const store = new InMemoryAuthStore();
        await store.initialize();
        const spool = new WorldSaveSpool({ persistPath });
        spool.upsert({
            key: 'mortal:player_missing',
            sessionKey: 'mortal',
            playerId: 'player_missing',
            accountId: 'account_missing',
            characterId: 'character_missing',
            expectedRevision: 1,
            reason: 'dirty_recovery',
            patch: { hubLocation: { townId: 'central_castle' } },
        });

        const messages: string[] = [];
        const result = await replayWorldSaveSpool(store, spool, { logger: (message) => messages.push(message) });

        assert.deepEqual(result, { applied: 0, failed: 1, recoveredResumeTokens: [] });
        assert.deepEqual(new WorldSaveSpool({ persistPath }).list(), []);
        assert.match(messages[0] ?? '', /character save was not found/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
