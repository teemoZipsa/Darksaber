import { useState, type CSSProperties } from 'react';
import { SettingsManager } from '../../../engine/SettingsManager';
import { t } from '../../../i18n/LanguageManager';
import { useStore, useUiVersion } from '../UiContext';
import { QuestList } from './QuestList';
import { RaidHistoryList } from './RaidHistoryList';
import { MonsterCodexPanel } from './MonsterCodexPanel';
import { useModalDialog } from '../useModalDialog';

export function StoryJournalPanel() {
    useUiVersion();
    const store = useStore();
    const dialogRef = useModalDialog<HTMLDivElement>();
    const [tab, setTab] = useState<'quests' | 'history' | 'codex'>('quests');
    const panelStyle = {
        width: tab === 'codex' ? 'min(980px, 96vw)' : 'min(720px, 94vw)',
        '--ds-scale': SettingsManager.getUIScale(),
    } as CSSProperties;

    return (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('quest.journal')} tabIndex={-1} className="ds-panel ds-quest ds-journal" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">📜 {t('quest.journal')}</span>
                <button className="ds-close-btn" onClick={() => store.closeQuestJournal()} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
            </div>
            <div className="ds-quest-tabs" role="tablist" aria-label={t('quest.journal')}>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'quests'}
                    className={`ds-btn${tab === 'quests' ? ' is-active' : ''}`}
                    onClick={() => setTab('quests')}
                >
                    {t('quest.tab.story')}
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'history'}
                    className={`ds-btn${tab === 'history' ? ' is-active' : ''}`}
                    onClick={() => setTab('history')}
                >
                    {t('raid.history.title')}
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'codex'}
                    className={`ds-btn${tab === 'codex' ? ' is-active' : ''}`}
                    onClick={() => setTab('codex')}
                >
                    {t('codex.title')}
                </button>
            </div>
            {tab === 'quests' ? <QuestList /> : tab === 'history' ? <RaidHistoryList /> : <MonsterCodexPanel />}
            <div className="ds-journal__footer">
                {tab === 'quests'
                    ? t('quest.journalHint')
                    : tab === 'history'
                        ? t('raid.history.footer')
                        : t('codex.footer')}
            </div>
        </div>
    );
}
