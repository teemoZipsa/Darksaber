/**
 * ShopPanel — DD-styled DOM replacement for the canvas ShopUI.
 *
 * Two columns: BUY (left, by equipment/goods category) and SELL (right, from the
 * backpack + stash). Click a buy row to purchase; click a sell row to open the
 * sell-confirm modal. Live via useUiVersion (gold/stock change in place); actions
 * delegate to UiStore → ShopUI.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { t } from '../../../i18n/LanguageManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import { SHOP_KIND_TABS, type ShopEntry, type SellEntry } from '../../../ui/ShopUI';
import type { ItemDef } from '../../../data/ItemDB';
import type { PlacedItem } from '../../../inventory/GridInventory';
import { useStore, useUiVersion } from '../UiContext';
import {
    ItemCompareTooltip,
    ItemSwatch,
    ItemTooltip,
    isEquippable,
    itemName,
    statSummary,
    useItemTooltip,
} from './itemView';

export function ShopPanel() {
    useUiVersion();
    const store = useStore();
    const kind = store.getShopKind();
    const buyEntries = store.getShopBuyEntries();
    const sellEntries = store.getShopSellEntries();
    const gold = store.getShopGold();
    const char = store.getActiveCharacter();
    const tip = useItemTooltip();

    // Equippable goods compare against what the active character currently wears.
    const tipFor = (item: ItemDef, placed?: PlacedItem) => {
        if (isEquippable(item) && char) {
            return <ItemCompareTooltip candidate={item} equipped={char.equipment.get(item.slot)} candidatePlaced={placed} />;
        }
        return <ItemTooltip item={item} placed={placed} />;
    };

    const [pendingSell, setPendingSell] = useState<SellEntry | null>(null);
    const [feedback, setFeedback] = useState('');
    useEffect(() => {
        if (!feedback) return;
        const id = window.setTimeout(() => setFeedback(''), 2200);
        return () => window.clearTimeout(id);
    }, [feedback]);

    const buy = (entry: ShopEntry) => {
        if (entry.remaining === 0) return;
        if (gold < entry.price) { setFeedback(t('shop.noGold')); AudioManager.playUi('ui.cancel'); return; }
        if (store.shopBuy(entry)) { AudioManager.playUi('ui.confirm'); setFeedback(''); }
        else { setFeedback(t('shop.backpackFull')); AudioManager.playUi('ui.cancel'); }
    };

    const confirmSell = () => {
        if (!pendingSell) return;
        const ok = store.shopSell(pendingSell);
        setPendingSell(null);
        if (ok) { setFeedback(t('shop.soldItem')); AudioManager.playUi('ui.confirm'); }
    };

    const panelStyle = { width: 'min(960px, 94vw)', '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;

    return (
        <div className="ds-panel ds-shop" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">{t('shop.title')}</span>
                <span className="ds-shop__gold">💰 {gold}G</span>
            </div>

            <div className="ds-shop__kinds" role="tablist">
                {SHOP_KIND_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={kind === tab.id}
                        className={`ds-btn${kind === tab.id ? ' is-active' : ''}`}
                        onClick={() => { store.shopSetKind(tab.id); AudioManager.playUi('ui.hover'); }}
                    >
                        {tab.icon} {t(tab.labelKey)}
                    </button>
                ))}
            </div>

            <div className="ds-shop__cols">
                <div className="ds-shop__col">
                    <div className="ds-shop__colhead"><span>{t('shop.buyPanel')}</span><span>{t('shop.gold')}</span></div>
                    <div className="ds-shop__list">
                        {buyEntries.length === 0 && <div className="ds-shop__empty">{t('shop.emptyBuy')}</div>}
                        {buyEntries.map((entry, i) => {
                            const soldOut = entry.remaining === 0;
                            const afford = gold >= entry.price;
                            return (
                                <button
                                    key={`${entry.item.id}-${i}`}
                                    className={`ds-shop__row${soldOut ? ' is-out' : ''}${!afford && !soldOut ? ' is-poor' : ''}`}
                                    disabled={soldOut}
                                    onClick={() => buy(entry)}
                                    onPointerEnter={tip.show(tipFor(entry.item))}
                                    onPointerMove={tip.move}
                                    onPointerLeave={tip.hide}
                                    aria-label={`${itemName(entry.item)} · ${entry.price}G`}
                                >
                                    <ItemSwatch item={entry.item} dim={soldOut} />
                                    <div className="ds-shop__rowinfo">
                                        <span className="ds-shop__name">{itemName(entry.item)}</span>
                                        <span className="ds-shop__sub">{statSummary(entry.item)}</span>
                                    </div>
                                    <div className="ds-shop__rowright">
                                        <span className={`ds-shop__price${afford || soldOut ? '' : ' is-poor'}`}>{entry.price}G</span>
                                        <span className="ds-shop__stock">
                                            {soldOut ? t('shop.soldOut') : entry.remaining > 0 ? `x${entry.remaining}` : ''}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="ds-shop__col">
                    <div className="ds-shop__colhead"><span>{t('shop.sellPanel')}</span><span>{t('shop.sellPrice')}</span></div>
                    <div className="ds-shop__list">
                        {sellEntries.length === 0 && <div className="ds-shop__empty">{t('shop.emptySell')}</div>}
                        {sellEntries.map((entry, i) => {
                            const qty = Math.max(1, entry.placed.quantity);
                            return (
                                <button
                                    key={`${entry.placed.item.id}-${entry.source.id}-${i}`}
                                    className="ds-shop__row"
                                    onClick={() => { setPendingSell(entry); tip.hide(); }}
                                    onPointerEnter={tip.show(tipFor(entry.placed.item, entry.placed))}
                                    onPointerMove={tip.move}
                                    onPointerLeave={tip.hide}
                                    aria-label={`${itemName(entry.placed.item)} · ${entry.price}G`}
                                >
                                    <ItemSwatch item={entry.placed.item} />
                                    <div className="ds-shop__rowinfo">
                                        <span className="ds-shop__name">{itemName(entry.placed.item)}{qty > 1 ? ` x${qty}` : ''}</span>
                                        <span className="ds-shop__sub">{entry.source.label}</span>
                                        {entry.bonusPrice > 0 && (
                                            <span className="ds-shop__bonus">
                                                {t('shop.contractBonus')} +{entry.bonusPrice}G
                                                {entry.contractQuantity ? ` · x${entry.contractQuantity}` : ''}
                                            </span>
                                        )}
                                    </div>
                                    <div className="ds-shop__rowright">
                                        <span className="ds-shop__price is-sell">{entry.price}G</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="ds-shop__feedback">{feedback}</div>
            {tip.node}

            {pendingSell && (
                <div className="ds-modal" onClick={() => setPendingSell(null)}>
                    <div className="ds-modal__box" onClick={(e) => e.stopPropagation()}>
                        <div className="ds-modal__title">{t('shop.sellConfirm')}</div>
                        <div className="ds-modal__line">
                            {itemName(pendingSell.placed.item)} → <strong>{pendingSell.price}G</strong>
                        </div>
                        {statSummary(pendingSell.placed.item) && (
                            <div className="ds-modal__line ds-modal__line--sub">{statSummary(pendingSell.placed.item)}</div>
                        )}
                        {pendingSell.bonusPrice > 0 && (
                            <div className="ds-modal__line">
                                {pendingSell.basePrice}G + {t('shop.contractBonus')} {pendingSell.bonusPrice}G
                            </div>
                        )}
                        <div className="ds-modal__btns">
                            <button className="ds-btn is-active" onClick={confirmSell}>{t('shop.sell')}</button>
                            <button className="ds-btn" onClick={() => setPendingSell(null)}>{t('shop.cancel')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
