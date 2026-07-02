/**
 * QuestPanel — DD-styled DOM replacement for the canvas quest board.
 * Uses the same story quest list as the J-key journal so town and field state
 * never drift apart.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { formatT, t } from '../../../i18n/LanguageManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import { useStore, useUiVersion } from '../UiContext';
import { QuestList } from '../quest/QuestList';
import { itemName } from './itemView';

export function QuestPanel() {
    useUiVersion();
    const store = useStore();
    const contracts = store.getMerchantContractViews();
    const [feedback, setFeedback] = useState('');
    const panelStyle = { width: 'min(560px, 92vw)', '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;

    useEffect(() => {
        if (!feedback) return;
        const id = window.setTimeout(() => setFeedback(''), 2200);
        return () => window.clearTimeout(id);
    }, [feedback]);

    const completeContract = (id: string) => {
        const ok = store.completeMerchantContract(id);
        setFeedback(ok ? t('merchantContract.completed') : t('merchantContract.notEnough'));
        AudioManager.playUi(ok ? 'ui.confirm' : 'ui.cancel');
    };

    return (
        <div className="ds-panel ds-quest" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">📜 {t('quest.board')}</span>
            </div>

            <QuestList />

            <div className="ds-contracts">
                <div className="ds-contracts__head">
                    <span>{t('merchantContract.title')}</span>
                    <span>{t('merchantContract.repeatable')}</span>
                </div>
                <div className="ds-contracts__list">
                    {contracts.length === 0 && (
                        <div className="ds-contracts__empty">{t('merchantContract.empty')}</div>
                    )}
                    {contracts.map((contract) => (
                        <div key={contract.id} className={`ds-contracts__row${contract.canComplete ? ' is-ready' : ''}`}>
                            <div className="ds-contracts__main">
                                <div className="ds-contracts__name">
                                    {formatT('merchantContract.deliverItem', {
                                        item: itemName(contract.item),
                                        quantity: contract.requiredQuantity,
                                    })}
                                </div>
                                <div className="ds-contracts__meta">
                                    {formatT('merchantContract.owned', {
                                        owned: contract.ownedQuantity,
                                        required: contract.requiredQuantity,
                                    })}
                                    {' · '}
                                    {formatT('merchantContract.expires', { cycles: contract.expiresInCycles })}
                                </div>
                                <div className="ds-contracts__reward">
                                    {contract.baseReward}G + {t('shop.contractBonus')} {contract.bonusReward}G
                                </div>
                            </div>
                            <button
                                type="button"
                                className={`ds-btn${contract.canComplete ? ' is-active' : ''}`}
                                disabled={!contract.canComplete}
                                onClick={() => completeContract(contract.id)}
                            >
                                {t('merchantContract.turnIn')}
                            </button>
                        </div>
                    ))}
                </div>
                <div className="ds-contracts__feedback">{feedback}</div>
            </div>
        </div>
    );
}
