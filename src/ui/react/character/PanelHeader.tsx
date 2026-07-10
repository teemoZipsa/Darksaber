/** PanelHeader — title bar with a close button. */

import { t } from '../../../i18n/LanguageManager';

export function PanelHeader({ onClose }: { onClose: () => void }) {
    return (
        <div className="ds-panel__header">
            <span className="ds-panel__title">{t('info.title')}</span>
            <button className="ds-close-btn" onClick={onClose} aria-label={t('ui.close')}>
                ✕
            </button>
        </div>
    );
}
