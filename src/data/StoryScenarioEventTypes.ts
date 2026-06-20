import type { TilePoint } from '../field/FieldPathing';

export type StoryScenarioEventStep =
    | { kind: 'focus'; target: TilePoint; labelKey: string; durationMs?: number }
    | { kind: 'moveActor'; actorId: string; target: TilePoint; focus?: TilePoint; durationMs?: number }
    | { kind: 'dialogue'; speakerId: string; speakerNameKey: string; textKey: string; focus?: TilePoint; durationMs?: number }
    | { kind: 'combatStart'; labelKey: string; focus?: TilePoint; durationMs?: number }
    | { kind: 'objective'; labelKey: string; focus?: TilePoint; durationMs?: number };

const DEFAULT_STORY_STEP_DURATION_MS: Record<StoryScenarioEventStep['kind'], number> = {
    focus: 450,
    moveActor: 700,
    dialogue: 1400,
    combatStart: 900,
    objective: 800,
};

export const LATE_STORY_STEP_DURATION_MS = {
    focus: 650,
    moveActor: 700,
    dialogue: 1600,
    combatStart: 900,
    objective: 900,
    cache: 700,
} as const;

export function getStoryScenarioEventStepDurationMs(step: StoryScenarioEventStep): number {
    if (step.durationMs !== undefined) return Math.max(0, Math.floor(step.durationMs));
    return DEFAULT_STORY_STEP_DURATION_MS[step.kind];
}

export function getStoryScenarioPresentationDurationMs(steps: readonly StoryScenarioEventStep[]): number {
    return steps.reduce((sum, step) => sum + getStoryScenarioEventStepDurationMs(step), 0);
}

export function getStoryScenarioTriggerMagicCodes(trigger: string): number[] {
    return [...trigger.matchAll(/\bMAGIC\s+0*(\d+)\b/g)].map((match) => Number(match[1]));
}

export function getStoryScenarioTriggerRandomChance(trigger: string): number | null {
    const match = trigger.match(/\bRANDOM\s+0*(\d+)\b/);
    if (!match) return null;
    return Math.max(0, Math.min(100, Number(match[1])));
}

export function getStoryScenarioTriggerUseItemIds(trigger: string): number[] {
    return [...trigger.matchAll(/\bUSEITEM\s+0*(\d+)\b/g)].map((match) => Number(match[1]));
}

export function getStoryScenarioTrapMagicDamage(magicCode: number, maxHp: number): number {
    const tierDigit = Number(String(magicCode).slice(-1));
    const tier = Number.isFinite(tierDigit) && tierDigit > 0 ? tierDigit : 1;
    return Math.max(1, Math.floor(Math.max(1, maxHp) * 0.08) + tier * 4);
}

export interface StoryScenarioEventSequence {
    dungeonId: string;
    originalSources: {
        sceneScript: string;
        globalScript: string;
        mapFiles: string[];
        setArcMembers?: string[];
    };
    objectiveRuntimeFlag?: string;
    markers?: StoryScenarioMarker[];
    entry: StoryScenarioEventStep[];
    fieldEvents: StoryScenarioFieldEvent[];
    enemyDefeatEvents?: StoryScenarioEnemyDefeatEvent[];
    bossDefeatEvent?: StoryScenarioBossDefeatEvent;
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
    scope?: 'player' | 'shared';
    triggerTiles: TilePoint[];
    runtimeFlag?: string;
    questItemId?: string;
    markerLabelKey?: string;
    markerKind?: 'person' | 'chest';
    rewards?: StoryScenarioFieldEventReward[];
    completesObjective?: boolean;
    steps: StoryScenarioEventStep[];
}

export interface StoryScenarioEnemyDefeatEvent {
    id: string;
    originalSource: string;
    originalEventId: string;
    trigger: string;
    enemyId: string;
    scenarioEnemyIndex?: number;
    originalCharId?: number;
    steps: StoryScenarioEventStep[];
}

export interface StoryScenarioBossDefeatEvent {
    id: string;
    originalSource: string;
    originalEventId: string;
    trigger: string;
    runtimeFlag: string;
    rewards?: StoryScenarioFieldEventReward[];
}
