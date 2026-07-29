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
import { formatMonsterName } from '../../../i18n/DisplayNames';
import type { BountyRiskId } from '../../../data/BountyContractData';
import type { EliteAffixId } from '../../../field/EliteAffixes';

export function QuestPanel() {
    useUiVersion();
    const store = useStore();
    const contracts = store.getMerchantContractViews();
    const bounties = store.getBountyContractViews();
    const hasActiveBounty = bounties.some((view) => view.active);
    const [feedback, setFeedback] = useState('');
    const [tearingId, setTearingId] = useState<string | null>(null);
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

    const acceptBounty = (id: string) => {
        if (hasActiveBounty || tearingId) return;
        const ok = store.acceptBountyContract(id);
        setFeedback(ok ? t('bounty.accepted') : t('bounty.acceptFailed'));
        AudioManager.playUi(ok ? 'ui.confirm' : 'ui.cancel');
        if (!ok) return;
        setTearingId(id);
        window.setTimeout(() => {
            setTearingId(null);
        }, 360);
    };

    const abandonBounty = () => {
        const ok = store.abandonBountyContract();
        setFeedback(ok ? t('bounty.abandoned') : '');
        AudioManager.playUi(ok ? 'ui.cancel' : 'ui.confirm');
    };

    return (
        <div className="ds-panel ds-quest" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">📜 {t('quest.board')}</span>
            </div>

            <QuestList />

            <section className="ds-bounty-board" aria-label={t('bounty.title')}>
                <div className="ds-bounty-board__head">
                    <span>⚔ {t('bounty.title')}</span>
                    <span>{t('bounty.subtitle')}</span>
                </div>
                <div className="ds-bounty-board__papers">
                    {bounties.map(({ contract, monster, active }) => {
                        const disabled = hasActiveBounty && !active;
                        return (
                            <article
                                key={contract.id}
                                className={[
                                    'ds-bounty-paper',
                                    active ? 'is-active' : '',
                                    disabled ? 'is-disabled' : '',
                                    tearingId === contract.id ? 'is-tearing' : '',
                                ].filter(Boolean).join(' ')}
                            >
                                <div className="ds-bounty-paper__pin" aria-hidden="true" />
                                <div className="ds-bounty-paper__wanted">{t('bounty.wanted')}</div>
                                <div className="ds-bounty-paper__target">{formatMonsterName(monster)}</div>
                                <div className="ds-bounty-paper__affixes">
                                    {contract.affixIds.map((affix) => (
                                        <span key={affix}>{eliteAffixLabel(affix)}</span>
                                    ))}
                                </div>
                                <div className="ds-bounty-paper__risk">
                                    {t('bounty.risk')} · {bountyRiskLabel(contract.riskId)}
                                </div>
                                <div className="ds-bounty-paper__reward">
                                    {contract.rewardGold}G + {t('bounty.riskBonus')} {contract.bonusGold}G
                                </div>
                                {active ? (
                                    <button type="button" className="ds-btn is-danger" onClick={abandonBounty}>
                                        {t('bounty.abandon')}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="ds-btn"
                                        disabled={disabled || tearingId !== null}
                                        onClick={() => acceptBounty(contract.id)}
                                    >
                                        {t('bounty.tearAccept')}
                                    </button>
                                )}
                                {active && <div className="ds-bounty-paper__stamp">{t('bounty.acceptedStamp')}</div>}
                            </article>
                        );
                    })}
                </div>
                <div className="ds-bounty-board__rule">{t('bounty.survivalRule')}</div>
            </section>

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
                <div className="ds-contracts__feedback" role="status" aria-live="polite">{feedback}</div>
            </div>
        </div>
    );
}

function eliteAffixLabel(affix: EliteAffixId): string {
    switch (affix) {
        case 'berserker': return t('bounty.affix.berserker');
        case 'vampiric': return t('bounty.affix.vampiric');
        case 'ironclad': return t('bounty.affix.ironclad');
        case 'executioner': return t('bounty.affix.executioner');
        case 'swift': return t('bounty.affix.swift');
    }
}

function bountyRiskLabel(risk: BountyRiskId): string {
    switch (risk) {
        case 'swift_hunt': return t('bounty.risk.swift_hunt');
        case 'unbroken': return t('bounty.risk.unbroken');
        case 'blood_trail': return t('bounty.risk.blood_trail');
    }
}
