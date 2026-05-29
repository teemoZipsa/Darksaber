import type { CSSProperties } from 'react';
import { SettingsManager } from '../../../engine/SettingsManager';
import { t } from '../../../i18n/LanguageManager';
import { useStore, useUiVersion } from '../UiContext';
import { QuestList } from './QuestList';

export function StoryJournalPanel() {
    useUiVersion();
    const store = useStore();
    const panelStyle = { width: 'min(720px, 94vw)', '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;

    return (
        <div className="ds-panel ds-quest ds-journal" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">📜 {t('quest.journal')}</span>
                <button className="ds-close-btn" onClick={() => store.closeQuestJournal()} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
            </div>
            <QuestList />
            <div className="ds-journal__footer">{t('quest.journalHint')}</div>
        </div>
    );
}
