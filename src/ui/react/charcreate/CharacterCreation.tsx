/**
 * CharacterCreation — DD-styled DOM replacement for the canvas CharacterCreationUI.
 *
 * Full-screen creation screen (its own game state, not a world overlay): pick a
 * class card, name the commander, choose a gender, confirm. On confirm it delegates
 * to UiStore → GameManager.completeCharacterCreation, which builds the character and
 * transitions into the world. Selection state lives locally (pure UI).
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { t } from '../../../i18n/LanguageManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import { CHAR_CLASSES, type CharConfig } from '../../../data/characterClasses';
import { useStore } from '../UiContext';

const STAT_ROWS: Array<{ key: keyof Pick<CharConfig, 'hp' | 'atk' | 'def' | 'mag'>; labelKey: string; color: string }> = [
    { key: 'hp', labelKey: 'create.hp', color: '#e6a817' },
    { key: 'atk', labelKey: 'create.atk', color: '#dc3545' },
    { key: 'def', labelKey: 'create.def', color: '#3b82f6' },
    { key: 'mag', labelKey: 'create.mag', color: '#22c55e' },
];

function ClassPortrait({ cfg, size }: { cfg: CharConfig; size: number }) {
    const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
    const crop = cfg.portraitCrop;
    const inset = Math.max(6, Math.round(size * 0.07));
    const fitSize = size - inset * 2;
    const scale = (fitSize * (cfg.portraitScale ?? 1)) / Math.max(crop.w, crop.h);
    const dw = crop.w * scale;
    const dh = crop.h * scale;
    const offsetX = inset + (fitSize - dw) / 2;
    const offsetY = inset + (fitSize - dh) / 2;
    const imgStyle: CSSProperties = nat
        ? {
            position: 'absolute',
            width: nat.w * scale,
            height: nat.h * scale,
            left: offsetX - crop.x * scale,
            top: offsetY - crop.y * scale,
            imageRendering: 'pixelated',
        }
        : { opacity: 0 };
    return (
        <div className="cc-portrait" style={{ width: size, height: size }}>
            <img
                src={cfg.imageSrc}
                alt=""
                aria-hidden
                onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                style={imgStyle}
            />
        </div>
    );
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="cc-stat">
            <span className="cc-stat__label">{label}</span>
            <div className="cc-stat__bar">
                <div className="cc-stat__fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
            </div>
        </div>
    );
}

export function CharacterCreation() {
    const store = useStore();
    const [classIdx, setClassIdx] = useState(0);
    const [gender, setGender] = useState<'M' | 'F'>('M');
    const [name, setName] = useState('다크마스터');

    const confirm = () => {
        AudioManager.playUi('ui.confirm');
        store.charCreateComplete(name, CHAR_CLASSES[classIdx].id, gender);
    };

    const rootStyle = { '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;

    return (
        <div className="cc">
            <div className="cc__panel" style={rootStyle}>
                <div className="cc__title">{t('create.title')}</div>

                <div className="cc__classes">
                    {CHAR_CLASSES.map((cfg, i) => (
                        <button
                            key={cfg.id}
                            className={`cc-card${classIdx === i ? ' is-selected' : ''}`}
                            aria-pressed={classIdx === i}
                            onClick={() => { setClassIdx(i); AudioManager.playUi('ui.hover'); }}
                        >
                            <ClassPortrait cfg={cfg} size={92} />
                            <div className="cc-card__name">{t(cfg.labelKey)}</div>
                            <div className="cc-card__stats">
                                {STAT_ROWS.map((row) => (
                                    <StatBar key={row.key} label={t(row.labelKey)} value={cfg[row.key]} color={row.color} />
                                ))}
                            </div>
                        </button>
                    ))}
                </div>

                <div className="cc__field">
                    <span className="cc__label">{t('create.namePrompt')}</span>
                    <input
                        className="cc__input"
                        type="text"
                        maxLength={12}
                        value={name}
                        aria-label={t('create.namePrompt')}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
                    />
                </div>

                <div className="cc__field">
                    <span className="cc__label">{t('create.genderPrompt')}</span>
                    <div className="cc__genders" role="radiogroup" aria-label={t('create.genderPrompt')}>
                        <button
                            className={`ds-btn${gender === 'M' ? ' is-active' : ''}`}
                            role="radio"
                            aria-checked={gender === 'M'}
                            onClick={() => { setGender('M'); AudioManager.playUi('ui.hover'); }}
                        >
                            {t('create.male')}
                        </button>
                        <button
                            className={`ds-btn${gender === 'F' ? ' is-active' : ''}`}
                            role="radio"
                            aria-checked={gender === 'F'}
                            onClick={() => { setGender('F'); AudioManager.playUi('ui.hover'); }}
                        >
                            {t('create.female')}
                        </button>
                    </div>
                </div>

                <button className="cc__confirm" onClick={confirm}>{t('create.confirm')}</button>
            </div>
        </div>
    );
}
