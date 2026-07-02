/**
 * TownScreen — DD-styled DOM overlay for the town-visit screen.
 *
 * Owns the town chrome (header, tab bar, deploy button) and every tab — storage
 * (the DOM inventory grid), shop, rest, quest, rumors. Tab state lives in TownUI;
 * React drives it through the store.
 */

import type { CSSProperties } from 'react';
import { i18n, t } from '../../../i18n/LanguageManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import type { TownTab } from '../../../ui/TownUI';
import { getTownFacilities, getTownFacilityMeta, isShopFacilityId } from '../../../data/TownFacilityData';
import { useStore, useUiVersion } from '../UiContext';
import { ShopPanel } from './ShopPanel';
import { BlacksmithPanel } from './BlacksmithPanel';
import { RestPanel } from './RestPanel';
import { QuestPanel } from './QuestPanel';
import { RumorsPanel } from './RumorsPanel';
import { restIcon } from './restIcon';
import { InventoryPanel } from '../inventory/InventoryPanel';
import { FacilityUpgradePanel } from './FacilityUpgradePanel';

export function TownScreen() {
    useUiVersion();
    const store = useStore();
    const town = store.getTownInfo();
    const tab = store.getTownTab();
    const restFacility = store.getRestFacility();
    const deployPending = store.isTownDeployPending();
    const deployError = store.getTownDeployError();
    if (!town) return null;

    const facilities = getTownFacilities(town.id);
    const tabs: Array<{ id: TownTab; label: string; icon: string }> = facilities.flatMap((facilityId) => {
        if (facilityId === 'rest' && !restFacility) return [];
        const meta = getTownFacilityMeta(facilityId);
        return [{
            id: facilityId,
            label: facilityId === 'rest' && restFacility ? t(restFacility.nameKey) : t(meta.labelKey),
            icon: facilityId === 'rest' && restFacility ? restIcon(restFacility.type) : meta.icon,
        }];
    });

    const townInv = store.getTownInventory();
    const scaleVar = { '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;
    const townPrimaryName = i18n.lang === 'ko' ? town.nameKr : town.name;
    const townSecondaryName = i18n.lang === 'ko' ? town.name : town.nameKr;
    const deploy = () => {
        if (deployPending) return;
        if (store.townDeploy()) AudioManager.playSfx('sfx.deploy');
    };

    return (
        <div className="ds-town">
            <div className="ds-town__header" style={scaleVar}>
                <span className="ds-town__name">🏰 {townPrimaryName}</span>
                <span className="ds-town__sub">{townSecondaryName}</span>
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
                {tab === 'storage' && townInv && (
                    <div className="ds-town__storage">
                        <FacilityUpgradePanel />
                        <InventoryPanel inv={townInv} embedded />
                    </div>
                )}
                {isShopFacilityId(tab) && <ShopPanel />}
                {tab === 'blacksmith' && <BlacksmithPanel />}
                {tab === 'rest' && <RestPanel showMenus showTreatment={!facilities.includes('healer')} />}
                {tab === 'healer' && <RestPanel showMenus={false} showTreatment />}
                {tab === 'quest' && <QuestPanel />}
                {tab === 'rumors' && <RumorsPanel />}
            </div>

            <div className="ds-town__footer" style={scaleVar}>
                {deployError && <div className="ds-town__deploy-error">{deployError}</div>}
                <button
                    type="button"
                    className="ds-town__deploy"
                    disabled={deployPending}
                    onClick={deploy}
                >
                    ⚔️ {t(deployPending ? 'town.deploying' : 'town.deploy')}
                </button>
            </div>
        </div>
    );
}
