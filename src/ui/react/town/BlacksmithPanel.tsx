import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { t } from '../../../i18n/LanguageManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import type { BlacksmithEntry } from '../UiStore';
import { useStore, useUiVersion } from '../UiContext';
import { canUnsocket } from '../../../inventory/Socketing';
import { ItemSwatch, itemName, statSummary } from './itemView';

export function BlacksmithPanel() {
    useUiVersion();
    const store = useStore();
    const entries = store.getBlacksmithEntries();
    const gold = store.getBlacksmithGold();
    const [feedback, setFeedback] = useState('');

    useEffect(() => {
        if (!feedback) return;
        const id = window.setTimeout(() => setFeedback(''), 2400);
        return () => window.clearTimeout(id);
    }, [feedback]);

    const repair = (entry: BlacksmithEntry) => {
        if (entry.repairCost <= 0) return;
        const ok = store.blacksmithRepair(entry);
        setFeedback(ok ? t('blacksmith.repaired') : t('blacksmith.noGold'));
        AudioManager.playUi(ok ? 'ui.confirm' : 'ui.cancel');
    };

    const extract = (entry: BlacksmithEntry) => {
        if (entry.unsocketCost <= 0) return;
        const ok = store.blacksmithUnsocket(entry);
        setFeedback(ok ? t('blacksmith.extracted') : t('blacksmith.extractFailed'));
        AudioManager.playUi(ok ? 'ui.confirm' : 'ui.cancel');
    };

    const panelStyle = { width: 'min(860px, 94vw)', '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;

    return (
        <div className="ds-panel ds-blacksmith" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">⚒ {t('blacksmith.title')}</span>
                <span className="ds-blacksmith__gold">💰 {gold}G</span>
            </div>

            <div className="ds-blacksmith__body">
                <div className="ds-blacksmith__note">{t('blacksmith.note')}</div>
                <div className="ds-blacksmith__list">
                    {entries.length === 0 && <div className="ds-blacksmith__empty">{t('blacksmith.empty')}</div>}
                    {entries.map((entry) => {
                        const sockets = entry.placed.sockets ?? [];
                        const repairDisabled = entry.repairCost <= 0 || gold < entry.repairCost;
                        const extractDisabled = entry.unsocketCost <= 0 || !canUnsocket(entry.placed) || gold < entry.unsocketCost;
                        return (
                            <div key={entry.id} className="ds-blacksmith__row">
                                <ItemSwatch item={entry.placed.item} />
                                <div className="ds-blacksmith__info">
                                    <div className="ds-blacksmith__name">{itemName(entry.placed.item)}</div>
                                    <div className="ds-blacksmith__sub">{sourceLabel(entry)} · {statSummary(entry.placed.item)}</div>
                                    <div className="ds-blacksmith__meta">
                                        <span>{t('blacksmith.durability')}: {entry.placed.durability}/{entry.placed.item.maxDurability}</span>
                                        <span>{t('blacksmith.sockets')}: {sockets.length > 0 ? sockets.map(itemName).join(', ') : t('blacksmith.none')}</span>
                                    </div>
                                </div>
                                <div className="ds-blacksmith__actions">
                                    <button className="ds-btn" disabled={repairDisabled} onClick={() => repair(entry)}>
                                        {t('blacksmith.repair')} · {entry.repairCost}G
                                    </button>
                                    <button className="ds-btn" disabled={extractDisabled} onClick={() => extract(entry)}>
                                        {t('blacksmith.extract')} · {entry.unsocketCost}G
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="ds-blacksmith__feedback">{feedback}</div>
            </div>
        </div>
    );
}

function sourceLabel(entry: BlacksmithEntry): string {
    if (entry.source !== 'equipment') return t(entry.sourceLabel);
    const slot = entry.slot === 'accessory2' ? 'accessory' : entry.slot;
    return slot ? `${entry.sourceLabel} · ${t(`inv.${slot}`)}` : entry.sourceLabel;
}
