/**
 * StatGrid — basic info block (name/class/level/exp/age/gender/money) plus the
 * classic 16-stat detail grid. Mirrors the data shown by the old canvas panel.
 */

import type { Character } from '../../../character/Character';
import { t } from '../../../i18n/LanguageManager';

function Row({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="ds-stat-row">
            <span className="ds-stat-row__label">{label}</span>
            <span className="ds-stat-row__value">{value}</span>
        </div>
    );
}

export function StatGrid({ char, gold }: { char: Character; gold: number }) {
    const st = char.stats;

    const left: Array<[string, string | number]> = [
        ['stat.hp', st.maxHp],
        ['stat.mp', st.maxMp],
        ['stat.atk', st.atk],
        ['stat.def', st.def],
        ['stat.actionLimit', st.actionLimit],
        ['stat.mov', st.mov],
        ['stat.magAtk', st.magAtk],
        ['stat.magDef', st.magDef],
    ];
    const right: Array<[string, string | number]> = [
        ['stat.hit', st.hitRate],
        ['stat.eva', st.evasion],
        ['stat.crit', st.critRate],
        ['stat.magHit', st.magHit],
        ['stat.magEva', st.magEva],
        ['stat.cmd', st.cmdRange],
        ['stat.atkMod', st.atkMod],
        ['stat.defMod', st.defMod],
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Basic info */}
            <div>
                <Row label={t('info.name')} value={char.name} />
                <Row label={t('info.class')} value={char.getTierName()} />
                <Row label={t('info.level')} value={char.level} />
                <Row label={t('info.age')} value={char.age} />
                <Row label={t('info.gender')} value={char.gender === 'F' ? t('create.female') : t('create.male')} />
                <Row label={t('info.money')} value={gold} />
            </div>

            {/* 16-stat detail grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 14 }}>
                <div>{left.map(([k, v]) => <Row key={k} label={t(k)} value={v} />)}</div>
                <div>{right.map(([k, v]) => <Row key={k} label={t(k)} value={v} />)}</div>
            </div>
        </div>
    );
}
