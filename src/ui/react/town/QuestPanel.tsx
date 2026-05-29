/**
 * QuestPanel — DD-styled DOM replacement for the canvas quest board.
 * Uses the same story quest list as the J-key journal so town and field state
 * never drift apart.
 */

import type { CSSProperties } from 'react';
import { t } from '../../../i18n/LanguageManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { useUiVersion } from '../UiContext';
import { QuestList } from '../quest/QuestList';

export function QuestPanel() {
    useUiVersion();
    const panelStyle = { width: 'min(560px, 92vw)', '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;

    return (
        <div className="ds-panel ds-quest" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">📜 {t('quest.board')}</span>
            </div>

            <QuestList />
        </div>
    );
}
