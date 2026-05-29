/**
 * RumorsPanel — DD-styled DOM replacement for the canvas rumors tab.
 * Shows the 3 rumors rolled for this town visit (Korean flavor text).
 */

import type { CSSProperties } from 'react';
import { t } from '../../../i18n/LanguageManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { useStore, useUiVersion } from '../UiContext';

export function RumorsPanel() {
    useUiVersion();
    const store = useStore();
    const rumors = store.getTownRumors();
    const town = store.getTownInfo();
    const panelStyle = { width: 'min(560px, 92vw)', '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;

    return (
        <div className="ds-panel ds-rumors" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">💬 {t('town.tab.rumors')}</span>
            </div>

            <div className="ds-rumors__body">
                <div className="ds-rumors__npc" aria-hidden>👤</div>
                {rumors.map((rumor, i) => (
                    <div key={i} className="ds-rumors__bubble">
                        <span className="ds-rumors__quote" aria-hidden>❝</span>
                        <span className="ds-rumors__text">{rumor}</span>
                    </div>
                ))}
                <div className="ds-rumors__footer">— {town?.nameKr ?? '마을'} {t('rumors.footer')} —</div>
            </div>
        </div>
    );
}
