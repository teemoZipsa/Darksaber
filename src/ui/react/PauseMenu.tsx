/** PauseMenu — DD-styled DOM replacement for the canvas PauseMenuUI. */

import { useState, type CSSProperties } from 'react';
import { SettingsManager } from '../../engine/SettingsManager';
import { AudioManager } from '../../engine/AudioManager';
import { t } from '../../i18n/LanguageManager';
import { ClassTierChart } from './ClassTierChart';
import { useStore } from './UiContext';
import { useModalDialog } from './useModalDialog';
import { ConfirmModal } from './ConfirmModal';

export function PauseMenu() {
    const store = useStore();
    const dialogRef = useModalDialog<HTMLDivElement>();
    const [confirmToTitle, setConfirmToTitle] = useState(false);
    const panelStyle = { '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;
    const btn: CSSProperties = { width: '100%', padding: '11px 0', fontSize: 14 };

    return (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('pause.title')} tabIndex={-1} className="ds-panel ds-pause" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">{t('pause.title')}</span>
            </div>
            <div className="ds-pause__body">
                <aside className="ds-pause__menu">
                    <button type="button" className="ds-btn" style={btn} onClick={() => store.pauseResume()}>
                        {t('pause.resume')}
                    </button>
                    <button type="button" className="ds-btn" style={btn} onClick={() => store.pauseOpenSettings()}>
                        {t('pause.settings')}
                    </button>
                    <button type="button" className="ds-btn ds-btn--danger" style={btn} onClick={() => setConfirmToTitle(true)}>
                        {t('pause.toTitle')}
                    </button>
                    <div className="ds-pause__footer">
                        {t('pause.closeHint')}
                    </div>
                </aside>
                <ClassTierChart />
            </div>

            {confirmToTitle && (
                <ConfirmModal
                    title={t('pause.toTitleConfirm')}
                    confirmLabel={t('pause.toTitle')}
                    danger
                    onConfirm={() => { AudioManager.playUi('ui.confirm'); setConfirmToTitle(false); store.pauseReturnToTitle(); }}
                    onCancel={() => setConfirmToTitle(false)}
                >
                    <div className="ds-modal__line">{t('pause.toTitleDesc')}</div>
                </ConfirmModal>
            )}
        </div>
    );
}
