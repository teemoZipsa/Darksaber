import { strict as assert } from 'node:assert';
import test from 'node:test';
import { i18n } from '../../src/i18n/LanguageManager';
import {
    TUTORIAL_GRID,
    TUTORIAL_STEPS,
    type TutorialAction,
} from '../../src/ui/react/tutorial/tutorialData';

const ALL_ACTIONS: TutorialAction[] = [
    'selectSelf',
    'chooseMove',
    'moveToTile',
    'toggleStatus',
    'chooseAttack',
    'attackTarget',
    'chooseRest',
    'chooseMagic',
    'castMagic',
    'chooseOrder',
    'pressFunctionKey',
    'toggleAlliance',
];

const STATIC_TUTORIAL_KEYS = [
    'tutorial.title',
    'tutorial.skip',
    'tutorial.next',
    'tutorial.goTown',
    'tutorial.stageLabel',
    'tutorial.actionsLabel',
    'tutorial.commander',
    'tutorial.defaultName',
    'tutorial.class',
    'tutorial.progressLabel',
    'tutorial.hud.status',
    'tutorial.hud.allianceOn',
    'tutorial.hud.allianceOff',
    'tutorial.action.move',
    'tutorial.action.attack',
    'tutorial.action.rest',
    'tutorial.action.magic',
    'tutorial.action.order',
    'tutorial.status.hp',
    'tutorial.status.mp',
    'tutorial.status.atb',
    'tutorial.mercenaryMode',
    'tutorial.mercenaryManual',
    'tutorial.mercenaryGuard',
    'tutorial.actor.mentor',
    'tutorial.actor.self',
    'tutorial.actor.monster',
    'tutorial.actor.spellTarget',
    'tutorial.actor.mercenaryA',
    'tutorial.actor.mercenaryB',
];

test('intro tutorial steps have stable ids, valid gates, and grid-safe focuses', () => {
    assert.ok(TUTORIAL_STEPS.length > 0);

    const ids = new Set<string>();
    const usedActions = new Set<TutorialAction>();
    for (const step of TUTORIAL_STEPS) {
        assert.equal(ids.has(step.id), false, `duplicate tutorial step id: ${step.id}`);
        ids.add(step.id);
        assert.ok(step.textKey.startsWith('tutorial.step.'), `${step.id} has an invalid text key`);

        if (step.requiredAction) {
            usedActions.add(step.requiredAction);
            assert.ok(step.promptKey, `${step.id} requires an action but has no prompt`);
        }

        if (step.focus?.kind === 'tile') {
            assert.ok(step.focus.x >= 0 && step.focus.x < TUTORIAL_GRID.columns, `${step.id} focus x is out of bounds`);
            assert.ok(step.focus.y >= 0 && step.focus.y < TUTORIAL_GRID.rows, `${step.id} focus y is out of bounds`);
        }
    }

    assert.deepEqual([...usedActions].sort(), [...ALL_ACTIONS].sort());
    const finalStep = TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1];
    assert.equal(finalStep.id, 'finale_to_town');
    assert.equal(finalStep.requiredAction, undefined);
});

test('intro tutorial i18n keys exist in both supported languages', () => {
    const keys = new Set(STATIC_TUTORIAL_KEYS);
    for (const step of TUTORIAL_STEPS) {
        keys.add(step.textKey);
        keys.add(`tutorial.chapter.${step.chapter}`);
        if (step.promptKey) keys.add(step.promptKey);
    }

    for (const lang of ['ko', 'en'] as const) {
        const dict = i18n.strings[lang] as Record<string, string>;
        for (const key of keys) {
            assert.ok(dict[key], `${lang} is missing ${key}`);
            assert.notEqual(dict[key], key, `${lang} leaks key ${key}`);
        }
    }
});
