import STORY_SCENARIOS_JSON from './content/story-scenarios.json';
import type { LandmarkSpriteId } from '../map/TileAssetManager';

export type StoryQuestRewardData =
    | { type: 'none' }
    | { type: 'questItem'; itemId: string }
    | { type: 'inventoryItem'; itemId: string }
    | { type: 'companion'; companionId: string; classId: string; nameKey: string }
    | { type: 'bundle'; rewards: StoryQuestRewardData[] };

export type StoryScenarioMissionKind = 'field' | 'soloInterior' | 'vehicle';

export interface StoryScenarioDefinition {
    episode: number;
    questId: string;
    dungeonId: string;
    dungeonNameKr: string;
    dungeonNameEn: string;
    chunkX: number;
    chunkY: number;
    sprite: LandmarkSpriteId;
    bossName: string | null;
    bossLevel: number;
    bossColor: string;
    guardLevel: number;
    guardCount: number;
    missionKind: StoryScenarioMissionKind;
    reward: StoryQuestRewardData;
}

const STORY_SCENARIO_CONTENT = STORY_SCENARIOS_JSON as StoryScenarioDefinition[];

export const STORY_SCENARIOS: StoryScenarioDefinition[] = STORY_SCENARIO_CONTENT;

export function getStoryScenarioByDungeonId(dungeonId: string): StoryScenarioDefinition | null {
    return STORY_SCENARIOS.find((scenario) => scenario.dungeonId === dungeonId) ?? null;
}

export function isSoloInteriorStoryScenario(scenario: StoryScenarioDefinition): boolean {
    return scenario.missionKind === 'soloInterior';
}
