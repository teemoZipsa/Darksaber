import test from 'node:test';
import assert from 'node:assert/strict';
import { Character } from '../../src/character/Character';
import { Player } from '../../src/entity/Player';
import type { FieldActor } from '../../src/field/FieldTypes';
import { i18n, t, type Language } from '../../src/i18n/LanguageManager';
import {
    runWorldEngineStartupFlow,
    type WorldEngineStartupFlowContext,
} from '../../src/engine/world/WorldEngineStartupFlow';
import type { Camera } from '../../src/engine/Camera';

class ImageStub {
    public src = '';
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
}

(globalThis as unknown as { Image: typeof ImageStub }).Image = ImageStub;

function makeActor(id: string, x: number, y: number): FieldActor {
    const character = new Character(id, id, 'infantry');
    return {
        id,
        character,
        entity: new Player(x, y),
        path: [],
        queuedIntent: null,
    };
}

function makeHarness(overrides: Partial<WorldEngineStartupFlowContext> = {}) {
    const calls: string[] = [];
    let player = new Player(0, 0);
    const camera = {
        followTile: (x: number, y: number) => calls.push(`follow:${x},${y}`),
        snapToTarget: () => calls.push('snap'),
    } as unknown as Camera;
    const context: WorldEngineStartupFlowContext = {
        camera,
        options: {},
        spawnPartyAtCurrentHub: () => calls.push('spawn-party'),
        getControlledActor: () => null,
        setPlayer: (nextPlayer) => {
            player = nextPlayer;
            calls.push(`set-player:${nextPlayer.gridX},${nextPlayer.gridY}`);
        },
        getPlayer: () => player,
        selectActor: (actorId) => calls.push(`select:${actorId ?? 'none'}`),
        startIntroTutorial: () => calls.push('start-tutorial'),
        hasStoredNetworkResumeToken: () => false,
        beginRaidFromCurrentHub: () => calls.push('begin-raid'),
        openCurrentHubTown: () => calls.push('open-town'),
        addCombatLog: (message) => calls.push(`log:${message}`),
        ...overrides,
    };
    return { calls, context };
}

test('world startup flow opens town when there is no tutorial or resume token', () => {
    const previousLang: Language = i18n.lang;
    i18n.lang = 'en';
    try {
        const actor = makeActor('hero', 3, 4);
        const { calls, context } = makeHarness({
            getControlledActor: () => actor,
        });

        runWorldEngineStartupFlow(context);

        assert.deepEqual(calls, [
            'spawn-party',
            'set-player:3,4',
            'select:hero',
            'open-town',
            `log:${t('field.log.townReady')}`,
            'follow:3,4',
            'snap',
        ]);
    } finally {
        i18n.lang = previousLang;
    }
});

test('world startup flow prefers intro tutorial over network resume', () => {
    const actor = makeActor('hero', 7, 8);
    const { calls, context } = makeHarness({
        options: { startIntroTutorial: true },
        getControlledActor: () => actor,
        hasStoredNetworkResumeToken: () => true,
    });

    runWorldEngineStartupFlow(context);

    assert.equal(calls.includes('start-tutorial'), true);
    assert.equal(calls.includes('begin-raid'), false);
    assert.equal(calls[calls.length - 2], 'follow:7,8');
    assert.equal(calls[calls.length - 1], 'snap');
});

test('world startup flow resumes network raid when a stored token exists', () => {
    const previousLang: Language = i18n.lang;
    i18n.lang = 'en';
    try {
        const { calls, context } = makeHarness({
            hasStoredNetworkResumeToken: () => true,
        });

        runWorldEngineStartupFlow(context);

        assert.equal(calls.includes('open-town'), false);
        assert.equal(calls.includes(`log:${t('mp.resumeAttempt')}`), true);
        assert.equal(calls.includes('begin-raid'), true);
        assert.equal(calls[calls.length - 2], 'follow:0,0');
        assert.equal(calls[calls.length - 1], 'snap');
    } finally {
        i18n.lang = previousLang;
    }
});
