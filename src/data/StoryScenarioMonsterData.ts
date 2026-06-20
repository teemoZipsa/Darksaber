import {
    BURGOS_BOSS_MONSTER_ID,
    BURGOS_CASTLE_DUNGEON_ID,
    BURGOS_GUARD_MONSTER_ID,
    ZAMORA_FENRIS_BOSS_MONSTER_ID,
    ZAMORA_FORTRESS_DUNGEON_ID,
    ZAMORA_GUARD_MONSTER_ID,
    type MonsterId,
} from './MonsterCatalog';
import type { StoryScenarioDefinition } from './StoryScenarioData';
import type { TilePoint } from '../field/FieldPathing';
import { getOriginalLateStoryFact } from './OriginalLateStoryFacts';

export interface StoryScenarioMonsterLayout {
    bossMonsterId?: MonsterId;
    guardMonsterIds: MonsterId[];
    guardOffsets?: TilePoint[];
    bossOffset?: TilePoint;
}

function repeatGuardRoster(ids: readonly MonsterId[], count: number): MonsterId[] {
    return Array.from({ length: count }, (_, index) => ids[index % ids.length]);
}

function getOriginalLateStoryDungeonId(episode: number): string {
    return getOriginalLateStoryFact(episode).dungeonId;
}

function repeatOriginalLateStoryGuardRoster(episode: number, ids: readonly MonsterId[]): MonsterId[] {
    return repeatGuardRoster(ids, getOriginalLateStoryFact(episode).guardAreas.length);
}

export const STORY_SCENARIO_MONSTER_LAYOUTS = {
    [BURGOS_CASTLE_DUNGEON_ID]: {
        bossMonsterId: BURGOS_BOSS_MONSTER_ID,
        guardMonsterIds: [BURGOS_GUARD_MONSTER_ID],
        guardOffsets: [{ x: 1, y: -1 }, { x: 1, y: 1 }, { x: 3, y: -1 }, { x: 3, y: 1 }],
        bossOffset: { x: 5, y: 0 },
    },
    [ZAMORA_FORTRESS_DUNGEON_ID]: { bossMonsterId: ZAMORA_FENRIS_BOSS_MONSTER_ID, guardMonsterIds: [ZAMORA_GUARD_MONSTER_ID] },
    etna_volcano: { bossMonsterId: '466R', guardMonsterIds: ['215R', '224R', '225R'] },
    arcadia_plain: { bossMonsterId: '458R', guardMonsterIds: ['313R', '314R', '458R'] },
    cacaora_highland: { bossMonsterId: '315R', guardMonsterIds: ['317R', '453R', '463R'] },
    remote_village: { bossMonsterId: '311R', guardMonsterIds: ['303R', '313R', '458R'] },
    sagrajas_temple: { bossMonsterId: '467R', guardMonsterIds: ['307R', '353R', '467R'] },
    sagunto_port: { bossMonsterId: '634R', guardMonsterIds: ['635R', '637R', '639R'] },
    sicilio_island: { bossMonsterId: '634R', guardMonsterIds: ['634R', '635R', '463R'] },
    dalai_lake: { bossMonsterId: '216R', guardMonsterIds: ['214R', '216R', '462R'] },
    oasis: { bossMonsterId: '467R', guardMonsterIds: ['458R', '462R', '467R'] },
    pyramid_front: {
        bossMonsterId: '454R',
        guardMonsterIds: [
            '354R', '354R', '354R', '354R',
            '458R', '458R', '458R', '458R',
            '462R', '462R', '462R', '462R', '462R', '462R',
            '454R', '454R', '454R',
        ],
        guardOffsets: [
            { x: -5, y: 5 }, { x: -10, y: 5 }, { x: 10, y: 5 }, { x: 5, y: 5 },
            { x: -5, y: -2 }, { x: -10, y: -2 }, { x: 16, y: -2 }, { x: 10, y: -2 },
            { x: -5, y: -9 }, { x: -10, y: -9 }, { x: -16, y: -9 }, { x: 16, y: -9 }, { x: 10, y: -9 }, { x: 5, y: -9 },
            { x: 0, y: 4 }, { x: 0, y: -3 }, { x: 0, y: -10 },
        ],
    },
    pyramid_inside: { bossMonsterId: '466R', guardMonsterIds: ['354R', '466R', '467R'] },
    skeria: { bossMonsterId: '634R', guardMonsterIds: ['634R', '635R', '637R'] },
    skeria_2: { bossMonsterId: '467R', guardMonsterIds: ['467R', '638R', '639R'] },
    valhalla_plain: { bossMonsterId: '638R', guardMonsterIds: ['636R', '637R', '638R'] },
    airship: { guardMonsterIds: ['216R', '634R'] },
    ament_gate: { bossMonsterId: '638R', guardMonsterIds: ['634R', '636R', '639R'] },
    ament_1f: { bossMonsterId: '636R', guardMonsterIds: ['636R', '637R', '638R'] },
    ament_2f: { bossMonsterId: '638R', guardMonsterIds: ['636R', '638R', '639R'] },
    nergal_castle: { bossMonsterId: '733R', guardMonsterIds: ['729R', '730R', '731R', '732R'] },
    flame_castle: { bossMonsterId: '730R', guardMonsterIds: ['215R', '224R', '225R', '307R'] },
    [getOriginalLateStoryDungeonId(23)]: { bossMonsterId: '731R', guardMonsterIds: repeatOriginalLateStoryGuardRoster(23, ['729R', '730R', '732R', '733R']) },
    [getOriginalLateStoryDungeonId(24)]: { bossMonsterId: '732R', guardMonsterIds: repeatOriginalLateStoryGuardRoster(24, ['729R', '730R', '731R', '733R']) },
    [getOriginalLateStoryDungeonId(25)]: { bossMonsterId: '733R', guardMonsterIds: repeatOriginalLateStoryGuardRoster(25, ['729R', '730R', '731R', '732R']) },
    [getOriginalLateStoryDungeonId(26)]: { bossMonsterId: '730R', guardMonsterIds: repeatOriginalLateStoryGuardRoster(26, ['729R', '731R', '732R']) },
    [getOriginalLateStoryDungeonId(27)]: { bossMonsterId: '731R', guardMonsterIds: repeatOriginalLateStoryGuardRoster(27, ['729R', '730R', '732R']) },
    [getOriginalLateStoryDungeonId(28)]: { bossMonsterId: '748R', guardMonsterIds: repeatOriginalLateStoryGuardRoster(28, ['729R', '730R', '750R']) },
    [getOriginalLateStoryDungeonId(29)]: { bossMonsterId: '749R', guardMonsterIds: repeatOriginalLateStoryGuardRoster(29, ['729R', '731R', '750R']) },
    [getOriginalLateStoryDungeonId(30)]: { bossMonsterId: '750R', guardMonsterIds: repeatOriginalLateStoryGuardRoster(30, ['729R', '731R', '749R']) },
    [getOriginalLateStoryDungeonId(31)]: { bossMonsterId: '751R', guardMonsterIds: repeatOriginalLateStoryGuardRoster(31, ['729R', '750R', '752R']) },
} satisfies Record<string, StoryScenarioMonsterLayout>;

export function getStoryScenarioMonsterLayout(scenario: StoryScenarioDefinition): StoryScenarioMonsterLayout {
    return STORY_SCENARIO_MONSTER_LAYOUTS[scenario.dungeonId as keyof typeof STORY_SCENARIO_MONSTER_LAYOUTS] ?? {
        bossMonsterId: undefined,
        guardMonsterIds: ['303R', '313R', '434R'],
    };
}
