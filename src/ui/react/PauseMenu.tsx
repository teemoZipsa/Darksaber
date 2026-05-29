/** PauseMenu — DD-styled DOM replacement for the canvas PauseMenuUI. */

import type { CSSProperties } from 'react';
import { SettingsManager } from '../../engine/SettingsManager';
import { t } from '../../i18n/LanguageManager';
import { ClassTierChart } from './ClassTierChart';
import { useStore } from './UiContext';

export function PauseMenu() {
    const store = useStore();
    const panelStyle = { '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;
    const btn: CSSProperties = { width: '100%', padding: '11px 0', fontSize: 14 };

    return (
        <div className="ds-panel ds-pause" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">{t('pause.title')}</span>
            </div>
            <div className="ds-pause__body">
                <aside className="ds-pause__menu">
                    <button className="ds-btn" style={btn} onClick={() => store.pauseResume()}>
                        {t('pause.resume')}
                    </button>
                    <button className="ds-btn" style={btn} onClick={() => store.pauseOpenSettings()}>
                        {t('pause.settings')}
                    </button>
                    <button className="ds-btn ds-btn--danger" style={btn} onClick={() => store.pauseReturnToTitle()}>
                        {t('pause.toTitle')}
                    </button>
                    <div className="ds-pause__footer">
                        {t('pause.closeHint')}
                    </div>
                </aside>
                <ClassTierChart />
            </div>
        </div>
    );
}
