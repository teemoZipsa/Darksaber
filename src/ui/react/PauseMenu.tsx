/** PauseMenu — DD-styled DOM replacement for the canvas PauseMenuUI. */

import type { CSSProperties } from 'react';
import { SettingsManager } from '../../engine/SettingsManager';
import { t } from '../../i18n/LanguageManager';
import { useStore } from './UiContext';

export function PauseMenu() {
    const store = useStore();
    const panelStyle = { width: 320, '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;
    const btn: CSSProperties = { width: '100%', padding: '11px 0', fontSize: 14 };

    return (
        <div className="ds-panel" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">{t('pause.title') || '일시정지'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 28px 14px' }}>
                <button className="ds-btn" style={btn} onClick={() => store.pauseResume()}>
                    {t('pause.resume') || '이어하기'}
                </button>
                <button className="ds-btn" style={btn} onClick={() => store.pauseOpenSettings()}>
                    {t('pause.settings') || '설정'}
                </button>
                <button className="ds-btn ds-btn--danger" style={btn} onClick={() => store.pauseReturnToTitle()}>
                    {t('pause.toTitle') || '타이틀로 돌아가기'}
                </button>
            </div>
            <div style={{ textAlign: 'center', color: 'var(--ds-text-dim)', fontSize: 12, paddingBottom: 16 }}>
                ESC 또는 이어하기를 눌러 복귀
            </div>
        </div>
    );
}
