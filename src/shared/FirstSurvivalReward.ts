/**
 * First-survival bonus: a one-time gold reward granted the first time a
 * character successfully extracts from a raid. The marker lives in the
 * character save's `questState.completedQuestIds` (per-character scope), so
 * each new character earns it once.
 *
 * For network raids the server is authoritative and grants this in the
 * survival save flush ({@link file://server/WorldSessionSaveState.ts}); the
 * client only grants it for local/offline raids.
 */
export const FIRST_SURVIVAL_QUEST_ID = 'quest:first_survival';
export const FIRST_SURVIVAL_GOLD_REWARD = 200;
