/**
 * TownScreen — DD-styled DOM overlay for the town-visit screen.
 *
 * Owns the town chrome (header, tab bar, deploy button) and every tab — storage
 * (the DOM inventory grid), shop, rest, quest, rumors. Tab state lives in TownUI;
 * React drives it through the store.
 */

import type { CSSProperties } from 'react';
import { t } from '../../../i18n/LanguageManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import type { TownTab } from '../../../ui/TownUI';
import { useStore, useUiVersion } from '../UiContext';
import { ShopPanel } from './ShopPanel';
import { RestPanel } from './RestPanel';
import { QuestPanel } from './QuestPanel';
import { RumorsPanel } from './RumorsPanel';
import { restIcon } from './restIcon';
import { InventoryPanel } from '../inventory/InventoryPanel';

export function TownScreen() {
    useUiVersion();
    const store = useStore();
    const town = store.getTownInfo();
    const tab = store.getTownTab();
    const facility = store.getRestFacility();
    if (!town) return null;

    const tabs: Array<{ id: TownTab; label: string; icon: string }> = [
        { id: 'storage', label: t('town.tab.storage'), icon: '📦' },
        { id: 'shop', label: t('town.tab.shop'), icon: '🛒' },
        ...(facility ? [{ id: 'rest' as TownTab, label: t('tab.rest'), icon: restIcon(facility.type) }] : []),
        { id: 'quest', label: t('town.tab.quest'), icon: '📜' },
        { id: 'rumors', label: t('town.tab.rumors'), icon: '💬' },
    ];

    const townInv = store.getTownInventory();
    const scaleVar = { '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;

    return (
        <div className="ds-town">
            <div className="ds-town__header" style={scaleVar}>
                <span className="ds-town__name">🏰 {town.nameKr}</span>
                <span className="ds-town__sub">{town.name}</span>
            </div>

            <div className="ds-town__tabs" style={scaleVar} role="tablist">
                {tabs.map((tb) => (
                    <button
                        key={tb.id}
                        role="tab"
                        aria-selected={tab === tb.id}
                        className={`ds-town__tab${tab === tb.id ? ' is-active' : ''}`}
                        onClick={() => { store.townSetTab(tb.id); AudioManager.playUi('ui.hover'); }}
                    >
                        {tb.icon} {tb.label}
                    </button>
                ))}
            </div>

            <div className="ds-town__content">
                {tab === 'storage' && townInv && <InventoryPanel inv={townInv} embedded />}
                {tab === 'shop' && <ShopPanel />}
                {tab === 'rest' && <RestPanel />}
                {tab === 'quest' && <QuestPanel />}
                {tab === 'rumors' && <RumorsPanel />}
            </div>

            <div className="ds-town__footer" style={scaleVar}>
                <button
                    className="ds-town__deploy"
                    onClick={() => { store.townDeploy(); AudioManager.playUi('ui.confirm'); }}
                >
                    ⚔️ {t('town.deploy')}
                </button>
            </div>
        </div>
    );
}
