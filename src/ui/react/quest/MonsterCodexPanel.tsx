import { useMemo, useState, type CSSProperties } from 'react';
import {
    MONSTER_DEFINITIONS,
    MONSTER_IDS,
    MONSTER_SPRITE_PATH,
    type MonsterDefinition,
    type MonsterFamily,
    type MonsterId,
} from '../../../data/MonsterCatalog';
import { getNormalizedMonsterBalance } from '../../../data/original/originalMonsterBalance';
import type { EnemyRole } from '../../../field/EnemyAI';
import { formatMonsterName } from '../../../i18n/DisplayNames';
import { formatT, i18n, t } from '../../../i18n/LanguageManager';
import {
    getMonsterCodexProgress,
    normalizeMonsterCodex,
    type MonsterCodexEntry,
} from '../../../raid/MonsterCodex';
import { useStore } from '../UiContext';

const MONSTER_FAMILIES: readonly MonsterFamily[] = [
    'human', 'undead', 'beast', 'beastfolk', 'demon', 'giant', 'reptile', 'fae',
];

export function MonsterCodexPanel() {
    const store = useStore();
    return <MonsterCodex entries={store.getMonsterCodex()} />;
}

export function MonsterCodex({ entries }: { entries: readonly MonsterCodexEntry[] }) {
    const [query, setQuery] = useState('');
    const [family, setFamily] = useState<'all' | MonsterFamily>('all');
    const [selectedId, setSelectedId] = useState<MonsterId>(MONSTER_IDS[0]);
    const normalized = useMemo(() => normalizeMonsterCodex(entries), [entries]);
    const entryById = useMemo(() => new Map(normalized.map((entry) => [entry.monsterId, entry])), [normalized]);
    const progress = getMonsterCodexProgress(normalized);
    const normalizedQuery = query.trim().toLocaleLowerCase(i18n.lang === 'ko' ? 'ko-KR' : 'en-US');
    const visibleIds = MONSTER_IDS.filter((monsterId) => {
        const definition = MONSTER_DEFINITIONS[monsterId];
        if (family !== 'all' && definition.family !== family) return false;
        if (!normalizedQuery) return true;
        const entry = entryById.get(monsterId);
        if (!entry) return false;
        return `${formatMonsterName(definition)} ${monsterId}`.toLocaleLowerCase(
            i18n.lang === 'ko' ? 'ko-KR' : 'en-US',
        ).includes(normalizedQuery);
    });
    const activeId = visibleIds.includes(selectedId) ? selectedId : visibleIds[0];

    return (
        <section className="ds-monster-codex" aria-label={t('codex.title')}>
            <div className="ds-monster-codex__summary">
                <div>
                    <strong>{t('codex.title')}</strong>
                    <span>{t('codex.intro')}</span>
                </div>
                <dl>
                    <div>
                        <dt>{t('codex.encountered')}</dt>
                        <dd>{progress.encountered}/{progress.total}</dd>
                    </div>
                    <div>
                        <dt>{t('codex.defeated')}</dt>
                        <dd>{progress.defeated}/{progress.total}</dd>
                    </div>
                </dl>
            </div>

            <div className="ds-monster-codex__controls">
                <label>
                    <span className="ds-sr-only">{t('codex.search')}</span>
                    <input
                        type="search"
                        value={query}
                        placeholder={t('codex.searchPlaceholder')}
                        onChange={(event) => setQuery(event.currentTarget.value)}
                    />
                </label>
                <label>
                    <span className="ds-sr-only">{t('codex.familyFilter')}</span>
                    <select value={family} onChange={(event) => setFamily(event.currentTarget.value as 'all' | MonsterFamily)}>
                        <option value="all">{t('codex.family.all')}</option>
                        {MONSTER_FAMILIES.map((value) => (
                            <option key={value} value={value}>{familyLabel(value)}</option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="ds-monster-codex__body">
                <div className="ds-monster-codex__list" role="group" aria-label={t('codex.entries')}>
                    {visibleIds.map((monsterId) => {
                        const definition = MONSTER_DEFINITIONS[monsterId];
                        const entry = entryById.get(monsterId);
                        const state = entry ? (entry.kills > 0 ? 'defeated' : 'encountered') : 'locked';
                        const index = MONSTER_IDS.indexOf(monsterId) + 1;
                        const label = entry
                            ? formatMonsterName(definition)
                            : formatT('codex.unknownEntry', { index: index.toString().padStart(2, '0') });
                        return (
                            <button
                                key={monsterId}
                                type="button"
                                aria-pressed={activeId === monsterId}
                                className={`ds-monster-codex__entry is-${state}${activeId === monsterId ? ' is-selected' : ''}`}
                                onClick={() => setSelectedId(monsterId)}
                            >
                                <MonsterPortrait definition={definition} locked={!entry} size="small" />
                                <span className="ds-monster-codex__entry-copy">
                                    <small>#{index.toString().padStart(2, '0')}</small>
                                    <strong>{entry ? formatMonsterName(definition) : '???'}</strong>
                                    <span>{codexStateLabel(entry)}</span>
                                </span>
                                <span className="ds-monster-codex__entry-mark" aria-hidden="true">
                                    {state === 'defeated' ? '◆' : state === 'encountered' ? '◇' : '·'}
                                </span>
                                <span className="ds-sr-only">{label}</span>
                            </button>
                        );
                    })}
                    {visibleIds.length === 0 && (
                        <div className="ds-monster-codex__empty">{t('codex.noResults')}</div>
                    )}
                </div>
                <MonsterCodexDetail
                    monsterId={activeId}
                    entry={activeId ? entryById.get(activeId) : undefined}
                />
            </div>
        </section>
    );
}

function MonsterCodexDetail({ monsterId, entry }: { monsterId?: MonsterId; entry?: MonsterCodexEntry }) {
    if (!monsterId) {
        return <div className="ds-monster-codex__detail is-empty">{t('codex.noResults')}</div>;
    }
    const definition = MONSTER_DEFINITIONS[monsterId];
    const index = MONSTER_IDS.indexOf(monsterId) + 1;
    if (!entry) {
        return (
            <article className="ds-monster-codex__detail is-locked">
                <MonsterPortrait definition={definition} locked size="large" />
                <small>#{index.toString().padStart(2, '0')}</small>
                <h3>???</h3>
                <span className="ds-monster-codex__locked-state">{t('codex.state.locked')}</span>
                <p>{t('codex.lockedHint')}</p>
            </article>
        );
    }

    const defeated = entry.kills > 0;
    const balanceLevel = defeated ? entry.highestDefeatedLevel : definition.level;
    const stats = defeated ? getNormalizedMonsterBalance(monsterId, balanceLevel).stats : null;
    return (
        <article className={`ds-monster-codex__detail is-${defeated ? 'defeated' : 'encountered'}`}>
            <div className="ds-monster-codex__identity">
                <MonsterPortrait definition={definition} locked={false} size="large" />
                <div>
                    <small>#{index.toString().padStart(2, '0')} · {monsterId}</small>
                    <h3>{formatMonsterName(definition)}</h3>
                    <span>{codexStateLabel(entry)}</span>
                </div>
            </div>

            <dl className="ds-monster-codex__facts">
                <CodexFact label={t('codex.family')} value={familyLabel(definition.family)} />
                <CodexFact label={t('codex.role')} value={roleLabel(definition.role)} />
                <CodexFact label={t('codex.levelBand')} value={`${definition.levelBand[0]}–${definition.levelBand[1]}`} />
                <CodexFact label={t('codex.habitat')} value={definition.spawnTags.map(habitatLabel).join(' · ')} />
                <CodexFact label={t('codex.encounters')} value={entry.encounters} />
                <CodexFact label={t('codex.kills')} value={entry.kills} />
            </dl>

            <div className="ds-monster-codex__lore">
                <p>{t(`codex.family.${definition.family}.desc`)}</p>
                <p>{t(`codex.role.${definition.role}.desc`)}</p>
            </div>

            {stats ? (
                <div className="ds-monster-codex__combat">
                    <div className="ds-monster-codex__subhead">
                        <span>{t('codex.combatProfile')}</span>
                        <span>{formatT('codex.statsAtLevel', { level: balanceLevel })}</span>
                    </div>
                    <dl>
                        <CodexStat label="HP" value={stats.maxHp} />
                        <CodexStat label="MP" value={stats.maxMp} />
                        <CodexStat label="ATK" value={stats.atk} />
                        <CodexStat label="DEF" value={stats.def} />
                        <CodexStat label="MAG" value={stats.magAtk} />
                        <CodexStat label="MDEF" value={stats.magDef} />
                        <CodexStat label="SPD" value={stats.spd} />
                        <CodexStat label="MOV" value={stats.mov} />
                    </dl>
                    <div className="ds-monster-codex__record">
                        {formatT('codex.highestDefeatedLevel', { level: entry.highestDefeatedLevel })}
                        {' · '}
                        {formatT('codex.lastDefeated', { date: formatCodexDate(entry.lastDefeatedAt) })}
                    </div>
                </div>
            ) : (
                <div className="ds-monster-codex__combat is-locked">
                    <strong>{t('codex.combatProfileLocked')}</strong>
                    <span>{t('codex.defeatHint')}</span>
                </div>
            )}
        </article>
    );
}

function MonsterPortrait({
    definition,
    locked,
    size,
}: {
    definition: MonsterDefinition;
    locked: boolean;
    size: 'small' | 'large';
}) {
    const frame = definition.frameSize;
    const spriteStyle = {
        width: `${frame}px`,
        height: `${frame}px`,
        backgroundImage: `url(${MONSTER_SPRITE_PATH}/${definition.sprite})`,
        backgroundSize: `${frame * definition.frameCount}px ${frame * 4}px`,
        backgroundPosition: `${-frame}px ${-frame}px`,
        '--codex-sprite-scale': size === 'large'
            ? Math.min(2.3, Math.max(1.45, definition.renderScale))
            : Math.min(1.45, Math.max(0.8, definition.renderScale)),
    } as CSSProperties;
    return (
        <span className={`ds-monster-codex__portrait is-${size}${locked ? ' is-locked' : ''}`} aria-hidden="true">
            <span className="ds-monster-codex__sprite" style={spriteStyle} />
        </span>
    );
}

function CodexFact({ label, value }: { label: string; value: string | number }) {
    return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function CodexStat({ label, value }: { label: string; value: string | number }) {
    return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function codexStateLabel(entry: MonsterCodexEntry | undefined): string {
    if (!entry) return t('codex.state.locked');
    return entry.kills > 0 ? t('codex.state.defeated') : t('codex.state.encountered');
}

function familyLabel(family: MonsterFamily): string {
    return t(`codex.family.${family}`);
}

function roleLabel(role: EnemyRole): string {
    return t(`codex.role.${role}`);
}

function habitatLabel(habitat: string): string {
    return t(`codex.habitat.${habitat}`);
}

function formatCodexDate(timestamp: number | undefined): string {
    if (!timestamp) return t('codex.unknownDate');
    return new Intl.DateTimeFormat(i18n.lang === 'ko' ? 'ko-KR' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
    }).format(new Date(timestamp));
}
