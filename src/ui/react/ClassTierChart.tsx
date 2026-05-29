import type { CSSProperties } from 'react';
import {
    ALL_BASE_CLASS_LINES,
    MASTER_CLASSES,
    MasterBranch,
    getMasterClassLineId,
    type ClassLine,
    type ClassTier,
} from '../../data/ClassTree';
import { i18n, t } from '../../i18n/LanguageManager';

const BASE_LINE_ORDER = [
    'infantry',
    'flying',
    'cavalry',
    'naval',
    'lancer',
    'archer',
    'cleric',
    'priest',
    'shrine',
    'mage',
    'cultist',
    'alchemist',
];

const MASTER_IMAGE_FALLBACKS: Record<string, Record<number, string>> = {
    master_healer: {
        8: '/assets/images/characters/darksaber/cleric_t7.png',
        9: '/assets/images/characters/darksaber/priest_t7.png',
        10: '/assets/images/characters/darksaber/shrine_t7.png',
    },
};

const baseLines = BASE_LINE_ORDER
    .map((id) => ALL_BASE_CLASS_LINES.find((line) => line.id === id))
    .filter((line): line is ClassLine => Boolean(line));

const lineColumn = new Map(baseLines.map((line, index) => [line.id, index + 2]));

function branchLabel(branch: MasterBranch): string {
    return t(`tierChart.branch.${branch}`);
}

function displayTierName(tier: ClassTier): string {
    return i18n.lang === 'ko' ? tier.nameKr : tier.nameEn;
}

function displayLineName(line: ClassLine): string {
    return i18n.lang === 'ko' ? line.nameKr : line.nameEn;
}

function portraitSrc(lineId: string, tier: number): string {
    const fallback = MASTER_IMAGE_FALLBACKS[lineId]?.[tier];
    if (fallback) return fallback;
    return `/assets/images/characters/darksaber/${lineId}_t${tier}.png`;
}

function chartCellStyle(column: number, row: number, span: number = 1): CSSProperties {
    return { gridColumn: `${column} / span ${span}`, gridRow: row };
}

function TierCard({
    name,
    image,
    branch,
    style,
    isMaster = false,
}: {
    name: string;
    image: string;
    branch: MasterBranch;
    style: CSSProperties;
    isMaster?: boolean;
}) {
    return (
        <div className={`ds-tier-card is-${branch}${isMaster ? ' is-master' : ''}`} style={style} title={name}>
            <img className="ds-tier-card__img" src={image} alt="" draggable={false} />
            <span className="ds-tier-card__name">{name}</span>
        </div>
    );
}

export function ClassTierChart() {
    return (
        <div className="ds-tier-chart" aria-label={t('tierChart.title')}>
            <div className="ds-tier-chart__topline">
                <div>
                    <div className="ds-tier-chart__title">{t('tierChart.title')}</div>
                    <div className="ds-tier-chart__hint">{t('tierChart.masterHint')}</div>
                </div>
                <div className="ds-tier-chart__legend" aria-hidden>
                    {(['battle', 'tactics', 'healer', 'magic'] as MasterBranch[]).map((branch) => (
                        <span key={branch} className={`ds-tier-chart__legenditem is-${branch}`}>
                            {branchLabel(branch)}
                        </span>
                    ))}
                </div>
            </div>

            <div className="ds-tier-chart__scroll">
                <div className="ds-tier-chart__grid">
                    <div className="ds-tier-chart__corner" style={chartCellStyle(1, 1)}>{t('tierChart.tier')}</div>
                    {baseLines.map((line) => (
                        <div
                            key={line.id}
                            className={`ds-tier-chart__linehead is-${line.branch}`}
                            style={chartCellStyle(lineColumn.get(line.id) ?? 2, 1)}
                            title={displayLineName(line)}
                        >
                            {displayLineName(line)}
                        </div>
                    ))}

                    {Array.from({ length: 10 }, (_, index) => index + 1).map((tier) => (
                        <div key={tier} className="ds-tier-chart__tierhead" style={chartCellStyle(1, tier + 1)}>
                            T{tier}
                        </div>
                    ))}

                    {baseLines.flatMap((line) => (
                        line.tiers.map((tier) => (
                            <TierCard
                                key={`${line.id}-${tier.tier}`}
                                name={displayTierName(tier)}
                                image={portraitSrc(line.id, tier.tier)}
                                branch={line.branch}
                                style={chartCellStyle(lineColumn.get(line.id) ?? 2, tier.tier + 1)}
                            />
                        ))
                    ))}

                    {MASTER_CLASSES.map((master) => {
                        const columns = master.requiredClassIds
                            .map((lineId) => lineColumn.get(lineId))
                            .filter((column): column is number => Boolean(column));
                        const start = Math.min(...columns);
                        const span = Math.max(...columns) - start + 1;
                        const lineId = getMasterClassLineId(master.branch);

                        return master.tiers.map((tier) => (
                            <TierCard
                                key={`${lineId}-${tier.tier}`}
                                name={displayTierName(tier)}
                                image={portraitSrc(lineId, tier.tier)}
                                branch={master.branch}
                                style={chartCellStyle(start, tier.tier + 1, span)}
                                isMaster
                            />
                        ));
                    })}
                </div>
            </div>
        </div>
    );
}
