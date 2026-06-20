import { STORY_SCENARIO_EVENT_SEQUENCES } from './StoryScenarioEventSequences';
import type { StoryScenarioEventSequence } from './StoryScenarioEventTypes';

export * from './StoryScenarioEventTypes';
export { STORY_SCENARIO_EVENT_SEQUENCES } from './StoryScenarioEventSequences';

export function getStoryScenarioEventSequence(dungeonId: string): StoryScenarioEventSequence | null {
    return STORY_SCENARIO_EVENT_SEQUENCES.find((sequence) => sequence.dungeonId === dungeonId) ?? null;
}
