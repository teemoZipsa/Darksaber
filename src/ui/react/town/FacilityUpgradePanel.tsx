import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { t } from '../../../i18n/LanguageManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import { getFacilityCostItemDef, type FacilityUpgradeId } from '../../../data/FacilityUpgradeData';
import type { FacilityUpgradeView } from '../UiStore';
import { useStore, useUiVersion } from '../UiContext';
import { itemName } from './itemView';

export function FacilityUpgradePanel() {
    useUiVersion();
    const store = useStore();
    const upgrades = store.getFacilityUpgradeViews();
    const gold = store.getBlacksmithGold();
    const [feedback, setFeedback] = useState('');

    useEffect(() => {
        if (!feedback) return;
        const id = window.setTimeout(() => setFeedback(''), 2200);
        return () => window.clearTimeout(id);
    }, [feedback]);

    const upgrade = (id: FacilityUpgradeId) => {
        const ok = store.facilityUpgrade(id);
        setFeedback(ok ? t('facility.upgraded') : t('facility.noMaterials'));
        AudioManager.playUi(ok ? 'ui.confirm' : 'ui.cancel');
    };

    const panelStyle = { '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;

    return (
        <div className="ds-panel ds-facility" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">▣ {t('facility.title')}</span>
                <span className="ds-facility__gold">{gold}G</span>
            </div>
            <div className="ds-facility__body">
                {upgrades.map((view) => (
                    <div key={view.definition.id} className="ds-facility__row">
                        <div className="ds-facility__main">
                            <div className="ds-facility__name">
                                {t(view.definition.nameKey)}
                                <span>{t('facility.level')} {view.level}/{view.definition.maxLevel}</span>
                            </div>
                            <div className="ds-facility__desc">{t(view.definition.descKey)}</div>
                            <div className="ds-facility__effect">
                                {t(view.definition.effectKey)} {effectPercent(view)}
                            </div>
                            {!view.maxed && (
                                <div className="ds-facility__costs">
                                    <span className={gold >= view.goldCost ? '' : 'is-missing'}>{view.goldCost}G</span>
                                    {view.items.map((cost) => {
                                        const item = getFacilityCostItemDef(cost.itemId);
                                        return (
                                            <span
                                                key={cost.itemId}
                                                className={cost.owned >= cost.quantity ? '' : 'is-missing'}
                                            >
                                                {item ? itemName(item) : cost.itemId} {cost.owned}/{cost.quantity}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            className={`ds-btn${view.canUpgrade ? ' is-active' : ''}`}
                            disabled={!view.canUpgrade}
                            onClick={() => upgrade(view.definition.id)}
                        >
                            {view.maxed ? t('facility.maxed') : t('facility.upgrade')}
                        </button>
                    </div>
                ))}
                <div className="ds-facility__feedback">{feedback}</div>
            </div>
        </div>
    );
}

function effectPercent(view: FacilityUpgradeView): string {
    const tier = view.definition.tiers.find((candidate) => candidate.level === view.level);
    if (!tier) return t('facility.effect.none');
    return `${Math.round((1 - tier.effectValue) * 100)}%`;
}
