import type { PlayerData } from './PlayerData';
import { BURGOS_CASTLE_DUNGEON_ID } from './MonsterCatalog';
import type { WorldRaidSession } from '../engine/world/WorldRaidSession';

export type StoryQuestStatus = 'active' | 'objectiveComplete' | 'completed';

export interface StoryQuestDefinition {
    id: string;
    episode: number;
    titleKey: string;
    summaryKey: string;
    objectiveKey: string;
    dungeonId: string;
    rewardItemId: string;
}

export interface StoryQuestView {
    quest: StoryQuestDefinition;
    status: StoryQuestStatus;
    rewardOwned: boolean;
}

export const MAIN_QUEST_EPISODE_01_ID = 'main:episode_01_burgos';
export const QUEST_BOMB_ITEM_ID = 'quest_bomb';

export const STORY_QUESTS: StoryQuestDefinition[] = [
    {
        id: MAIN_QUEST_EPISODE_01_ID,
        episode: 1,
        titleKey: 'story.ep01.title',
        summaryKey: 'story.ep01.summary',
        objectiveKey: 'story.ep01.objective',
        dungeonId: BURGOS_CASTLE_DUNGEON_ID,
        rewardItemId: QUEST_BOMB_ITEM_ID,
    },
];

export function getStoryQuestViews(
    playerData: PlayerData,
    raidSession: Pick<WorldRaidSession, 'isDungeonCleared'> | null
): StoryQuestView[] {
    return STORY_QUESTS.map((quest) => {
        const completed = playerData.isCleared(quest.id);
        const objectiveComplete = !completed && (raidSession?.isDungeonCleared(quest.dungeonId) ?? false);
        return {
            quest,
            status: completed ? 'completed' : objectiveComplete ? 'objectiveComplete' : 'active',
            rewardOwned: playerData.hasQuestItem(quest.rewardItemId),
        };
    });
}
