import type { TilePoint } from '../field/FieldPathing';

export type StoryScenarioEventStep =
    | { kind: 'focus'; target: TilePoint; labelKey: string }
    | { kind: 'dialogue'; speakerId: string; speakerNameKey: string; textKey: string; focus?: TilePoint }
    | { kind: 'combatStart'; labelKey: string; focus?: TilePoint }
    | { kind: 'objective'; labelKey: string; focus?: TilePoint };

export interface StoryScenarioEventSequence {
    dungeonId: string;
    originalSources: {
        sceneScript: string;
        globalScript: string;
        mapFiles: string[];
    };
    entry: StoryScenarioEventStep[];
    bossDefeat: StoryScenarioEventStep[];
}

export const STORY_SCENARIO_EVENT_SEQUENCES: StoryScenarioEventSequence[] = [
    {
        dungeonId: 'burgos_castle',
        originalSources: {
            sceneScript: 'Wlib/scene1.lsc',
            globalScript: 'Glib/gscene1.lsc',
            mapFiles: ['MAP/01.mrc', 'MAP/01t.mrc', 'MAP/01hmap.BMP', 'MAP/01set.arc'],
        },
        entry: [
            { kind: 'focus', target: { x: 1, y: 9 }, labelKey: 'story.event.ep01.focus.gate' },
            {
                kind: 'dialogue',
                speakerId: 'hero',
                speakerNameKey: 'story.event.speaker.hero',
                textKey: 'story.event.ep01.dialogue.01',
                focus: { x: 4, y: 9 },
            },
            {
                kind: 'dialogue',
                speakerId: 'kisra',
                speakerNameKey: 'story.event.speaker.kisra',
                textKey: 'story.event.ep01.dialogue.02',
                focus: { x: 30, y: 9 },
            },
            { kind: 'combatStart', labelKey: 'story.event.ep01.combatStart', focus: { x: 13, y: 9 } },
        ],
        bossDefeat: [
            {
                kind: 'dialogue',
                speakerId: 'kisra',
                speakerNameKey: 'story.event.speaker.kisra',
                textKey: 'story.event.ep01.dialogue.03',
                focus: { x: 30, y: 9 },
            },
            { kind: 'objective', labelKey: 'story.event.ep01.objective', focus: { x: 1, y: 9 } },
        ],
    },
];

export function getStoryScenarioEventSequence(dungeonId: string): StoryScenarioEventSequence | null {
    return STORY_SCENARIO_EVENT_SEQUENCES.find((sequence) => sequence.dungeonId === dungeonId) ?? null;
}
