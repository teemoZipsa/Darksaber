import { t, formatT } from '../../../i18n/LanguageManager';
import { useStore, useUiVersion } from '../UiContext';

export function FieldHud() {
    useUiVersion();
    const store = useStore();
    const state = store.getFieldHudView();
    if (!state) return null;
    const clock = `${Math.floor(state.elapsed / 60).toString().padStart(2, '0')}:${(state.elapsed % 60).toString().padStart(2, '0')}`;
    return (
        <div className={`ds-field-hud${state.controlsOpen ? ' is-menu-open' : ''}`} data-testid="field-hud">
            <section className="ds-field-hero" aria-label={t('field.expedition.character')}>
                <div className="ds-field-hero__identity">
                    <img className="ds-field-crest" src="/assets/ui/field-forged/crest.png" alt="" aria-hidden="true" />
                    <div className="ds-field-hero__identity-text">
                        <div className="ds-field-hero__eyebrow">{t('field.expedition.subtitle')}</div>
                        <div className="ds-field-hero__name"><span className="ds-field-hero__title" title={state.name}>{state.name}</span><span className="ds-field-hero__level">{formatT('field.expedition.level', { level: state.level })}</span></div>
                        <div className="ds-field-hero__class">{state.tierName}</div>
                    </div>
                </div>
                <div className="ds-field-resource"><span>{t('field.expedition.hp')}</span><meter className="ds-field-hp" min={0} max={state.maxHp} value={state.hp} /><b>{state.hp} / {state.maxHp}</b></div>
                <div className="ds-field-resource"><span>{t('field.expedition.mp')}</span><meter className="ds-field-mp" min={0} max={Math.max(1, state.maxMp)} value={state.mp} /><b>{state.mp} / {state.maxMp}</b></div>
                <div className="ds-field-hero__progress"><span>{t('field.expedition.experience')}</span><span>{state.exp} / {state.expToNext}</span></div>
                <progress max={state.expToNext} value={state.exp} aria-label={t('field.expedition.experience')} />
            </section>
            <section className={`ds-field-expedition${state.threat ? ' is-danger' : ''}`} aria-label={t('field.expedition.title')}>
                <div className="ds-field-expedition__heading"><span className="ds-field-mode">{t(state.threat ? 'field.expedition.combat' : 'field.expedition.explore')}</span><span>{state.world}</span></div>
                <div className="ds-field-expedition__stats"><span>{formatT('field.expedition.kills', { count: state.kills })}</span><span>{formatT('field.expedition.items', { count: state.items })}</span><span>{state.gold.toLocaleString()} G</span><time>{clock}</time></div>
                {state.bounty && <div className="ds-field-expedition__rule">{state.bounty}</div>}
            </section>
            {!state.controlsOpen && <section className={`ds-field-guide${state.threat ? ' is-danger' : ''}`} aria-label={t('field.expedition.controls')}>
                {state.hunt && !state.threat && <div className="ds-field-hunt" data-testid="field-hunt">
                    <div className="ds-field-hunt__steps" aria-hidden="true">{Array.from({ length: state.hunt.total }, (_, index) => <span key={index} className={index < state.hunt!.cleared ? 'is-complete' : index === state.hunt!.cleared ? 'is-current' : ''}>{index < state.hunt!.cleared ? '✓' : index + 1}</span>)}</div>
                    <div className="ds-field-hunt__text">
                        <span className="ds-field-hunt__heading">{t('field.hunt.title')} <span>{state.hunt.cleared} / {state.hunt.total}</span></span>
                        <strong>{state.hunt.target ? formatT('field.hunt.target', { name: state.hunt.target.name, level: state.hunt.target.level, count: state.hunt.target.remaining }) : t('field.hunt.cleared')}</strong>
                        <span>{state.hunt.target ? formatT('field.hunt.distance', { distance: state.hunt.target.distance }) : t('field.hunt.returnHint')}</span>
                    </div>
                    {state.hunt.target && !state.travelling && <button type="button" className="ds-btn" disabled={state.hunt.target.distance <= 1} onClick={() => store.guideToNearbyHunt()}>{t(state.hunt.target.distance <= 1 ? 'field.hunt.ready' : 'field.hunt.guide')}</button>}
                </div>}
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
