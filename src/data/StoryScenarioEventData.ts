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
    fieldEvents: StoryScenarioFieldEvent[];
    bossDefeat: StoryScenarioEventStep[];
}

export interface StoryScenarioFieldEvent {
    id: string;
    originalSource: string;
    originalEventId: string;
    trigger: string;
    triggerTiles: TilePoint[];
    runtimeFlag?: string;
    questItemId?: string;
    steps: StoryScenarioEventStep[];
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
            { kind: 'focus', target: { x: 13, y: 9 }, labelKey: 'story.event.ep01.focus.ambush' },
            {
                kind: 'dialogue',
                speakerId: 'hero',
                speakerNameKey: 'story.event.speaker.hero',
                textKey: 'story.event.ep01.dialogue.04',
                focus: { x: 13, y: 9 },
            },
            { kind: 'focus', target: { x: 30, y: 9 }, labelKey: 'story.event.ep01.focus.throne' },
            {
                kind: 'dialogue',
                speakerId: 'isrant',
                speakerNameKey: 'story.event.speaker.isrant',
                textKey: 'story.event.ep01.dialogue.05',
                focus: { x: 30, y: 9 },
            },
            {
                kind: 'dialogue',
                speakerId: 'kisra',
                speakerNameKey: 'story.event.speaker.kisra',
                textKey: 'story.event.ep01.dialogue.06',
                focus: { x: 30, y: 9 },
            },
            {
                kind: 'dialogue',
                speakerId: 'isrant',
                speakerNameKey: 'story.event.speaker.isrant',
                textKey: 'story.event.ep01.dialogue.07',
                focus: { x: 30, y: 9 },
            },
            { kind: 'focus', target: { x: 4, y: 9 }, labelKey: 'story.event.ep01.focus.party' },
            {
                kind: 'dialogue',
                speakerId: 'hero',
                speakerNameKey: 'story.event.speaker.hero',
                textKey: 'story.event.ep01.dialogue.08',
                focus: { x: 4, y: 9 },
            },
            { kind: 'focus', target: { x: 30, y: 9 }, labelKey: 'story.event.ep01.focus.throne' },
            {
                kind: 'dialogue',
                speakerId: 'kisra',
                speakerNameKey: 'story.event.speaker.kisra',
                textKey: 'story.event.ep01.dialogue.02',
                focus: { x: 30, y: 9 },
            },
            { kind: 'combatStart', labelKey: 'story.event.ep01.combatStart', focus: { x: 13, y: 9 } },
        ],
        fieldEvents: [
            {
                id: 'burgos_key_handoff',
                originalSource: 'MAP/01set.arc:01.evt',
                originalEventId: 'EVENT 12',
                trigger: 'CHARDEAD survivor/key holder near throne approach',
                triggerTiles: [{ x: 25, y: 9 }],
                runtimeFlag: 'burgos_key',
                questItemId: 'quest_burgos_key',
                steps: [
                    {
                        kind: 'dialogue',
                        speakerId: 'hero',
                        speakerNameKey: 'story.event.speaker.hero',
                        textKey: 'story.event.ep01.field.key.01',
                        focus: { x: 25, y: 9 },
                    },
                    {
                        kind: 'dialogue',
                        speakerId: 'survivor',
                        speakerNameKey: 'story.event.speaker.burgosSurvivor',
                        textKey: 'story.event.ep01.field.key.02',
                        focus: { x: 25, y: 9 },
                    },
                    {
                        kind: 'dialogue',
                        speakerId: 'hero',
                        speakerNameKey: 'story.event.speaker.hero',
                        textKey: 'story.event.ep01.field.key.03',
                        focus: { x: 25, y: 9 },
                    },
                    {
                        kind: 'dialogue',
                        speakerId: 'survivor',
                        speakerNameKey: 'story.event.speaker.burgosSurvivor',
                        textKey: 'story.event.ep01.field.key.04',
                        focus: { x: 25, y: 9 },
                    },
                    { kind: 'objective', labelKey: 'story.event.ep01.field.key.result', focus: { x: 25, y: 9 } },
                ],
            },
            {
                id: 'cain_son_relic',
                originalSource: 'MAP/01set.arc:01.evt',
                originalEventId: 'EVENT 13',
                trigger: 'DUTY_STEP_TRUE 1 1 and CHARDEAD survivor',
                triggerTiles: [{ x: 9, y: 12 }],
                runtimeFlag: 'cain_necklace',
                questItemId: 'quest_cain_necklace',
                steps: [
                    {
                        kind: 'dialogue',
                        speakerId: 'hero',
                        speakerNameKey: 'story.event.speaker.hero',
                        textKey: 'story.event.ep01.field.cain.01',
                        focus: { x: 9, y: 12 },
                    },
                    {
                        kind: 'dialogue',
                        speakerId: 'cainSon',
                        speakerNameKey: 'story.event.speaker.cainSon',
                        textKey: 'story.event.ep01.field.cain.02',
                        focus: { x: 9, y: 12 },
                    },
                    {
                        kind: 'dialogue',
                        speakerId: 'hero',
                        speakerNameKey: 'story.event.speaker.hero',
                        textKey: 'story.event.ep01.field.cain.03',
                        focus: { x: 9, y: 12 },
                    },
                    {
                        kind: 'dialogue',
                        speakerId: 'cainSon',
                        speakerNameKey: 'story.event.speaker.cainSon',
                        textKey: 'story.event.ep01.field.cain.04',
                        focus: { x: 9, y: 12 },
                    },
                    {
                        kind: 'dialogue',
                        speakerId: 'cainSon',
                        speakerNameKey: 'story.event.speaker.cainSon',
                        textKey: 'story.event.ep01.field.cain.05',
                        focus: { x: 9, y: 12 },
                    },
                    { kind: 'objective', labelKey: 'story.event.ep01.field.cain.result', focus: { x: 9, y: 12 } },
                    {
                        kind: 'dialogue',
                        speakerId: 'hero',
                        speakerNameKey: 'story.event.speaker.hero',
                        textKey: 'story.event.ep01.field.cain.06',
                        focus: { x: 9, y: 12 },
                    },
                ],
            },
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
