/** PauseMenu — DD-styled DOM replacement for the canvas PauseMenuUI. */

import type { CSSProperties } from 'react';
import { SettingsManager } from '../../engine/SettingsManager';
import { t } from '../../i18n/LanguageManager';
import { useStore } from './UiContext';

export function PauseMenu() {
    const store = useStore();
    const panelStyle = { width: 320, '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;
    const btn: CSSProperties = { width: '100%', padding: '11px 0', fontSize: 14 };
    const menuList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 28px 14px' };
    const footer: CSSProperties = { textAlign: 'center', color: 'var(--ds-text-dim)', fontSize: 12, paddingBottom: 16 };

    return (
        <div className="ds-panel" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">{t('pause.title')}</span>
            </div>
            <div style={menuList}>
                <button className="ds-btn" style={btn} onClick={() => store.pauseResume()}>
                    {t('pause.resume')}
                </button>
                <button className="ds-btn" style={btn} onClick={() => store.pauseOpenSettings()}>
                    {t('pause.settings')}
                </button>
                <button className="ds-btn ds-btn--danger" style={btn} onClick={() => store.pauseReturnToTitle()}>
                    {t('pause.toTitle')}
                </button>
            </div>
            <div style={footer}>
                {t('pause.closeHint')}
            </div>
        </div>
    );
}
