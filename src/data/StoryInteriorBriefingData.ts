import { BURGOS_CASTLE_DUNGEON_ID } from './MonsterCatalog';

export const STORY_INTERIOR_BRIEFING_LINE_KEYS: Readonly<Record<string, readonly string[]>> = {
    [BURGOS_CASTLE_DUNGEON_ID]: [
        'story.ep01.briefing.mainObjective',
        'story.ep01.briefing.survivalRule',
        'story.ep01.briefing.sideObjective',
    ],
};

export function getStoryInteriorBriefingLineKeys(dungeonId: string | null): string[] | undefined {
    if (!dungeonId) return undefined;
    const lines = STORY_INTERIOR_BRIEFING_LINE_KEYS[dungeonId];
    return lines ? [...lines] : undefined;
}
