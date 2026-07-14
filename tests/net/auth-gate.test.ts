import assert from 'node:assert/strict';
import test from 'node:test';
import { createBaseStats } from '../../src/data/Stats';
import type {
    AuthCharacter,
    AuthSessionResponse,
    CharacterCreateResponse,
} from '../../src/net/AuthClient';
import {
    accountWithCreatedCharacter,
    createCharacterThenSelect,
} from '../../src/ui/react/auth/AuthGate';

const BASE_STATS = createBaseStats();

function character(id: string, slotNo: number): AuthCharacter {
    return {
        id,
        slotNo,
        name: id,
        classKey: 'infantry',
        tier: 1,
        level: 1,
        exp: 0,
        baseStats: BASE_STATS,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

function session(characters: AuthCharacter[]): AuthSessionResponse {
    return {
        accessToken: 'access-token',
        accessTokenExpiresAt: Date.now() + 60_000,
        account: {
            id: 'account',
            loginName: 'tester',
            lastSelectedCharacterId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            disabledAt: null,
        },
        characters,
        lastSelectedCharacterId: null,
        accountProgress: {
            accountId: 'account',
            completedQuests: [],
            unlocks: {},
            flags: {},
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
        saveVersion: 1,
    };
}

test('created character is exposed before automatic selection can fail', async () => {
    const createdCharacter = character('created', 1);
    const created: CharacterCreateResponse = {
        character: createdCharacter,
        save: {} as CharacterCreateResponse['save'],
    };
    let account: AuthSessionResponse | null = session([character('existing', 0)]);
    const events: string[] = [];

    await assert.rejects(
        createCharacterThenSelect({
            create: async () => {
                events.push('create');
                return created;
            },
            onCreated: (nextCharacter) => {
                events.push('show-select');
                account = accountWithCreatedCharacter(account, nextCharacter) as AuthSessionResponse;
            },
            select: async () => {
                events.push('select');
                throw new Error('selection failed');
            },
        }),
        /selection failed/,
    );

    assert.deepEqual(events, ['create', 'show-select', 'select']);
    assert.deepEqual(account?.characters.map((entry) => entry.id), ['existing', 'created']);
});

test('merging a created character replaces an existing copy instead of duplicating it', () => {
    const original = character('created', 2);
    const updated = { ...original, slotNo: 0, name: 'Updated' };
    const account = accountWithCreatedCharacter(
        session([character('other', 1), original]),
        updated,
    );

    assert.deepEqual(account?.characters.map((entry) => [entry.id, entry.name]), [
        ['created', 'Updated'],
        ['other', 'other'],
    ]);
});
