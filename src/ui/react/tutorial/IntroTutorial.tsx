import { useState } from 'react';
import type { CSSProperties } from 'react';
import { AudioManager } from '../../../engine/AudioManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { t } from '../../../i18n/LanguageManager';
import {
    TUTORIAL_GRID,
    TUTORIAL_STEPS,
    type TutorialAction,
    type TutorialActorId,
    type TutorialHudId,
    type TutorialMenuActionId,
} from './tutorialData';

interface IntroTutorialProps {
    commanderName: string;
    classLabelKey: string;
    onComplete: () => void;
    onSkip: () => void;
}

interface GridPoint {
    x: number;
    y: number;
}

interface SimActor {
    id: TutorialActorId;
    labelKey: string;
    pos: GridPoint;
    tone: 'ally' | 'enemy' | 'mentor';
    hp?: number;
}

const MENU_ACTIONS: Array<{ id: TutorialMenuActionId; labelKey: string }> = [
    { id: 'move', labelKey: 'tutorial.action.move' },
    { id: 'attack', labelKey: 'tutorial.action.attack' },
    { id: 'rest', labelKey: 'tutorial.action.rest' },
    { id: 'magic', labelKey: 'tutorial.action.magic' },
    { id: 'order', labelKey: 'tutorial.action.order' },
];

const FUNCTION_KEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F12'];

export function IntroTutorial({ commanderName, classLabelKey, onComplete, onSkip }: IntroTutorialProps) {
    const [stepIndex, setStepIndex] = useState(0);
    const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(() => new Set());
    const [selfPos, setSelfPos] = useState<GridPoint>({ x: 2, y: 2 });
    const [selectedAction, setSelectedAction] = useState<TutorialMenuActionId | null>(null);
    const [statusOpen, setStatusOpen] = useState(false);
    const [allianceOn, setAllianceOn] = useState(true);
    const [mercenaryMode, setMercenaryMode] = useState<'manual' | 'guard'>('manual');
    const [selfHp, setSelfHp] = useState(82);
    const [selfMp, setSelfMp] = useState(70);
    const [monsterHp, setMonsterHp] = useState(100);
    const [spellTargetHp, setSpellTargetHp] = useState(100);

    const activeStep = TUTORIAL_STEPS[stepIndex];
    const isFinalStep = stepIndex === TUTORIAL_STEPS.length - 1;
    const canAdvance = !activeStep.requiredAction || completedStepIds.has(activeStep.id);
    const rootStyle = { '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;

    const markStepDone = (action: TutorialAction): void => {
        if (activeStep.requiredAction !== action) return;
        setCompletedStepIds((prev) => {
            if (prev.has(activeStep.id)) return prev;
            const next = new Set(prev);
            next.add(activeStep.id);
            return next;
        });
        AudioManager.playUi('ui.confirm');
    };

    const advance = (): void => {
        if (!canAdvance) return;
        AudioManager.playUi('ui.confirm');
        if (isFinalStep) {
            onComplete();
            return;
        }
        setStepIndex((idx) => Math.min(TUTORIAL_STEPS.length - 1, idx + 1));
    };

    const skip = (): void => {
        AudioManager.playUi('ui.cancel');
        onSkip();
    };

    const handleAction = (id: TutorialMenuActionId): void => {
        setSelectedAction(id);
        const actionById: Record<TutorialMenuActionId, TutorialAction> = {
            move: 'chooseMove',
            attack: 'chooseAttack',
            rest: 'chooseRest',
            magic: 'chooseMagic',
            order: 'chooseOrder',
        };
        if (id === 'rest') setSelfHp(100);
        if (id === 'order') setMercenaryMode('guard');
        markStepDone(actionById[id]);
    };

    const handleActor = (id: TutorialActorId): void => {
        if (id === 'self') {
            markStepDone('selectSelf');
            return;
        }
        if (id === 'monster') {
            setMonsterHp(0);
            setSelfHp(68);
            markStepDone('attackTarget');
            return;
        }
        if (id === 'spellTarget') {
            setSpellTargetHp(0);
            setSelfMp(35);
            markStepDone('castMagic');
        }
    };

    const handleCell = (x: number, y: number, actor: SimActor | null): void => {
        if (actor) {
            handleActor(actor.id);
            return;
        }
        if (activeStep.requiredAction !== 'moveToTile') return;
        const focus = activeStep.focus;
        if (focus?.kind === 'tile' && focus.x === x && focus.y === y) {
            setSelfPos({ x, y });
            markStepDone('moveToTile');
        }
    };

    const toggleStatus = (): void => {
        setStatusOpen((value) => !value);
        markStepDone('toggleStatus');
    };

    const pressFunctionKey = (keyName: string): void => {
        if (keyName !== 'F3') return;
        markStepDone('pressFunctionKey');
    };

    const toggleAlliance = (): void => {
        setAllianceOn((value) => !value);
        markStepDone('toggleAlliance');
    };

    const actors = getActors(selfPos, monsterHp, spellTargetHp);
    const progress = Math.round(((stepIndex + 1) / TUTORIAL_STEPS.length) * 100);

    return (
        <div className="ds-tutorial">
            <div className="ds-panel ds-tutorial__panel" style={rootStyle} onClick={(e) => e.stopPropagation()}>
                <div className="ds-panel__header">
                    <span className="ds-panel__title">{t('tutorial.title')}</span>
                    <button className="ds-btn ds-tutorial__skip" onClick={skip}>{t('tutorial.skip')}</button>
                </div>

                <div className="ds-tutorial__body">
                    <section className="ds-tutorial__stage" aria-label={t('tutorial.stageLabel')}>
                        <div className="ds-tutorial__hud">
                            <button
                                className={`ds-tutorial__hudbtn${isFocusedHud(activeStep, 'status') ? ' is-focused' : ''}`}
                                onClick={toggleStatus}
                            >
                                {t('tutorial.hud.status')}
                            </button>
                            <div className={`ds-tutorial__keys${isFocusedHud(activeStep, 'functionKeys') ? ' is-focused' : ''}`}>
                                {FUNCTION_KEYS.map((keyName) => (
                                    <button key={keyName} className="ds-tutorial__key" onClick={() => pressFunctionKey(keyName)}>
                                        {keyName}
                                    </button>
                                ))}
                            </div>
                            <button
                                className={`ds-tutorial__hudbtn${isFocusedHud(activeStep, 'alliance') ? ' is-focused' : ''}`}
                                onClick={toggleAlliance}
                            >
                                {allianceOn ? t('tutorial.hud.allianceOn') : t('tutorial.hud.allianceOff')}
                            </button>
                        </div>

                        <div className="ds-tutorial__grid">
                            {Array.from({ length: TUTORIAL_GRID.rows }).map((_, y) => (
                                Array.from({ length: TUTORIAL_GRID.columns }).map((__, x) => {
                                    const actor = actors.find((entry) => entry.pos.x === x && entry.pos.y === y) ?? null;
                                    const focusedTile = isFocusedTile(activeStep, x, y);
                                    const focusedActor = actor ? isFocusedActor(activeStep, actor.id) : false;
                                    return (
                                        <button
                                            key={`${x}:${y}`}
                                            className={`ds-tutorial__cell${focusedTile ? ' is-focused' : ''}${focusedActor ? ' is-focused' : ''}`}
                                            aria-label={actor ? t(actor.labelKey) : `${x}, ${y}`}
                                            onClick={() => handleCell(x, y, actor)}
                                        >
                                            {actor && (
                                                <span className={`ds-tutorial__actor is-${actor.tone}`}>
                                                    <span>{t(actor.labelKey)}</span>
                                                    {actor.hp !== undefined && <span className="ds-tutorial__actorhp">{actor.hp}</span>}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })
                            ))}
                        </div>

                        <div className="ds-tutorial__actions" role="toolbar" aria-label={t('tutorial.actionsLabel')}>
                            {MENU_ACTIONS.map((action) => (
                                <button
                                    key={action.id}
                                    className={`ds-btn${selectedAction === action.id ? ' is-active' : ''}${isFocusedAction(activeStep, action.id) ? ' is-focused' : ''}`}
                                    onClick={() => handleAction(action.id)}
                                >
                                    {t(action.labelKey)}
                                </button>
                            ))}
                        </div>
                    </section>

                    <aside className="ds-tutorial__script">
                        <div className="ds-tutorial__meta">
                            <span>{t('tutorial.commander')}: {commanderName || t('tutorial.defaultName')}</span>
                            <span>{t('tutorial.class')}: {t(classLabelKey)}</span>
                        </div>
                        <div className="ds-tutorial__progress" aria-label={t('tutorial.progressLabel')}>
                            <span style={{ width: `${progress}%` }} />
                        </div>
                        <div className="ds-tutorial__chapter">{t(`tutorial.chapter.${activeStep.chapter}`)}</div>
                        <div className="ds-tutorial__message">
                            {t(activeStep.textKey).split('|').map((line) => <p key={line}>{line}</p>)}
                        </div>
                        {activeStep.promptKey && <div className="ds-tutorial__prompt">{t(activeStep.promptKey)}</div>}

                        {statusOpen && (
                            <div className="ds-tutorial__status">
                                <div className="ds-tutorial__statusrow">
                                    <span>{t('tutorial.status.hp')}</span>
                                    <div className="ds-bar ds-bar--hp"><div className="ds-bar__fill" style={{ width: `${selfHp}%` }} /></div>
                                </div>
                                <div className="ds-tutorial__statusrow">
                                    <span>{t('tutorial.status.mp')}</span>
                                    <div className="ds-bar ds-bar--mp"><div className="ds-bar__fill" style={{ width: `${selfMp}%` }} /></div>
                                </div>
                                <div className="ds-tutorial__statusrow">
                                    <span>{t('tutorial.status.atb')}</span>
                                    <div className="ds-bar"><div className="ds-bar__fill" style={{ width: '100%' }} /></div>
                                </div>
                            </div>
                        )}

                        <div className="ds-tutorial__merc">
                            {t('tutorial.mercenaryMode')}: {mercenaryMode === 'guard' ? t('tutorial.mercenaryGuard') : t('tutorial.mercenaryManual')}
                        </div>

                        <button className="ds-tutorial__next" disabled={!canAdvance} onClick={advance}>
                            {isFinalStep ? t('tutorial.goTown') : t('tutorial.next')}
                        </button>
                    </aside>
                </div>
            </div>
        </div>
    );
}

function getActors(selfPos: GridPoint, monsterHp: number, spellTargetHp: number): SimActor[] {
    const actors: SimActor[] = [
        { id: 'mentor', labelKey: 'tutorial.actor.mentor', pos: { x: 0, y: 0 }, tone: 'mentor' },
        { id: 'self', labelKey: 'tutorial.actor.self', pos: selfPos, tone: 'ally' },
        { id: 'mercenaryA', labelKey: 'tutorial.actor.mercenaryA', pos: { x: 1, y: 3 }, tone: 'ally' },
        { id: 'mercenaryB', labelKey: 'tutorial.actor.mercenaryB', pos: { x: 2, y: 3 }, tone: 'ally' },
    ];
    if (monsterHp > 0) actors.push({ id: 'monster', labelKey: 'tutorial.actor.monster', pos: { x: 5, y: 2 }, tone: 'enemy', hp: monsterHp });
    if (spellTargetHp > 0) actors.push({ id: 'spellTarget', labelKey: 'tutorial.actor.spellTarget', pos: { x: 5, y: 1 }, tone: 'enemy', hp: spellTargetHp });
    return actors;
}

function isFocusedActor(step: { focus?: unknown }, id: TutorialActorId): boolean {
    return typeof step.focus === 'object' && step.focus !== null
        && 'kind' in step.focus && step.focus.kind === 'actor'
        && 'id' in step.focus && step.focus.id === id;
}

function isFocusedAction(step: { focus?: unknown }, id: TutorialMenuActionId): boolean {
    return typeof step.focus === 'object' && step.focus !== null
        && 'kind' in step.focus && step.focus.kind === 'action'
        && 'id' in step.focus && step.focus.id === id;
}

function isFocusedHud(step: { focus?: unknown }, id: TutorialHudId): boolean {
    return typeof step.focus === 'object' && step.focus !== null
        && 'kind' in step.focus && step.focus.kind === 'hud'
        && 'id' in step.focus && step.focus.id === id;
}

function isFocusedTile(step: { focus?: unknown }, x: number, y: number): boolean {
    return typeof step.focus === 'object' && step.focus !== null
        && 'kind' in step.focus && step.focus.kind === 'tile'
        && 'x' in step.focus && step.focus.x === x
        && 'y' in step.focus && step.focus.y === y;
}
