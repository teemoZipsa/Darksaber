/** ResourceBars — HP / MP / EXP gauges for the active character. */

import type { Character } from '../../../character/Character';
import { t } from '../../../i18n/LanguageManager';

function Bar({
    kind,
    label,
    value,
    max,
    low,
}: {
    kind: 'hp' | 'mp' | 'exp';
    label: string;
    value: number;
    max: number;
    low?: boolean;
}) {
    const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    const cls = `ds-bar ds-bar--${kind}${low ? ' is-low' : ''}`;
    return (
        <div
            className={cls}
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={Math.round(max)}
            aria-valuenow={Math.round(value)}
            aria-valuetext={`${Math.round(value)} / ${Math.round(max)}`}
        >
            <div className="ds-bar__fill" style={{ width: `${pct * 100}%` }} />
            <div className="ds-bar__label">
                <span>{label}</span>
                <span>{Math.round(value)} / {Math.round(max)}</span>
            </div>
        </div>
    );
}

export function ResourceBars({ char }: { char: Character }) {
    const st = char.stats;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Bar
                kind="hp"
                label={t('stat.hp')}
                value={st.hp}
                max={st.maxHp}
                low={st.maxHp > 0 && st.hp / st.maxHp < 0.3}
            />
            <Bar kind="mp" label={t('stat.mp')} value={st.mp} max={st.maxMp} />
            <Bar kind="exp" label={t('info.exp')} value={char.exp} max={char.expToNext} />
        </div>
    );
}
