/**
 * PartyPanel — DD-styled DOM replacement for the canvas PartyUI (lobby mode).
 *
 * Top: 3 active-squad slots (drop targets). Bottom: roster grid of available
 * characters. Supports HTML5 drag-and-drop — deploy (roster→slot), swap
 * (slot↔slot), reorder (roster↔roster), undeploy (slot→roster). Click a roster
 * card to deploy, click an active card to undeploy (leader slot is protected).
 */

import { useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import type { Character } from '../../../character/Character';
import { SettingsManager } from '../../../engine/SettingsManager';
import { t } from '../../../i18n/LanguageManager';
import { useStore, useUiVersion } from '../UiContext';
import { useModalDialog } from '../useModalDialog';

type DragInfo = { source: 'roster' | 'active'; index: number; charId: string };

function MiniBar({ ratio, color }: { ratio: number; color: string }) {
    return (
        <div className="ds-minibar">
            <div className="ds-minibar__fill" style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, background: color }} />
        </div>
    );
}

function Portrait({ char }: { char: Character }) {
    return (
        <div className="ds-portrait">
            {char.portraitImage?.src ? <img src={char.portraitImage.src} alt={char.name} /> : null}
        </div>
    );
}

export function PartyPanel() {
    useUiVersion();
    const store = useStore();
    const dialogRef = useModalDialog<HTMLDivElement>();
    const drag = useRef<DragInfo | null>(null);
    const errorTimer = useRef<number | undefined>(undefined);
    const [error, setError] = useState('');
    const [overSlot, setOverSlot] = useState<number | null>(null);
    const [overRoster, setOverRoster] = useState<number | null>(null);

    const active = store.getActiveParty();
    const roster = store.getRoster();
    const activeIndex = store.getActiveIndex();
    const available = roster.filter((c) => !active.includes(c));

    const showError = (msg: string) => {
        setError(msg);
        window.clearTimeout(errorTimer.current);
        errorTimer.current = window.setTimeout(() => setError(''), 2000);
    };

    const startDrag = (info: DragInfo) => (e: DragEvent) => {
        drag.current = info;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', info.charId);
    };

    const undeploy = (slotIdx: number, charId: string) => {
        if (slotIdx === 0) { showError(t('party.cannotRemoveLead')); return; }
        store.partyUndeploy(charId);
    };

    const dropOnSlot = (slotIdx: number) => (e: DragEvent) => {
        e.preventDefault();
        setOverSlot(null);
        const d = drag.current; drag.current = null;
        if (!d) return;
        if (d.source === 'active') {
            store.partySwapActive(d.index, slotIdx);
        } else {
            const ch = roster.find((c) => c.id === d.charId);
            if (ch) store.partyReplaceActive(slotIdx, ch);
        }
    };

    const dropOnRosterCard = (targetIdx: number) => (e: DragEvent) => {
        e.preventDefault();
        setOverRoster(null);
        const d = drag.current; drag.current = null;
        if (!d) return;
        if (d.source === 'roster') store.partySwapRoster(d.index, targetIdx);
        else undeploy(d.index, d.charId);
    };

    const dropOnRosterArea = (e: DragEvent) => {
        e.preventDefault();
        setOverRoster(null);
        const d = drag.current; drag.current = null;
        if (d && d.source === 'active') undeploy(d.index, d.charId);
    };

    const clickRoster = (ch: Character) => () => {
        if (store.isPartyFull()) { showError(t('party.full')); return; }
        store.partyDeploy(ch);
    };

    const panelStyle = { width: 660, '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;
    const rosterEmptyStyle: CSSProperties = { gridColumn: '1 / -1', textAlign: 'center', color: 'var(--ds-text-dim)', fontSize: 12, padding: '12px 0' };

    return (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('party.title')} tabIndex={-1} className="ds-panel" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">{t('party.title')}</span>
                <button className="ds-close-btn" onClick={() => store.closeParty()} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
            </div>

            <div className="ds-party">
                {/* Active squad */}
                <div>
                    <div className="ds-party__sublabel">{t('party.active')}</div>
                    <div className="ds-squad">
                        {[0, 1, 2].map((i) => {
                            const ch = active[i];
                            if (!ch) {
                                return (
                                    <div
                                        key={i}
                                        className={`ds-slot-card is-empty${overSlot === i ? ' drag-over' : ''}`}
                                        onDragOver={(e) => { e.preventDefault(); setOverSlot(i); }}
                                        onDragLeave={() => setOverSlot(null)}
                                        onDrop={dropOnSlot(i)}
                                        aria-label={t('party.emptySlot')}
                                    >
                                        {t('party.emptySlot')}
                                    </div>
                                );
                            }
                            const hpRatio = ch.stats.hp / ch.stats.maxHp;
                            const cls = [
                                'ds-slot-card',
                                i === 0 ? 'is-leader' : '',
                                i === activeIndex && !ch.isDead ? 'is-active' : '',
                                ch.isDead ? 'is-dead' : '',
                                overSlot === i ? 'drag-over' : '',
                            ].filter(Boolean).join(' ');
                            return (
                                <div
                                    key={i}
                                    className={cls}
                                    draggable
                                    onDragStart={startDrag({ source: 'active', index: i, charId: ch.id })}
                                    onDragOver={(e) => { e.preventDefault(); setOverSlot(i); }}
                                    onDragLeave={() => setOverSlot(null)}
                                    onDrop={dropOnSlot(i)}
                                    onClick={() => undeploy(i, ch.id)}
                                    title={`${ch.name} · Lv.${ch.level}`}
                                    aria-label={`${ch.name} · ${t('char.level')} ${ch.level}`}
                                >
                                    {i === 0 && <span className="ds-leader-tag">★ {t('party.leader')}</span>}
                                    <Portrait char={ch} />
                                    <div className="ds-cardinfo">
                                        <span className="ds-cardinfo__name">{ch.name}</span>
                                        <span className="ds-cardinfo__lv">{t('char.level')} {ch.level}</span>
                                        <MiniBar ratio={hpRatio} color={hpRatio < 0.3 ? 'var(--ds-danger)' : 'var(--ds-hp)'} />
                                        <MiniBar ratio={ch.stats.mp / ch.stats.maxMp} color="var(--ds-mp)" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Roster */}
                <div onDragOver={(e) => e.preventDefault()} onDrop={dropOnRosterArea}>
                    <div className="ds-party__sublabel">{t('party.roster')}</div>
                    <div className="ds-roster">
                        {available.map((ch) => {
                            const fullIdx = roster.indexOf(ch);
                            return (
                                <div
                                    key={ch.id}
                                    className={`ds-pcard${overRoster === fullIdx ? ' drag-over' : ''}`}
                                    draggable
                                    onDragStart={startDrag({ source: 'roster', index: fullIdx, charId: ch.id })}
                                    onDragOver={(e) => { e.preventDefault(); setOverRoster(fullIdx); }}
                                    onDragLeave={() => setOverRoster(null)}
                                    onDrop={dropOnRosterCard(fullIdx)}
                                    onClick={clickRoster(ch)}
                                    title={`${ch.name} · Lv.${ch.level}`}
                                    aria-label={`${ch.name} · ${t('char.level')} ${ch.level}`}
                                >
                                    <Portrait char={ch} />
                                    <span className="ds-pcard__name">{ch.name}</span>
                                    <span className="ds-cardinfo__lv">{t('char.level')} {ch.level}</span>
                                </div>
                            );
                        })}
                        {available.length === 0 && (
                            <div style={rosterEmptyStyle}>
                                {t('party.rosterEmpty')}
                            </div>
                        )}
                    </div>
                </div>

                <div className="ds-party__error">{error}</div>
            </div>
        </div>
    );
}
