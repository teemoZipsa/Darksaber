import { formatT, i18n, t } from '../../../i18n/LanguageManager';
import { formatTownName } from '../../../i18n/TownMessages';
import type { RaidHistoryEntry, RaidHistoryResult } from '../../../raid/RaidHistory';
import { useStore } from '../UiContext';

export function RaidHistoryList() {
    const store = useStore();
    return <RaidHistoryEntries entries={store.getRaidHistory()} />;
}

export function RaidHistoryEntries({ entries }: { entries: readonly RaidHistoryEntry[] }) {
    return (
        <div className="ds-raid-history" aria-label={t('raid.history.title')}>
            <div className="ds-raid-history__intro">{t('raid.history.recentHint')}</div>
            {entries.length === 0 && (
                <div className="ds-raid-history__empty">{t('raid.history.empty')}</div>
            )}
            {entries.map((entry) => (
                <article key={entry.id} className={`ds-raid-history__entry is-${entry.result.toLowerCase()}`}>
                    <div className="ds-raid-history__head">
                        <span className="ds-raid-history__result">{raidResultLabel(entry.result)}</span>
                        <time dateTime={new Date(entry.completedAt).toISOString()}>
                            {formatRaidHistoryDate(entry.completedAt)}
                        </time>
                    </div>
                    <div className="ds-raid-history__route">
                        {formatT('raid.history.route', {
                            from: formatTownName(entry.departureTownId),
                            to: formatTownName(entry.extractionTownId),
                        })}
                    </div>
                    <dl className="ds-raid-history__stats">
                        <RaidHistoryStat label={t('raid.history.duration')} value={formatRaidDuration(entry.elapsedSeconds)} />
                        <RaidHistoryStat label={t('raid.history.kills')} value={entry.kills} />
                        <RaidHistoryStat label={t('raid.history.secured')} value={entry.securedItems} />
                        <RaidHistoryStat label={t('raid.history.lost')} value={entry.lostItems} />
                        <RaidHistoryStat label={t('raid.history.equipmentLost')} value={entry.equipmentLost} />
                        <RaidHistoryStat label={t('raid.history.gold')} value={`${entry.goldReward}G`} />
                    </dl>
                </article>
            ))}
        </div>
    );
}

function RaidHistoryStat({ label, value }: { label: string; value: string | number }) {
    return (
        <div>
            <dt>{label}</dt>
            <dd>{value}</dd>
        </div>
    );
}

function raidResultLabel(result: RaidHistoryResult): string {
    switch (result) {
        case 'SURVIVED': return t('raid.history.result.survived');
        case 'DEAD': return t('raid.history.result.dead');
        case 'MIA': return t('raid.history.result.mia');
        case 'LEFT': return t('raid.history.result.left');
    }
}

function formatRaidHistoryDate(timestamp: number): string {
    return new Intl.DateTimeFormat(i18n.lang === 'ko' ? 'ko-KR' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp));
}

function formatRaidDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const remaining = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remaining}`;
}
