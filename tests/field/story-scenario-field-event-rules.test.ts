import test from 'node:test';
import assert from 'node:assert/strict';
import { getStoryScenarioEventSequence } from '../../src/data/StoryScenarioEventData';
import {
    doesStoryScenarioFieldEventRandomPass,
    getStoryScenarioFieldEventRequiredItems,
    getStoryScenarioFieldEventRuleSummary,
    getStoryScenarioFieldEventTrapDamage,
} from '../../src/raid/StoryScenarioFieldEventRules';

test('shared story field event rules resolve USEITEM requirements', () => {
    const sequence = getStoryScenarioEventSequence('skeria_2');
    const event = sequence?.fieldEvents.find((candidate) => candidate.id === 'skeria_2_shaman_exchange');
    assert.ok(event);

    assert.deepEqual(getStoryScenarioFieldEventRuleSummary(event).requiredOriginalItemIds, [397]);
    assert.deepEqual(
        getStoryScenarioFieldEventRequiredItems(event).map((item) => item.id),
        ['orig_story_0397_yellow_flower']
    );
});

test('shared story field event rules evaluate RANDOM chance boundaries', () => {
    const sequence = getStoryScenarioEventSequence('oasis');
    const event = sequence?.fieldEvents.find((candidate) => candidate.id === 'oasis_gold_chest_01');
    assert.ok(event);

    assert.equal(getStoryScenarioFieldEventRuleSummary(event).randomChance, 50);
    assert.equal(doesStoryScenarioFieldEventRandomPass(event, () => 0.49), true);
    assert.equal(doesStoryScenarioFieldEventRandomPass(event, () => 0.50), false);
});

test('shared story field event rules calculate MAGIC trap damage without killing the actor', () => {
    const sequence = getStoryScenarioEventSequence('valhalla_plain');
    const event = sequence?.fieldEvents.find((candidate) => candidate.id === 'valhalla_trap_50');
    assert.ok(event);

    const summary = getStoryScenarioFieldEventRuleSummary(event);
    assert.deepEqual(summary.magicCodes, [803]);
    assert.equal(getStoryScenarioFieldEventTrapDamage(event, 100, 100), 20);
    assert.equal(getStoryScenarioFieldEventTrapDamage(event, 5, 100), 4);
});
