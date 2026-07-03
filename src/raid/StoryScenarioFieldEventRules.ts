import {
    getItemDefByOriginalGetItemId,
    type ItemDef,
} from '../data/ItemDB';
import {
    getStoryScenarioTrapMagicDamage,
    getStoryScenarioTriggerMagicCodes,
    getStoryScenarioTriggerRandomChance,
    getStoryScenarioTriggerUseItemIds,
    type StoryScenarioFieldEvent,
} from '../data/StoryScenarioEventData';

export interface StoryScenarioFieldEventRuleSummary {
    requiredOriginalItemIds: number[];
    randomChance: number | null;
    magicCodes: number[];
}

export function getStoryScenarioFieldEventRuleSummary(event: StoryScenarioFieldEvent): StoryScenarioFieldEventRuleSummary {
    return {
        requiredOriginalItemIds: getStoryScenarioTriggerUseItemIds(event.trigger),
        randomChance: getStoryScenarioTriggerRandomChance(event.trigger),
        magicCodes: getStoryScenarioTriggerMagicCodes(event.trigger),
    };
}

export function getStoryScenarioFieldEventRequiredItems(event: StoryScenarioFieldEvent): ItemDef[] {
    return getStoryScenarioFieldEventRuleSummary(event).requiredOriginalItemIds
        .map((originalItemId) => getItemDefByOriginalGetItemId(originalItemId))
        .filter((item): item is ItemDef => Boolean(item));
}

export function doesStoryScenarioFieldEventRandomPass(
    event: StoryScenarioFieldEvent,
    rollRandom: () => number
): boolean {
    const chance = getStoryScenarioFieldEventRuleSummary(event).randomChance;
    if (chance === null || chance >= 100) return true;
    if (chance <= 0) return false;
    return rollRandom() * 100 < chance;
}

export function getStoryScenarioFieldEventTrapDamage(
    event: StoryScenarioFieldEvent,
    currentHp: number,
    maxHp: number
): number {
    const magicCodes = getStoryScenarioFieldEventRuleSummary(event).magicCodes;
    if (magicCodes.length === 0 || currentHp <= 1) return 0;

    const effectiveMaxHp = Math.max(maxHp, currentHp, 1);
    const rawDamage = magicCodes.reduce((sum, magicCode) => sum + getStoryScenarioTrapMagicDamage(magicCode, effectiveMaxHp), 0);
    return Math.max(0, Math.min(currentHp - 1, rawDamage));
}
