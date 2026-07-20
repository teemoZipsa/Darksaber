/**
 * RestPanel — DD-styled DOM replacement for the canvas rest tab.
 *
 * Lists the town's food/rest menu cards (one reserved buff at a time) plus injury
 * treatment. Replacing an existing reserved menu prompts a confirm modal. Actions
 * delegate to UiStore → WorldTownSession.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { t } from '../../../i18n/LanguageManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import { getRestMenu } from '../../../data/RestFacilityData';
import { useStore, useUiVersion } from '../UiContext';
import { ConfirmModal } from '../ConfirmModal';
import { restIcon } from './restIcon';

interface RestPanelProps {
    showMenus?: boolean;
    showTreatment?: boolean;
}

export function RestPanel({ showMenus = true, showTreatment = true }: RestPanelProps) {
    useUiVersion();
    const store = useStore();
    const facility = store.getRestFacility();
    const pendingId = store.getPendingRestMenuId();
    const injured = store.getInjuredCount();
    const treatmentPrice = store.getInjuryTreatmentPrice();

    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [confirmTreat, setConfirmTreat] = useState(false);
    const [feedback, setFeedback] = useState('');
    useEffect(() => {
        if (!feedback) return;
        const id = window.setTimeout(() => setFeedback(''), 2200);
        return () => window.clearTimeout(id);
    }, [feedback]);

    if (!facility && !showTreatment) return null;

    const purchase = (menuId: string) => {
        const ok = store.restPurchase(menuId);
        setFeedback(ok ? t('rest.purchased') : t('rest.noGold'));
        AudioManager.playUi(ok ? 'ui.confirm' : 'ui.cancel');
    };

    const clickMenu = (menuId: string) => {
        if (pendingId === menuId) { setFeedback(t('rest.current')); return; }
        if (pendingId) { setConfirmId(menuId); return; }
        purchase(menuId);
    };

    const treat = () => {
        const ok = store.restTreat();
        setFeedback(ok ? t('rest.treated') : t('rest.noGold'));
        AudioManager.playUi(ok ? 'ui.confirm' : 'ui.cancel');
    };

    const panelStyle = { width: 'min(780px, 92vw)', '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;

    return (
        <div className="ds-panel ds-rest" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">
                    {facility && showMenus ? `${restIcon(facility.type)} ${t(facility.nameKey)}` : `✚ ${t('town.facility.healer')}`}
                </span>
            </div>

            <div className="ds-rest__body">
                {showMenus && facility && (
                    <div className="ds-rest__current">
                        {t('rest.current')}: <strong>{pendingId ? t(getRestMenu(pendingId)?.nameKey ?? '') : t('rest.none')}</strong>
                    </div>
                )}

                {showMenus && facility && (
                    <div className="ds-rest__menus">
                        {facility.menu.map((menu) => {
                            const isCurrent = pendingId === menu.id;
                            return (
                                <div key={menu.id} className={`ds-rest__card${isCurrent ? ' is-current' : ''}`}>
                                    <div className="ds-rest__cardname">{t(menu.nameKey)}</div>
                                    <div className="ds-rest__carddesc">{t(menu.descKey)}</div>
                                    <div className="ds-rest__cardfoot">
                                        <span className="ds-rest__price">{menu.price}G</span>
                                        <button type="button" className={`ds-btn${isCurrent ? ' is-active' : ''}`} onClick={() => clickMenu(menu.id)}>
                                            {isCurrent ? t('rest.current') : t('rest.purchase')}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {showTreatment && (
                    <div className="ds-rest__injury">
                        <div>
                            <div className="ds-rest__injurytitle">{t('rest.injuryTitle')}</div>
                            <div className={`ds-rest__injurycount${injured > 0 ? ' is-injured' : ''}`}>
                                {injured > 0
                                    ? `${t('rest.injuryCount')}: ${injured} (${injured * treatmentPrice}G)`
                                    : t('rest.injuryNone')}
                            </div>
                        </div>
                        {injured > 0 && <button type="button" className="ds-btn is-active" onClick={() => setConfirmTreat(true)}>{t('rest.treat')}</button>}
                    </div>
                )}

                <div className="ds-rest__feedback" role="status" aria-live="polite">{feedback}</div>
            </div>

            {confirmId && (
                <ConfirmModal
                    title={t('rest.replaceTitle')}
                    confirmLabel={t('rest.confirm')}
                    cancelLabel={t('rest.cancel')}
                    onConfirm={() => { const id = confirmId; setConfirmId(null); purchase(id); }}
                    onCancel={() => setConfirmId(null)}
                >
                    <div className="ds-modal__line">
                        {t(getRestMenu(confirmId)?.nameKey ?? '')} — {t('rest.replaceDesc')}
                    </div>
                </ConfirmModal>
            )}

            {confirmTreat && (
                <ConfirmModal
                    title={t('rest.injuryTitle')}
                    confirmLabel={t('rest.treat')}
                    cancelLabel={t('rest.cancel')}
                    onConfirm={() => { setConfirmTreat(false); treat(); }}
                    onCancel={() => setConfirmTreat(false)}
                >
                    <div className="ds-modal__line">
                        {`${t('rest.injuryCount')}: ${injured} (${injured * treatmentPrice}G)`}
                    </div>
                </ConfirmModal>
            )}
        </div>
    );
}
