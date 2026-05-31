import type { PlayerData } from './PlayerData';
import { STORY_SCENARIOS, type StoryQuestRewardData } from './StoryScenarioData';
import type { WorldRaidSession } from '../engine/world/WorldRaidSession';

export type StoryQuestStatus = 'active' | 'objectiveComplete' | 'completed';

export interface StoryQuestDefinition {
    id: string;
    episode: number;
    titleKey: string;
    summaryKey: string;
    objectiveKey: string;
    recommendedLevelKey?: string;
    enterLogKey: string;
    objectiveCompleteLogKey: string;
    dungeonId: string;
    bgmKey?: string;
    prerequisiteQuestId?: string;
    reward: StoryQuestReward;
}

export type StoryQuestReward = StoryQuestRewardData;

export type StoryCompanionReward = Extract<StoryQuestReward, { type: 'companion' }>;

export interface StoryQuestRewardView {
    reward: StoryQuestReward;
    owned: boolean;
}

export interface StoryQuestView {
    quest: StoryQuestDefinition;
    status: StoryQuestStatus;
    rewardView: StoryQuestRewardView;
}

export const MAIN_QUEST_EPISODE_01_ID = 'main:episode_01_burgos';
export const MAIN_QUEST_EPISODE_02_ID = 'main:episode_02_zamora';
export const QUEST_BOMB_ITEM_ID = 'quest_bomb';
export const STORY_CLERIC_EP02_ID = 'story_cleric_ep02';

export const STORY_QUESTS: StoryQuestDefinition[] = STORY_SCENARIOS.map((scenario, index) => ({
    id: scenario.questId,
    episode: scenario.episode,
    titleKey: `story.ep${String(scenario.episode).padStart(2, '0')}.title`,
    summaryKey: `story.ep${String(scenario.episode).padStart(2, '0')}.summary`,
    objectiveKey: `story.ep${String(scenario.episode).padStart(2, '0')}.objective`,
    recommendedLevelKey: `story.ep${String(scenario.episode).padStart(2, '0')}.recommendedLevel`,
    enterLogKey: `story.ep${String(scenario.episode).padStart(2, '0')}.enterDungeonLog`,
    objectiveCompleteLogKey: `story.ep${String(scenario.episode).padStart(2, '0')}.objectiveCompleteLog`,
    dungeonId: scenario.dungeonId,
    bgmKey: `bgm.story.episode${String(scenario.episode).padStart(2, '0')}`,
    prerequisiteQuestId: index > 0 ? STORY_SCENARIOS[index - 1].questId : undefined,
    reward: scenario.reward,
}));

export function getStoryQuestViews(
    playerData: PlayerData,
    raidSession: Pick<WorldRaidSession, 'isDungeonCleared'> | null
): StoryQuestView[] {
    return STORY_QUESTS.filter((quest) => isStoryQuestAvailable(quest, playerData)).map((quest) => {
        const completed = playerData.isCleared(quest.id);
        const objectiveComplete = !completed && (raidSession?.isDungeonCleared(quest.dungeonId) ?? false);
        return {
            quest,
            status: completed ? 'completed' : objectiveComplete ? 'objectiveComplete' : 'active',
            rewardView: {
                reward: quest.reward,
                owned: isStoryRewardOwned(quest.reward, playerData),
            },
        };
    });
}

export function getStoryQuestByDungeonId(dungeonId: string): StoryQuestDefinition | null {
    return STORY_QUESTS.find((quest) => quest.dungeonId === dungeonId) ?? null;
}

export function isStoryQuestAvailable(quest: StoryQuestDefinition, playerData: PlayerData): boolean {
    return !quest.prerequisiteQuestId || playerData.isCleared(quest.prerequisiteQuestId);
}

export function getStoryCompanionRewards(): StoryCompanionReward[] {
    return STORY_QUESTS.flatMap((quest) => getCompanionRewards(quest.reward));
}

export function isStoryRewardOwned(reward: StoryQuestReward, playerData: PlayerData): boolean {
    if (reward.type === 'none') return true;
    if (reward.type === 'questItem') return playerData.hasQuestItem(reward.itemId);
    if (reward.type === 'inventoryItem') return playerData.hasQuestItem(reward.itemId);
    if (reward.type === 'companion') return playerData.hasStoryCompanion(reward.companionId);
    return reward.rewards.every((entry) => isStoryRewardOwned(entry, playerData));
}

export function getCompanionRewards(reward: StoryQuestReward): StoryCompanionReward[] {
    if (reward.type === 'companion') return [reward];
    if (reward.type === 'bundle') return reward.rewards.flatMap(getCompanionRewards);
    return [];
}
