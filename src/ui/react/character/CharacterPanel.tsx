/**
 * CharacterPanel — the DD-styled DOM replacement for the canvas CharacterPanelUI.
 *
 * Subscribes to the UI version (useUiVersion) so live-mutating values
 * (HP/MP/EXP, gold, active member) stay current without per-frame re-renders.
 * Mounted only while open.
 */

import type { CSSProperties } from 'react';
import { SettingsManager } from '../../../engine/SettingsManager';
import { t } from '../../../i18n/LanguageManager';
import { useStore, useUiVersion } from '../UiContext';
import { PanelHeader } from './PanelHeader';
import { PartyTabs } from './PartyTabs';
import { ResourceBars } from './ResourceBars';
import { EquipmentSlots } from './EquipmentSlots';
import { StatGrid } from './StatGrid';
import { useModalDialog } from '../useModalDialog';

export function CharacterPanel() {
    useUiVersion(); // keep live game state in sync when UiStore observes changes
    const store = useStore();
    const dialogRef = useModalDialog<HTMLDivElement>();

    const char = store.getActiveCharacter();
    const party = store.getActiveParty();
    const activeIndex = store.getActiveIndex();
    const gold = store.getGold();
    const uiScale = SettingsManager.getUIScale();

    const panelStyle = { width: 'min(560px, 94vw)', '--ds-scale': uiScale } as CSSProperties;

    return (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('info.title')} tabIndex={-1} className="ds-panel" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <PanelHeader onClose={() => store.closeCharPanel()} />

            {!char ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ds-text-muted)' }}>
                    {t('info.noCharacter')}
                </div>
            ) : (
                <>
                    <PartyTabs party={party} activeIndex={activeIndex} />
                    <div style={{ display: 'flex', gap: 16, padding: '0 16px 16px' }}>
                        {/* Left column: portrait + resources + equipment */}
                        <div style={{ width: 190, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div
                                style={{
                                    height: 150,
                                    background: 'var(--ds-panel-inset)',
                                    border: '1px solid var(--ds-border-shadow)',
                                    borderRadius: 'var(--ds-radius-sm)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                }}
                            >
                                {char.portraitImage?.src ? (
                                    <img
                                        src={char.portraitImage.src}
                                        alt={char.name}
                                        style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }}
                                    />
                                ) : null}
                            </div>
                            <ResourceBars char={char} />
                            <EquipmentSlots char={char} />
                        </div>

                        {/* Right column: basic info + stat grid */}
                        <div style={{ flex: 1 }}>
                            <StatGrid char={char} gold={gold} />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
