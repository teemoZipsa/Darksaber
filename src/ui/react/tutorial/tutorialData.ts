/**
 * Intro tutorial data for the character-creation handoff.
 *
 * This is a deliberately isolated teaching simulation. Its ranges, counters,
 * and outcomes must be kept in sync manually if the real WorldEngine combat
 * rules change; do not treat this file as live combat logic.
 */

export const TUTORIAL_GRID = {
    columns: 7,
    rows: 5,
} as const;

export type TutorialChapter =
    | 'intro'
    | 'menu'
    | 'move'
    | 'status'
    | 'attack'
    | 'rest'
    | 'magic'
    | 'orders'
    | 'functionKeys'
    | 'alliance'
    | 'finale';

export type TutorialAction =
    | 'selectSelf'
    | 'chooseMove'
    | 'moveToTile'
    | 'toggleStatus'
    | 'chooseAttack'
    | 'attackTarget'
    | 'chooseRest'
    | 'chooseMagic'
    | 'castMagic'
    | 'chooseOrder'
    | 'pressFunctionKey'
    | 'toggleAlliance';

export type TutorialActorId = 'self' | 'mentor' | 'monster' | 'spellTarget' | 'mercenaryA' | 'mercenaryB';
export type TutorialMenuActionId = 'move' | 'attack' | 'rest' | 'magic' | 'order';
export type TutorialHudId = 'status' | 'functionKeys' | 'alliance';

export type TutorialFocus =
    | { kind: 'tile'; x: number; y: number }
    | { kind: 'actor'; id: TutorialActorId }
    | { kind: 'action'; id: TutorialMenuActionId }
    | { kind: 'hud'; id: TutorialHudId };

export interface TutorialStep {
    id: string;
    chapter: TutorialChapter;
    textKey: string;
    promptKey?: string;
    requiredAction?: TutorialAction;
    focus?: TutorialFocus;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'intro_slow_battle',
        chapter: 'intro',
        textKey: 'tutorial.step.introSlowBattle',
        promptKey: 'tutorial.prompt.next',
    },
    {
        id: 'menu_select_self',
        chapter: 'menu',
        textKey: 'tutorial.step.menuSelectSelf',
        promptKey: 'tutorial.prompt.selectSelf',
        requiredAction: 'selectSelf',
        focus: { kind: 'actor', id: 'self' },
    },
    {
        id: 'menu_overview',
        chapter: 'menu',
        textKey: 'tutorial.step.menuOverview',
        promptKey: 'tutorial.prompt.next',
    },
    {
        id: 'move_choose',
        chapter: 'move',
        textKey: 'tutorial.step.moveChoose',
        promptKey: 'tutorial.prompt.chooseMove',
        requiredAction: 'chooseMove',
        focus: { kind: 'action', id: 'move' },
    },
    {
        id: 'move_target',
        chapter: 'move',
        textKey: 'tutorial.step.moveTarget',
        promptKey: 'tutorial.prompt.moveTarget',
        requiredAction: 'moveToTile',
        focus: { kind: 'tile', x: 3, y: 2 },
    },
    {
        id: 'status_meter',
        chapter: 'status',
        textKey: 'tutorial.step.statusMeter',
        promptKey: 'tutorial.prompt.toggleStatus',
        requiredAction: 'toggleStatus',
        focus: { kind: 'hud', id: 'status' },
    },
    {
        id: 'attack_choose',
        chapter: 'attack',
        textKey: 'tutorial.step.attackChoose',
        promptKey: 'tutorial.prompt.chooseAttack',
        requiredAction: 'chooseAttack',
        focus: { kind: 'action', id: 'attack' },
    },
    {
        id: 'attack_target',
        chapter: 'attack',
        textKey: 'tutorial.step.attackTarget',
        promptKey: 'tutorial.prompt.attackTarget',
        requiredAction: 'attackTarget',
        focus: { kind: 'actor', id: 'monster' },
    },
    {
        id: 'rest_recover',
        chapter: 'rest',
        textKey: 'tutorial.step.restRecover',
        promptKey: 'tutorial.prompt.chooseRest',
        requiredAction: 'chooseRest',
        focus: { kind: 'action', id: 'rest' },
    },
    {
        id: 'magic_choose',
        chapter: 'magic',
        textKey: 'tutorial.step.magicChoose',
        promptKey: 'tutorial.prompt.chooseMagic',
        requiredAction: 'chooseMagic',
        focus: { kind: 'action', id: 'magic' },
    },
    {
        id: 'magic_target',
        chapter: 'magic',
        textKey: 'tutorial.step.magicTarget',
        promptKey: 'tutorial.prompt.castMagic',
        requiredAction: 'castMagic',
        focus: { kind: 'actor', id: 'spellTarget' },
    },
    {
        id: 'orders_choose',
        chapter: 'orders',
        textKey: 'tutorial.step.ordersChoose',
        promptKey: 'tutorial.prompt.chooseOrder',
        requiredAction: 'chooseOrder',
        focus: { kind: 'action', id: 'order' },
    },
    {
        id: 'function_keys',
        chapter: 'functionKeys',
        textKey: 'tutorial.step.functionKeys',
        promptKey: 'tutorial.prompt.pressFunctionKey',
        requiredAction: 'pressFunctionKey',
        focus: { kind: 'hud', id: 'functionKeys' },
    },
    {
        id: 'alliance_toggle',
        chapter: 'alliance',
        textKey: 'tutorial.step.allianceToggle',
        promptKey: 'tutorial.prompt.toggleAlliance',
        requiredAction: 'toggleAlliance',
        focus: { kind: 'hud', id: 'alliance' },
    },
    {
        id: 'finale_to_town',
        chapter: 'finale',
        textKey: 'tutorial.step.finaleToTown',
        promptKey: 'tutorial.prompt.goTown',
    },
];
