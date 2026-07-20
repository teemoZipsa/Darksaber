/**
 * MagicLoadoutPanel — DOM overlay (K key) for managing a character's equipped
 * magic (8 slots) and gold-based skill upgrades.
 *
 * Flow: pick a slot, then pick a learned skill to equip into it (an already
 * equipped skill swaps slots). Selecting a learned skill shows its detail and an
 * upgrade button. Slot order here is the in-combat radial menu order.
 */

import { useState, type CSSProperties } from 'react';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import { formatSkillDescription, formatSkillName } from '../../../i18n/DisplayNames';
import { t, formatT } from '../../../i18n/LanguageManager';
import { getSkill, type Skill } from '../../../data/SkillDB';
import {
    getUpgradeCost,
    MAGIC_LOADOUT_SIZE,
    MAX_UPGRADE_LEVEL,
} from '../../../magic/MagicLoadout';
import { useStore, useUiVersion } from '../UiContext';
import { PartyTabs } from '../character/PartyTabs';
import { useModalDialog } from '../useModalDialog';
import { ConfirmModal } from '../ConfirmModal';

function skillTags(skill: Skill): string {
    return `${formatT('magic.tierShort', { tier: skill.tier })} · ${t(`magic.type.${skill.type}`)} · ${t(`magic.element.${skill.element}`)}`;
}

export function MagicLoadoutPanel() {
    useUiVersion();
    const store = useStore();
    const dialogRef = useModalDialog<HTMLDivElement>();

    const char = store.getActiveCharacter();
    const party = store.getActiveParty();
    const activeIndex = store.getActiveIndex();
    const gold = store.getGold();
    const uiScale = SettingsManager.getUIScale();

    const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
    const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [pendingUpgrade, setPendingUpgrade] = useState(false);

    const panelStyle = { width: 'min(640px, calc(100vw - 18px))', '--ds-scale': uiScale } as CSSProperties;

    const showToast = (msg: string) => {
        setToast(msg);
        window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 1800);
    };

    if (!char) {
        return (
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('magic.loadout.title')} tabIndex={-1} className="ds-panel" style={panelStyle} onClick={(e) => e.stopPropagation()}>
                <div className="ds-panel__header">
                    <span className="ds-panel__title">{t('magic.loadout.title')}</span>
                    <button type="button" className="ds-close-btn" onClick={() => store.closeMagicLoadout()} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
                </div>
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ds-text-muted)' }}>
                    {t('magic.loadout.none')}
                </div>
            </div>
        );
    }

    const loadout = store.getMagicLoadout(char);
    const learned = store.getLearnedMagicSkills(char);
    const equippedSet = new Set(loadout);
    const detail = selectedSkillId ? getSkill(selectedSkillId) : undefined;

    const onPickSkill = (skillId: string) => {
        setSelectedSkillId(skillId);
        if (selectedSlot !== null) {
            const result = store.equipMagic(selectedSlot, skillId);
            if (!result.ok && result.reasonKey === 'raid.editingLocked') {
                showToast(t('raid.editingLocked'));
            }
        }
    };

    const onUpgrade = (skillId: string) => {
        const result = store.upgradeMagic(skillId);
        AudioManager.playUi(result.ok ? 'ui.confirm' : 'ui.cancel');
        if (!result.ok && result.reasonKey) showToast(t(result.reasonKey));
    };

    const detailLevel = detail ? store.getSkillUpgradeLevel(char, detail.id) : 1;
    const detailNextCost = detail && detailLevel < MAX_UPGRADE_LEVEL ? getUpgradeCost(detail, detailLevel + 1) : 0;

    return (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('magic.loadout.title')} tabIndex={-1} className="ds-panel" style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">{t('magic.loadout.title')}</span>
                <span style={{ marginLeft: 'auto', marginRight: 12, color: 'var(--ds-accent)' }}>{gold} G</span>
                <button type="button" className="ds-close-btn" onClick={() => store.closeMagicLoadout()} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
            </div>

            <PartyTabs party={party} activeIndex={activeIndex} />

            <div className="ds-magic-loadout__body" style={{ display: 'flex', gap: 16, padding: '0 16px 16px' }}>
                {/* Left: 8 equip slots */}
                <div className="ds-magic-loadout__slots" style={{ width: 280 }}>
                    <div style={{ color: 'var(--ds-text-muted)', marginBottom: 8, fontSize: 13 }}>
                        {t('magic.loadout.slots')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                        {Array.from({ length: MAGIC_LOADOUT_SIZE }).map((_, i) => {
                            const skillId = loadout[i];
                            const skill = skillId ? getSkill(skillId) : undefined;
                            const isSelected = selectedSlot === i;
                            const level = skill ? store.getSkillUpgradeLevel(char, skill.id) : 1;
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    className="ds-btn"
                                    aria-selected={isSelected}
                                    data-magic-slot={i}
                                    data-magic-slot-skill={skillId ?? ''}
                                    disabled={!skill && i >= loadout.length}
                                    onClick={() => { setSelectedSlot(i); if (skill) setSelectedSkillId(skill.id); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        justifyContent: 'flex-start', height: 40, textAlign: 'left',
                                        outline: isSelected ? '2px solid var(--ds-accent)' : undefined,
                                    }}
                                >
                                    <span style={{ width: 16, color: 'var(--ds-text-muted)', fontSize: 11 }}>{i + 1}</span>
                                    {skill ? (
                                        <>
                                            <span style={{ fontSize: 18 }}>{skill.icon}</span>
                                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {formatSkillName(skill)}
                                            </span>
                                            {level > 1 && <span style={{ color: 'var(--ds-accent)', fontSize: 11 }}>+{level - 1}</span>}
                                        </>
                                    ) : (
                                        <span style={{ color: 'var(--ds-text-muted)', fontStyle: 'italic' }}>
                                            {t('magic.loadout.empty')}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <div style={{ color: 'var(--ds-text-muted)', marginTop: 10, fontSize: 12 }}>
                        {selectedSlot === null ? t('magic.loadout.pickSlot') : t('magic.loadout.pickSkill')}
                    </div>
                </div>

                {/* Right: learned skills + detail/upgrade */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>{t('magic.loadout.learned')}</div>
                    <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {learned.length === 0 && (
                            <div style={{ color: 'var(--ds-text-muted)' }}>{t('magic.loadout.none')}</div>
                        )}
                        {learned.map((skill) => {
                            const level = store.getSkillUpgradeLevel(char, skill.id);
                            const isEquipped = equippedSet.has(skill.id);
                            const isSel = selectedSkillId === skill.id;
                            return (
                                <button
                                    key={skill.id}
                                    type="button"
                                    className="ds-btn"
                                    aria-selected={isSel}
                                    data-magic-skill={skill.id}
                                    onClick={() => onPickSkill(skill.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                                        justifyContent: 'flex-start',
                                        outline: isSel ? '2px solid var(--ds-accent)' : undefined,
                                    }}
                                >
                                    <span style={{ fontSize: 16 }}>{skill.icon}</span>
                                    <span style={{ flex: 1 }}>{formatSkillName(skill)}</span>
                                    {level > 1 && <span style={{ color: 'var(--ds-accent)', fontSize: 11 }}>+{level - 1}</span>}
                                    {isEquipped && <span style={{ color: 'var(--ds-text-muted)', fontSize: 11 }}>{t('magic.loadout.equipped')}</span>}
                                </button>
                            );
                        })}
                    </div>

                    {detail && (
                        <div style={{
                            background: 'var(--ds-panel-inset)', border: '1px solid var(--ds-border-shadow)',
                            borderRadius: 'var(--ds-radius-sm)', padding: 12,
                        }} data-magic-detail={detail.id}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 20 }}>{detail.icon}</span>
                                <strong>{formatSkillName(detail)}</strong>
                                <span style={{ marginLeft: 'auto', color: 'var(--ds-accent)' }}>
                                    {formatT('magic.level', { lv: detailLevel })}
                                </span>
                            </div>
                            <div style={{ color: 'var(--ds-text-muted)', fontSize: 12, margin: '6px 0' }}>
                                {skillTags(detail)} · {t('magic.mp')} {detail.mpCost}
                            </div>
                            <div style={{ fontSize: 12, marginBottom: 10 }}>{formatSkillDescription(detail)}</div>
                            <button
                                type="button"
                                className="ds-btn"
                                disabled={detailLevel >= MAX_UPGRADE_LEVEL}
                                onClick={() => setPendingUpgrade(true)}
                            >
                                {detailLevel >= MAX_UPGRADE_LEVEL
                                    ? t('magic.upgrade.max')
                                    : `${t('magic.upgrade.button')} · ${formatT('magic.upgrade.cost', { cost: detailNextCost })}`}
                            </button>
                        </div>
                    )}

                    <div role="status" aria-live="polite" style={{ color: 'var(--ds-danger)', fontSize: 12, minHeight: 16 }}>{toast}</div>
                </div>
            </div>

            {pendingUpgrade && detail && detailLevel < MAX_UPGRADE_LEVEL && (
                <ConfirmModal
                    title={t('magic.upgrade.confirm')}
                    confirmLabel={t('magic.upgrade.button')}
                    onConfirm={() => { setPendingUpgrade(false); onUpgrade(detail.id); }}
                    onCancel={() => setPendingUpgrade(false)}
                >
                    <div className="ds-modal__line">{formatSkillName(detail)}</div>
                    <div className="ds-modal__line ds-modal__line--sub">{formatT('magic.upgrade.confirmCost', { cost: detailNextCost })}</div>
                </ConfirmModal>
            )}
        </div>
    );
}
