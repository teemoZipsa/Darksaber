import type { CSSProperties, KeyboardEvent } from 'react';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import { formatT, t } from '../../../i18n/LanguageManager';
import { formatItemName } from '../../../i18n/DisplayNames';
import { formatTownName } from '../../../i18n/TownMessages';
import type { ItemSnapshot, RaidResultType } from '../../../raid/RaidOutcome';
import { useStore, useUiVersion } from '../UiContext';
import { useModalDialog } from '../useModalDialog';

function resultTitle(result: RaidResultType): string {
    if (result === 'SURVIVED') return t('raid.result.survived');
    if (result === 'LEFT') return t('field.expedition.return');
    if (result === 'MIA') return t('raid.result.mia');
    return t('raid.result.failed');
}

function duration(total: number): string {
    const seconds = Math.max(0, Math.floor(total));
    return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function ItemList({ items }: { items: ItemSnapshot[] }) {
    return <ul className="ds-result__items">
        {items.map((item, index) => <li key={`${item.id}:${index}`}>
            <span>{formatItemName(item)}</span><b>×{item.quantity.toLocaleString()}</b>
        </li>)}
    </ul>;
}

export function RaidResultPanel() {
    useUiVersion();
    const store = useStore();
    const dialogRef = useModalDialog<HTMLDivElement>();
    const outcome = store.getRaidOutcome();
    if (!outcome) return null;
    const style = { '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;
    const title = resultTitle(outcome.result);
    const hasRewards = outcome.secured.length > 0 || (outcome.goldReward ?? 0) > 0 || (outcome.questRewards?.length ?? 0) > 0;
    const confirm = () => {
        AudioManager.playUi('ui.confirm');
        store.confirmRaidOutcome();
    };
    const onKeyDown = (event: KeyboardEvent) => {
        // The dialog also owns game shortcuts, so they cannot open panels behind it.
        event.stopPropagation();
        if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!event.repeat) confirm();
        }
    };

    return <div className="ds-scrim ds-result-scrim" onClick={confirm} onKeyDown={onKeyDown}>
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="raid-result-title" tabIndex={-1}
            data-testid="raid-result" className={`ds-panel ds-result${outcome.result === 'DEAD' ? ' is-danger' : ''}`} style={style}
            onClick={(event) => event.stopPropagation()}>
            <header className="ds-result__header">
                <img src="/assets/ui/field-forged/crest.png" alt="" aria-hidden="true" />
                <div>
                    <span className="ds-result__eyebrow">{t('raid.result.record')}</span>
                    <h1 id="raid-result-title">{title}</h1>
                    <p>{formatTownName(outcome.departureTownId)} <span aria-hidden="true">→</span> {formatTownName(outcome.extractionTownId ?? outcome.departureTownId)}</p>
                </div>
            </header>
            <div className="ds-result__body" role="region" aria-label={t('raid.result.details')} tabIndex={0}>
                <dl className="ds-result__stats">
                    <div><dt>{t('raid.result.duration')}</dt><dd>{duration(outcome.elapsedSeconds)}</dd></div>
                    <div><dt>{t('raid.result.kills')}</dt><dd>{outcome.kills.toLocaleString()}</dd></div>
                    <div><dt>{t('raid.result.gold')}</dt><dd className="ds-result__gold">{(outcome.goldReward ?? 0) > 0 ? '+' : ''}{(outcome.goldReward ?? 0).toLocaleString()} G</dd></div>
                </dl>
                {outcome.missionReport && <section className="ds-result__report">
                    <h2>{outcome.missionReport.title}</h2>
                    <ul>{outcome.missionReport.lines.map((line, index) => <li key={index} className={`is-${line.kind}`}>{line.text}</li>)}</ul>
                </section>}
                <div className="ds-result__columns">
                    <section className="ds-result__rewards">
                        <h2>{t('raid.result.rewardsAndLosses')}</h2>
                        {outcome.secured.length > 0 && <ItemList items={outcome.secured} />}
                        {(outcome.goldReward ?? 0) > 0 && <p className="ds-result__gold">{formatT('raid.result.goldReward', { gold: (outcome.goldReward ?? 0).toLocaleString() })}</p>}
                        {(outcome.questRewards?.length ?? 0) > 0 && <ul className="ds-result__quests">{outcome.questRewards!.map((reward, index) => <li key={index}>{reward}</li>)}</ul>}
                        {!hasRewards && <p className="ds-result__muted">{t('raid.result.noChanges')}</p>}
                        {outcome.lost.length > 0 && <section className="ds-result__losses"><h3>{t('raid.result.lostBackpack')}</h3><ItemList items={outcome.lost} /></section>}
                        {outcome.equipmentLost.length > 0 && <section className="ds-result__losses"><h3>{t('raid.result.lostEquipment')}</h3><ul>
                            {outcome.equipmentLost.map((loss, index) => <li key={index}>{loss.characterName}: {formatItemName(loss.item)}</li>)}
                        </ul></section>}
                    </section>
                    <section className="ds-result__party">
                        <h2>{t('raid.result.heroes')}</h2>
                        {(outcome.heroStatuses?.length ?? 0) === 0 && <p className="ds-result__muted">{t('raid.result.noHeroes')}</p>}
                        {outcome.heroStatuses?.map((hero) => <div key={hero.characterId} className={`ds-result__hero${hero.isDead ? ' is-down' : ''}`}>
                            <h3>{hero.characterName}</h3>
                            <span>{hero.isDead ? t('raid.result.downed') : formatT('raid.result.hp', { hp: hero.hp.toLocaleString(), max: hero.maxHp.toLocaleString() })}</span>
                            <meter min={0} max={Math.max(1, hero.maxHp)} value={Math.max(0, hero.hp)} aria-label={formatT('raid.result.heroHp', { name: hero.characterName })} />
                        </div>)}
                    </section>
                </div>
                {(outcome.notes?.length ?? 0) > 0 && <ul className="ds-result__notes">{outcome.notes!.map((note, index) => <li key={index}>{note}</li>)}</ul>}
            </div>
            <footer className="ds-result__footer">
                <span>{t('raid.result.continueHint')}</span>
                <button type="button" className="ds-btn is-active" onClick={confirm}>{t('raid.result.continue')}</button>
            </footer>
        </div>
    </div>;
}
