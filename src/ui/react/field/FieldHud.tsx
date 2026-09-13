import { t, formatT } from '../../../i18n/LanguageManager';
import { useStore, useUiVersion } from '../UiContext';

export function FieldHud() {
    useUiVersion();
    const store = useStore();
    const state = store.getFieldHudView();
    if (!state) return null;
    const clock = `${Math.floor(state.elapsed / 60).toString().padStart(2, '0')}:${(state.elapsed % 60).toString().padStart(2, '0')}`;
    return (
        <div className="ds-field-hud" data-testid="field-hud">
            <section className="ds-field-hero" aria-label={t('field.expedition.character')}>
                <div className="ds-field-hero__eyebrow">DARKSABER <span>{t('field.expedition.subtitle')}</span></div>
                <div className="ds-field-hero__name">{state.name}<span>{formatT('field.expedition.level', { level: state.level })}</span></div>
                <div className="ds-field-hero__class">{state.tierName}</div>
                <div className="ds-field-resource"><span>{t('field.expedition.hp')}</span><meter className="ds-field-hp" min={0} max={state.maxHp} value={state.hp} /><b>{state.hp} / {state.maxHp}</b></div>
                <div className="ds-field-resource"><span>{t('field.expedition.mp')}</span><meter className="ds-field-mp" min={0} max={Math.max(1, state.maxMp)} value={state.mp} /><b>{state.mp} / {state.maxMp}</b></div>
                <div className="ds-field-hero__progress"><span>{t('field.expedition.experience')}</span><span>{state.exp} / {state.expToNext}</span></div>
                <progress max={state.expToNext} value={state.exp} aria-label={t('field.expedition.experience')} />
            </section>
            <section className={`ds-field-expedition${state.threat ? ' is-danger' : ''}`} aria-label={t('field.expedition.title')}>
                <div className="ds-field-expedition__heading"><span className="ds-field-mode">{t(state.threat ? 'field.expedition.combat' : 'field.expedition.explore')}</span><span>{state.world}</span></div>
                <div className="ds-field-expedition__stats"><span>{formatT('field.expedition.kills', { count: state.kills })}</span><span>{formatT('field.expedition.items', { count: state.items })}</span><span>{state.gold.toLocaleString()} G</span><time>{clock}</time></div>
                <div className="ds-field-expedition__rule">{state.bounty ?? t('field.expedition.rule')}</div>
            </section>
            {!state.controlsOpen && <section className={`ds-field-guide${state.threat ? ' is-danger' : ''}`} aria-label={t('field.expedition.controls')}>
                <div className="ds-field-guide__text">
                    <strong role="status">{state.threat ? formatT('field.expedition.combatAp', { ap: state.ap }) : t(`field.travel.${state.travel}`)}</strong>
                    <span>{state.travelling ? formatT('field.travel.remaining', { distance: state.distance }) : t(state.threat || state.interior ? 'field.expedition.combatHint' : 'field.expedition.moveHint')}</span>
                </div>
                {state.travelling
                    ? <button type="button" className="ds-btn" onClick={() => store.stopFieldTravel()}>{t('field.travel.stop')}</button>
                    : <button type="button" className="ds-btn" disabled={!state.canReturn} onClick={() => store.returnFromField()}>{t('field.expedition.return')}</button>}
            </section>}
        </div>
    );
}
