/**
 * SettingsPanel — DD-styled DOM replacement for the canvas SettingsUI.
 *
 * Sections: 사운드 / 화면 / 접근성 / 언어. Uses real form controls (toggle switches,
 * native range sliders, cycle buttons) instead of canvas-drawn widgets. All state
 * goes through SettingsManager (persisted); re-renders via useUiVersion so values
 * stay live. Labels mirror the previous canvas UI (Korean).
 */

import type { CSSProperties, ReactNode } from 'react';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import { i18n } from '../../../i18n/LanguageManager';
import { useStore, useUiVersion } from '../UiContext';

const S = SettingsManager;

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div>
            <div className="ds-section__title">{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
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

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    return (
        <div
            className={`ds-toggle${on ? ' is-on' : ''}`}
            role="switch"
            aria-checked={on}
            onClick={() => { onToggle(); AudioManager.playUi('ui.confirm'); }}
        >
            <div className="ds-toggle__knob" />
        </div>
    );
}

function Cycle({ value, onCycle }: { value: string; onCycle: () => void }) {
    return (
        <button className="ds-btn" onClick={() => { onCycle(); AudioManager.playUi('ui.confirm'); }}>
            {value}
        </button>
    );
}

function Slider({ value, onChange, sfx }: { value: number; onChange: (v: number) => void; sfx?: string }) {
    const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
    const fill = `linear-gradient(to right, var(--ds-accent) ${pct}%, var(--ds-panel-inset) ${pct}%)`;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
                type="range"
                className="ds-range"
                min={0}
                max={100}
                value={pct}
                style={{ background: fill }}
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
                <span className="ds-panel__title">설정</span>
                <button className="ds-close-btn" onClick={() => store.closeSettings()} aria-label="Close">✕</button>
            </div>

            <div className="ds-settings">
                <Section title="사운드">
                    <Row label="BGM 음소거"><Toggle on={S.getMuteBGM()} onToggle={() => S.setMuteBGM(!S.getMuteBGM())} /></Row>
                    <Row label="SFX 음소거"><Toggle on={S.getMuteSFX()} onToggle={() => S.setMuteSFX(!S.getMuteSFX())} /></Row>
                    <Row label="BGM 볼륨"><Slider value={S.getBgmVolume()} onChange={(v) => S.setBgmVolume(v)} /></Row>
                    <Row label="SFX 볼륨"><Slider value={S.getSfxVolume()} onChange={(v) => S.setSfxVolume(v)} sfx="ui.confirm" /></Row>
                    <Row label="UI 볼륨"><Slider value={S.getUiVolume()} onChange={(v) => S.setUiVolume(v)} sfx="ui.hover" /></Row>
                </Section>

                <Section title="화면">
                    <Row label="UI 크기"><Cycle value={S.getScaleLabel()} onCycle={() => S.cycleUIScale()} /></Row>
                    <Row label="FPS 제한"><Cycle value={S.getFPSLimitLabel()} onCycle={() => S.cycleFPSLimit()} /></Row>
                    <Row label="격자 표시"><Toggle on={S.getGrid()} onToggle={() => S.setGrid(!S.getGrid())} /></Row>
                    <Row label="FPS 표시"><Toggle on={S.getFPS()} onToggle={() => S.setFPS(!S.getFPS())} /></Row>
                </Section>

                <Section title="접근성">
                    <Row label="모션 감소"><Toggle on={S.getMotionReduce()} onToggle={() => S.setMotionReduce(!S.getMotionReduce())} /></Row>
                </Section>

                <Section title="언어 / Language">
                    <Row label="언어"><Cycle value={i18n.lang === 'ko' ? '한국어' : 'English'} onCycle={() => i18n.toggleLanguage()} /></Row>
                </Section>
            </div>

            <div style={{ textAlign: 'center', color: 'var(--ds-text-dim)', fontSize: 12, padding: '8px 0 14px' }}>
                ESC 또는 ✕ 로 닫기
            </div>
        </div>
    );
}
