/**
 * TownScreen — DD-styled DOM overlay for the town-visit screen.
 *
 * Owns the town chrome (header, tab bar, deploy button) and every tab — storage
 * (the DOM inventory grid), shop, rest, quest, rumors. Tab state lives in TownUI;
 * React drives it through the store.
 */

import { useEffect, useState, type CSSProperties } from 'react';
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

function townBackdropKey(tab: TownTab): string {
    if (tab === 'weapon_shop' || tab === 'armor_shop') return 'armory';
    if (tab === 'general_store' || tab === 'specialty_trader' || tab === 'shrine') return 'market';
    if (tab === 'blacksmith') return 'forge';
    if (tab === 'rest' || tab === 'healer') return 'infirmary';
    if (tab === 'quest' || tab === 'rumors') return 'guild';
    return 'warehouse';
}

export function TownScreen() {
    useUiVersion();
    const store = useStore();
    const town = store.getTownInfo();
    const tab = store.getTownTab();
    const restFacility = store.getRestFacility();
    const deployPending = store.isTownDeployPending();
    const deployError = store.getTownDeployError();
    const hubSaveError = store.getHubSaveError();
    const insurancePrice = store.getRaidInsurancePrice();
    const insured = store.hasRaidInsurance();
    const [insuranceFeedback, setInsuranceFeedback] = useState('');
    useEffect(() => {
        if (!insuranceFeedback) return undefined;
        const id = window.setTimeout(() => setInsuranceFeedback(''), 2600);
        return () => window.clearTimeout(id);
    }, [insuranceFeedback]);
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
    const townSecondaryName = i18n.lang === 'ko' ? town.name : null;
    const deploy = () => {
        if (deployPending) return;
        if (store.townDeploy()) AudioManager.playSfx('sfx.deploy');
    };
    const buyInsurance = () => {
        if (insured || deployPending) return;
        const ok = store.buyRaidInsurance();
        AudioManager.playUi(ok ? 'ui.confirm' : 'ui.cancel');
        setInsuranceFeedback(ok ? t('insurance.purchased') : t('insurance.noGold'));
    };

    return (
        <div
            className={`ds-town ds-town--${townBackdropKey(tab)}${deployPending ? ' is-deploying' : ''}`}
            aria-busy={deployPending}
        >
            <div className="ds-town__header" style={scaleVar}>
                <span className="ds-town__name">🏰 {townPrimaryName}</span>
                {townSecondaryName && <span className="ds-town__sub">{townSecondaryName}</span>}
            </div>

            <div className="ds-town__tabs" style={scaleVar} role="tablist" inert={deployPending}>
                {tabs.map((tb) => (
                    <button
                        key={tb.id}
                        type="button"
                        role="tab"
                        id={`town-tab-${tb.id}`}
                        aria-selected={tab === tb.id}
                        aria-controls="town-tabpanel"
                        className={`ds-town__tab${tab === tb.id ? ' is-active' : ''}`}
                        onClick={() => {
                            if (tab === tb.id) return;
                            store.townSetTab(tb.id);
                            AudioManager.playUi('ui.hover');
                        }}
                    >
                        {tb.icon} {tb.label}
                    </button>
                ))}
            </div>

            <div className="ds-town__content" role="tabpanel" id="town-tabpanel" aria-labelledby={`town-tab-${tab}`} inert={deployPending}>
                {tab === 'storage' && townInv && (
                    <div className="ds-town__storage">
                        <FacilityUpgradePanel />
                        <InventoryPanel inv={townInv} embedded townStorage />
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
                {hubSaveError && (
                    <div className="ds-town__deploy-error" data-hub-save-error role="alert">
                        {hubSaveError}
                    </div>
                )}
                {deployError && <div className="ds-town__deploy-error" role="alert">{deployError}</div>}
                {insuranceFeedback && (
                    <div className="ds-town__insurance-feedback" role="status" aria-live="polite">
                        {insuranceFeedback}
                    </div>
                )}
                <button
                    type="button"
                    className={`ds-town__insurance${insured ? ' is-active' : ''}`}
                    disabled={insured || deployPending}
                    onClick={buyInsurance}
                    title={t('insurance.tooltip')}
                >
                    ◈ {insured
                        ? t('insurance.active')
                        : `${t('insurance.buy')} ${insurancePrice}G`}
                </button>
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
