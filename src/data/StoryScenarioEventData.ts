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
    objectiveRuntimeFlag?: string;
    markers?: StoryScenarioMarker[];
    entry: StoryScenarioEventStep[];
    fieldEvents: StoryScenarioFieldEvent[];
    bossDefeat: StoryScenarioEventStep[];
}

export interface StoryScenarioMarker {
    id: string;
    tile: TilePoint;
    markerLabelKey: string;
    markerKind?: 'person' | 'chest';
    hideWhenRuntimeFlag?: string;
}

export type StoryScenarioFieldEventReward =
    | { type: 'gold'; amount: number }
    | { type: 'item'; itemId: string; originalItemId?: number };

export interface StoryScenarioFieldEvent {
    id: string;
    originalSource: string;
    originalEventId: string;
    trigger: string;
    triggerTiles: TilePoint[];
    runtimeFlag?: string;
    questItemId?: string;
    markerLabelKey?: string;
    markerKind?: 'person' | 'chest';
    rewards?: StoryScenarioFieldEventReward[];
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
                markerLabelKey: 'story.event.ep01.field.key.marker',
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
                markerLabelKey: 'story.event.ep01.field.cain.marker',
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
    {
        dungeonId: 'zamora_fortress',
        originalSources: {
            sceneScript: 'Wlib/scene2.lsc',
            globalScript: 'Glib/gscene2.lsc',
            mapFiles: ['MAP/02.mrc', 'MAP/02t.mrc', 'MAP/02hmap.BMP', 'MAP/02set.arc'],
        },
        objectiveRuntimeFlag: 'princess_rescued',
        markers: [
            {
                id: 'zamora_princess_captive',
                tile: { x: 28, y: 9 },
                markerLabelKey: 'story.event.ep02.princess.marker.captive',
                markerKind: 'person',
                hideWhenRuntimeFlag: 'princess_rescued',
            },
        ],
        entry: [
            { kind: 'focus', target: { x: 27, y: 10 }, labelKey: 'story.event.ep02.focus.chamber' },
            {
                kind: 'dialogue',
                speakerId: 'fenris',
                speakerNameKey: 'story.event.speaker.fenris',
                textKey: 'story.event.ep02.dialogue.01',
                focus: { x: 27, y: 10 },
            },
            {
                kind: 'dialogue',
                speakerId: 'princess',
                speakerNameKey: 'story.event.speaker.princess',
                textKey: 'story.event.ep02.dialogue.02',
                focus: { x: 27, y: 10 },
            },
            {
                kind: 'dialogue',
                speakerId: 'fenris',
                speakerNameKey: 'story.event.speaker.fenris',
                textKey: 'story.event.ep02.dialogue.03',
                focus: { x: 27, y: 10 },
            },
            {
                kind: 'dialogue',
                speakerId: 'princess',
                speakerNameKey: 'story.event.speaker.princess',
                textKey: 'story.event.ep02.dialogue.04',
                focus: { x: 27, y: 10 },
            },
            {
                kind: 'dialogue',
                speakerId: 'fenris',
                speakerNameKey: 'story.event.speaker.fenris',
                textKey: 'story.event.ep02.dialogue.05',
                focus: { x: 27, y: 10 },
            },
            {
                kind: 'dialogue',
                speakerId: 'princess',
                speakerNameKey: 'story.event.speaker.princess',
                textKey: 'story.event.ep02.dialogue.06',
                focus: { x: 27, y: 10 },
            },
            {
                kind: 'dialogue',
                speakerId: 'fenris',
                speakerNameKey: 'story.event.speaker.fenris',
                textKey: 'story.event.ep02.dialogue.07',
                focus: { x: 27, y: 10 },
            },
            { kind: 'focus', target: { x: 4, y: 10 }, labelKey: 'story.event.ep02.focus.party' },
            {
                kind: 'dialogue',
                speakerId: 'hero',
                speakerNameKey: 'story.event.speaker.hero',
                textKey: 'story.event.ep02.dialogue.08',
                focus: { x: 4, y: 10 },
            },
            {
                kind: 'dialogue',
                speakerId: 'princess',
                speakerNameKey: 'story.event.speaker.princess',
                textKey: 'story.event.ep02.dialogue.09',
                focus: { x: 27, y: 10 },
            },
            {
                kind: 'dialogue',
                speakerId: 'fenris',
                speakerNameKey: 'story.event.speaker.fenris',
                textKey: 'story.event.ep02.dialogue.10',
                focus: { x: 27, y: 10 },
            },
            {
                kind: 'dialogue',
                speakerId: 'hero',
                speakerNameKey: 'story.event.speaker.hero',
                textKey: 'story.event.ep02.dialogue.11',
                focus: { x: 4, y: 10 },
            },
            {
                kind: 'dialogue',
                speakerId: 'fenris',
                speakerNameKey: 'story.event.speaker.fenris',
                textKey: 'story.event.ep02.dialogue.12',
                focus: { x: 27, y: 10 },
            },
            { kind: 'combatStart', labelKey: 'story.event.ep02.combatStart', focus: { x: 27, y: 10 } },
        ],
        fieldEvents: [
            {
                id: 'zamora_gold_chest_01',
                originalSource: 'MAP/02set.arc:02.evt',
                originalEventId: 'EVENT 01',
                trigger: 'treasure chest GOLD 100',
                triggerTiles: [{ x: 11, y: 5 }],
                runtimeFlag: 'zamora_gold_chest_01',
                markerLabelKey: 'story.event.ep02.chest.marker',
                markerKind: 'chest',
                rewards: [{ type: 'gold', amount: 100 }],
                steps: [{ kind: 'objective', labelKey: 'story.event.ep02.chest.opened', focus: { x: 11, y: 5 } }],
            },
            {
                id: 'zamora_gold_chest_02',
                originalSource: 'MAP/02set.arc:02.evt',
                originalEventId: 'EVENT 02',
                trigger: 'treasure chest GOLD 100',
                triggerTiles: [{ x: 11, y: 15 }],
                runtimeFlag: 'zamora_gold_chest_02',
                markerLabelKey: 'story.event.ep02.chest.marker',
                markerKind: 'chest',
                rewards: [{ type: 'gold', amount: 100 }],
                steps: [{ kind: 'objective', labelKey: 'story.event.ep02.chest.opened', focus: { x: 11, y: 15 } }],
            },
            {
                id: 'zamora_gold_chest_03',
                originalSource: 'MAP/02set.arc:02.evt',
                originalEventId: 'EVENT 03',
                trigger: 'treasure chest GOLD 100',
                triggerTiles: [{ x: 20, y: 6 }],
                runtimeFlag: 'zamora_gold_chest_03',
                markerLabelKey: 'story.event.ep02.chest.marker',
                markerKind: 'chest',
                rewards: [{ type: 'gold', amount: 100 }],
                steps: [{ kind: 'objective', labelKey: 'story.event.ep02.chest.opened', focus: { x: 20, y: 6 } }],
            },
            {
                id: 'zamora_gold_chest_04',
                originalSource: 'MAP/02set.arc:02.evt',
                originalEventId: 'EVENT 04',
                trigger: 'treasure chest GOLD 100',
                triggerTiles: [{ x: 20, y: 14 }],
                runtimeFlag: 'zamora_gold_chest_04',
                markerLabelKey: 'story.event.ep02.chest.marker',
                markerKind: 'chest',
                rewards: [{ type: 'gold', amount: 100 }],
                steps: [{ kind: 'objective', labelKey: 'story.event.ep02.chest.opened', focus: { x: 20, y: 14 } }],
            },
            {
                id: 'zamora_item_chest_05',
                originalSource: 'MAP/02set.arc:02.evt',
                originalEventId: 'EVENT 05',
                trigger: 'treasure chest GETITEM 300',
                triggerTiles: [{ x: 9, y: 7 }],
                runtimeFlag: 'zamora_item_chest_05',
                markerLabelKey: 'story.event.ep02.chest.marker',
                markerKind: 'chest',
                rewards: [{ type: 'item', itemId: 'herb_common', originalItemId: 300 }],
                steps: [{ kind: 'objective', labelKey: 'story.event.ep02.chest.opened', focus: { x: 9, y: 7 } }],
            },
            {
                id: 'zamora_item_chest_06',
                originalSource: 'MAP/02set.arc:02.evt',
                originalEventId: 'EVENT 06',
                trigger: 'treasure chest GETITEM 300',
                triggerTiles: [{ x: 9, y: 13 }],
                runtimeFlag: 'zamora_item_chest_06',
                markerLabelKey: 'story.event.ep02.chest.marker',
                markerKind: 'chest',
                rewards: [{ type: 'item', itemId: 'herb_common', originalItemId: 300 }],
                steps: [{ kind: 'objective', labelKey: 'story.event.ep02.chest.opened', focus: { x: 9, y: 13 } }],
            },
            {
                id: 'zamora_item_chest_07',
                originalSource: 'MAP/02set.arc:02.evt',
                originalEventId: 'EVENT 07',
                trigger: 'treasure chest GETITEM 300',
                triggerTiles: [{ x: 24, y: 8 }],
                runtimeFlag: 'zamora_item_chest_07',
                markerLabelKey: 'story.event.ep02.chest.marker',
                markerKind: 'chest',
                rewards: [{ type: 'item', itemId: 'herb_common', originalItemId: 300 }],
                steps: [{ kind: 'objective', labelKey: 'story.event.ep02.chest.opened', focus: { x: 24, y: 8 } }],
            },
            {
                id: 'zamora_item_chest_08',
                originalSource: 'MAP/02set.arc:02.evt',
                originalEventId: 'EVENT 08',
                trigger: 'treasure chest GETITEM 300',
                triggerTiles: [{ x: 24, y: 12 }],
                runtimeFlag: 'zamora_item_chest_08',
                markerLabelKey: 'story.event.ep02.chest.marker',
                markerKind: 'chest',
                rewards: [{ type: 'item', itemId: 'herb_common', originalItemId: 300 }],
                steps: [{ kind: 'objective', labelKey: 'story.event.ep02.chest.opened', focus: { x: 24, y: 12 } }],
            },
        ],
        bossDefeat: [
            { kind: 'objective', labelKey: 'story.event.ep02.objective', focus: { x: 1, y: 10 } },
        ],
    },
];

export function getStoryScenarioEventSequence(dungeonId: string): StoryScenarioEventSequence | null {
    return STORY_SCENARIO_EVENT_SEQUENCES.find((sequence) => sequence.dungeonId === dungeonId) ?? null;
}
