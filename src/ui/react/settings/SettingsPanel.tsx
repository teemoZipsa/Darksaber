/**
 * SettingsPanel — DD-styled DOM replacement for the canvas SettingsUI.
 *
 * Sections: 사운드 / 화면 / 접근성 / 언어. Uses real form controls (toggle switches,
 * native range sliders, cycle buttons) instead of canvas-drawn widgets. All state
 * goes through SettingsManager (persisted); re-renders via useUiVersion so values
 * stay live. Labels are localized via t(); language toggle re-renders live.
 */

import type { CSSProperties, ReactNode } from 'react';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import { i18n, t } from '../../../i18n/LanguageManager';
import { useStore, useUiVersion } from '../UiContext';

const S = SettingsManager;

// Repeated inline styles, hoisted to local constants (CSS file is shared → off-limits).
const styles = {
    sectionBody: { display: 'flex', flexDirection: 'column', gap: 6 } as CSSProperties,
    sliderWrap: { display: 'flex', alignItems: 'center', gap: 8 } as CSSProperties,
    footer: { textAlign: 'center', color: 'var(--ds-text-dim)', fontSize: 12, padding: '8px 0 14px' } as CSSProperties,
};

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div>
            <div className="ds-section__title">{title}</div>
            <div style={styles.sectionBody}>{children}</div>
        </div>
    );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="ds-row">
            <span className="ds-row__label">{label}</span>
            {children}
        </div>
    );
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
    return (
        <div
            className={`ds-toggle${on ? ' is-on' : ''}`}
            role="switch"
            aria-checked={on}
            aria-label={label}
            title={label}
            onClick={() => { onToggle(); AudioManager.playUi('ui.confirm'); }}
        >
            <div className="ds-toggle__knob" />
        </div>
    );
}

function Cycle({ label, value, onCycle }: { label: string; value: string; onCycle: () => void }) {
    return (
        <button
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
        <div style={styles.sliderWrap}>
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

export function SettingsPanel() {
    useUiVersion(); // keep control values live
    const store = useStore();
    const panelStyle = { width: 440, '--ds-scale': S.getUIScale() } as CSSProperties;

    return (
        <div className="ds-panel" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">{t('pause.settings')}</span>
                <button className="ds-close-btn" onClick={() => store.closeSettings()} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
            </div>

            <div className="ds-settings">
                <Section title={t('settings.sound')}>
                    <Row label={t('settings.muteBGM')}><Toggle label={t('settings.muteBGM')} on={S.getMuteBGM()} onToggle={() => S.setMuteBGM(!S.getMuteBGM())} /></Row>
                    <Row label={t('settings.muteSFX')}><Toggle label={t('settings.muteSFX')} on={S.getMuteSFX()} onToggle={() => S.setMuteSFX(!S.getMuteSFX())} /></Row>
                    <Row label={t('settings.bgmVolume')}><Slider label={t('settings.bgmVolume')} value={S.getBgmVolume()} onChange={(v) => S.setBgmVolume(v)} /></Row>
                    <Row label={t('settings.sfxVolume')}><Slider label={t('settings.sfxVolume')} value={S.getSfxVolume()} onChange={(v) => S.setSfxVolume(v)} sfx="ui.confirm" /></Row>
                    <Row label={t('settings.uiVolume')}><Slider label={t('settings.uiVolume')} value={S.getUiVolume()} onChange={(v) => S.setUiVolume(v)} sfx="ui.hover" /></Row>
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
                    <Row label={t('settings.lang')}><Cycle label={t('settings.lang')} value={i18n.lang === 'ko' ? '한국어' : 'English'} onCycle={() => i18n.toggleLanguage()} /></Row>
                </Section>
            </div>

            <div style={styles.footer}>
                {t('ui.closeHint')}
            </div>
        </div>
    );
}
