/**
 * SettingsPanel — DD-styled DOM replacement for the canvas SettingsUI.
 *
 * Sections: sound / display / accessibility / language. Uses real form controls (toggle switches,
 * native range sliders, cycle buttons) instead of canvas-drawn widgets. All state
 * goes through SettingsManager (persisted); re-renders via useUiVersion when
 * observed settings/language values change. Labels are localized via t().
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { SettingsManager, type KeybindingDefinition, type KeybindingId } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import { i18n, t } from '../../../i18n/LanguageManager';
import { CURRENT_VERSION } from '../../../data/changelog';
import { useStore, useUiVersion } from '../UiContext';
import { useModalDialog } from '../useModalDialog';
import { ConfirmModal } from '../ConfirmModal';
import { ChangelogPanel } from './ChangelogPanel';

const S = SettingsManager;

// Small one-off layout values that do not need responsive behavior.
const styles = {
    sectionBody: { display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
    keyRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 } as CSSProperties,
    keyLabel: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
    keyButton: { minWidth: 58, padding: '4px 8px' } as CSSProperties,
    keyActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 } as CSSProperties,
};

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div>
            <div className="ds-section__title">{title}</div>
            <div style={styles.sectionBody}>{children}</div>
        </div>
    );
}

function Row({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className={`ds-row${className ? ` ${className}` : ''}`}>
            <span className="ds-row__label">{label}</span>
            {children}
        </div>
    );
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            className={`ds-toggle${on ? ' is-on' : ''}`}
            role="switch"
            aria-checked={on}
            aria-label={label}
            title={label}
            onClick={() => { onToggle(); AudioManager.playUi('ui.confirm'); }}
        >
            <span className="ds-toggle__knob" aria-hidden="true" />
        </button>
    );
}

function Cycle({ label, value, onCycle }: { label: string; value: string; onCycle: () => void }) {
    return (
        <button
            type="button"
            className="ds-btn"
            aria-label={`${label}: ${value}`}
            title={label}
            onClick={() => { onCycle(); AudioManager.playUi('ui.confirm'); }}
        >
            {value}
        </button>
    );
}

function Slider({ label, value, onChange, sfx }: { label: string; value: number; onChange: (v: number) => void; sfx?: string }) {
    const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
    const fill = `linear-gradient(to right, var(--ds-accent) ${pct}%, var(--ds-panel-inset) ${pct}%)`;
    return (
        <div className="ds-settings__slider-control">
            <input
                type="range"
                className="ds-range"
                min={0}
                max={100}
                value={pct}
                style={{ background: fill }}
                aria-label={label}
                aria-valuetext={`${pct}%`}
                title={label}
                onChange={(e) => onChange(Number(e.target.value) / 100)}
                onMouseUp={() => { if (sfx) AudioManager.playUi(sfx); }}
            />
            <span className="ds-row__value">{pct}%</span>
        </div>
    );
}

function KeybindingButton({
    definition,
    capturing,
    setCapturing,
}: {
    definition: KeybindingDefinition;
    capturing: KeybindingId | null;
    setCapturing: (id: KeybindingId | null) => void;
}) {
    const isCapturing = capturing === definition.id;
    const label = t(definition.labelKey);
    const value = isCapturing ? t('settings.keyListening') : S.getKeyLabel(S.getKeybinding(definition.id));

    return (
        <div style={styles.keyRow}>
            <span style={styles.keyLabel}>{label}</span>
            <button
                type="button"
                className={`ds-btn${isCapturing ? ' is-active' : ''}`}
                style={styles.keyButton}
                aria-label={`${label}: ${value}`}
                title={label}
                onClick={() => setCapturing(isCapturing ? null : definition.id)}
            >
                {value}
            </button>
        </div>
    );
}

function KeybindingSection({ capturing, setCapturing }: { capturing: KeybindingId | null; setCapturing: (id: KeybindingId | null) => void }) {
    const actionBindings = S.getKeybindingDefinitions('action');
    const worldBindings = S.getKeybindingDefinitions('world');
    const [confirmReset, setConfirmReset] = useState(false);

    return (
        <Section title={t('settings.keybindings')}>
            <div className="ds-section__title" style={{ marginTop: 0 }}>{t('settings.keybindingsAction')}</div>
            <div className="ds-settings__key-grid">
                {actionBindings.map((definition) => (
                    <KeybindingButton key={definition.id} definition={definition} capturing={capturing} setCapturing={setCapturing} />
                ))}
            </div>
            <div className="ds-section__title" style={{ marginTop: 4 }}>{t('settings.keybindingsWorld')}</div>
            <div className="ds-settings__key-grid">
                {worldBindings.map((definition) => (
                    <KeybindingButton key={definition.id} definition={definition} capturing={capturing} setCapturing={setCapturing} />
                ))}
            </div>
            <div style={styles.keyActions}>
                <button
                    type="button"
                    className="ds-btn"
                    onClick={() => setConfirmReset(true)}
                    title={t('settings.keyResetAll')}
                >
                    {t('settings.keyResetAll')}
                </button>
            </div>

            {confirmReset && (
                <ConfirmModal
                    title={t('settings.keyResetConfirm')}
                    confirmLabel={t('settings.keyResetAll')}
                    danger
                    onConfirm={() => { S.resetKeybindings(); setCapturing(null); setConfirmReset(false); AudioManager.playUi('ui.confirm'); }}
                    onCancel={() => setConfirmReset(false)}
                />
            )}
        </Section>
    );
}

export function SettingsPanel() {
    useUiVersion(); // keep control values live
    const store = useStore();
    const dialogRef = useModalDialog<HTMLDivElement>();
    const [capturing, setCapturing] = useState<KeybindingId | null>(null);
    const [tab, setTab] = useState<'general' | 'updates'>('general');
    const [hasNewUpdates, setHasNewUpdates] = useState(() => S.getLastSeenChangelog() !== CURRENT_VERSION);

    const openUpdates = () => {
        setTab('updates');
        setHasNewUpdates(false);
        S.setLastSeenChangelog(CURRENT_VERSION);
        AudioManager.playUi('ui.hover');
    };

    useEffect(() => {
        if (!capturing) return undefined;
        const onKeyDown = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.code === 'Escape') {
                setCapturing(null);
                return;
            }
            if (S.isAllowedKeybindingCode(event.code)) {
                S.setKeybinding(capturing, event.code);
                AudioManager.playUi('ui.confirm');
            } else {
                AudioManager.playUi('ui.error');
            }
            setCapturing(null);
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [capturing]);

    return (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('pause.settings')} tabIndex={-1} className="ds-panel ds-settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">{t('pause.settings')}</span>
                <button type="button" className="ds-close-btn" onClick={() => store.closeSettings()} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
            </div>

            <div className="ds-settings-tabs" role="tablist">
                <button
                    type="button"
                    role="tab"
                    id="settings-tab-general"
                    aria-selected={tab === 'general'}
                    aria-controls="settings-tabpanel"
                    className={`ds-btn${tab === 'general' ? ' is-active' : ''}`}
                    onClick={() => setTab('general')}
                >
                    {t('settings.tab.general')}
                </button>
                <button
                    type="button"
                    role="tab"
                    id="settings-tab-updates"
                    aria-selected={tab === 'updates'}
                    aria-controls="settings-tabpanel"
                    className={`ds-btn${tab === 'updates' ? ' is-active' : ''}`}
                    onClick={openUpdates}
                >
                    {t('settings.tab.updates')}
                    {hasNewUpdates && <span className="ds-tab-badge" aria-label={t('settings.updatesNew')} />}
                </button>
            </div>

            {tab === 'updates' ? (
                <div className="ds-settings" role="tabpanel" id="settings-tabpanel" aria-labelledby="settings-tab-updates" tabIndex={0}><ChangelogPanel /></div>
            ) : (
            <div className="ds-settings" role="tabpanel" id="settings-tabpanel" aria-labelledby="settings-tab-general">
                <Section title={t('settings.sound')}>
                    <Row label={t('settings.muteBGM')}><Toggle label={t('settings.muteBGM')} on={S.getMuteBGM()} onToggle={() => S.setMuteBGM(!S.getMuteBGM())} /></Row>
                    <Row label={t('settings.muteSFX')}><Toggle label={t('settings.muteSFX')} on={S.getMuteSFX()} onToggle={() => S.setMuteSFX(!S.getMuteSFX())} /></Row>
                    <Row className="ds-settings__slider-row" label={t('settings.bgmVolume')}><Slider label={t('settings.bgmVolume')} value={S.getBgmVolume()} onChange={(v) => S.setBgmVolume(v)} /></Row>
                    <Row className="ds-settings__slider-row" label={t('settings.sfxVolume')}><Slider label={t('settings.sfxVolume')} value={S.getSfxVolume()} onChange={(v) => S.setSfxVolume(v)} sfx="ui.confirm" /></Row>
                    <Row className="ds-settings__slider-row" label={t('settings.uiVolume')}><Slider label={t('settings.uiVolume')} value={S.getUiVolume()} onChange={(v) => S.setUiVolume(v)} sfx="ui.hover" /></Row>
                </Section>

                <Section title={t('settings.screen')}>
                    <Row label={t('settings.uiScale')}><Cycle label={t('settings.uiScale')} value={S.getScaleLabel()} onCycle={() => S.cycleUIScale()} /></Row>
                    <Row label={t('settings.fpsLimit')}><Cycle label={t('settings.fpsLimit')} value={S.getFPSLimitLabel()} onCycle={() => S.cycleFPSLimit()} /></Row>
                    <Row label={t('settings.showGridRow')}><Toggle label={t('settings.showGridRow')} on={S.getGrid()} onToggle={() => S.setGrid(!S.getGrid())} /></Row>
                    <Row label={t('settings.showFPSRow')}><Toggle label={t('settings.showFPSRow')} on={S.getFPS()} onToggle={() => S.setFPS(!S.getFPS())} /></Row>
                </Section>

                <Section title={t('settings.accessibility')}>
                    <Row label={t('settings.motionReduce')}><Toggle label={t('settings.motionReduce')} on={S.getMotionReduce()} onToggle={() => S.setMotionReduce(!S.getMotionReduce())} /></Row>
                </Section>

                <Section title={t('settings.languageSection')}>
                    <Row label={t('settings.lang')}><Cycle label={t('settings.lang')} value={t('settings.langValue')} onCycle={() => i18n.toggleLanguage()} /></Row>
                </Section>

                <KeybindingSection capturing={capturing} setCapturing={setCapturing} />
            </div>
            )}

            <div className="ds-settings__footer">
                {t('ui.closeHint')}
            </div>
        </div>
    );
}
