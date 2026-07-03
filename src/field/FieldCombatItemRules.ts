import {
    getEffectiveStatsForCharacter,
    type StatusCarrier,
} from '../combat/StatusEffects';
import {
    getCombatRecovery,
    isCombatRecoveryConsumable,
    type ItemDef,
} from '../data/ItemDB';
import { TOOL_ACTION_GAUGE_COST } from './FieldActionEconomy';

export type CombatItemUseFailureReason = 'notCombatRecovery' | 'noAction' | 'noEffect';

export interface CombatItemApplicationPreview {
    apCost: number;
    effectiveHp: number;
    effectiveMp: number;
    effectiveMaxHp: number;
    effectiveMaxMp: number;
    nextHp: number;
    nextMp: number;
}

export type CombatItemRecoveryPreview =
    | (CombatItemApplicationPreview & { ok: true })
    | (CombatItemApplicationPreview & {
        ok: false;
        reason: Exclude<CombatItemUseFailureReason, 'noAction'>;
    });

export type CombatItemUsePreview =
    | (CombatItemApplicationPreview & { ok: true })
    | (CombatItemApplicationPreview & {
        ok: false;
        reason: CombatItemUseFailureReason;
    });

export function isCombatRecoveryItem(item: ItemDef | null | undefined): item is ItemDef {
    return Boolean(item && isCombatRecoveryConsumable(item));
}

export function previewCombatItemRecovery(
    item: ItemDef | null | undefined,
    carrier: StatusCarrier
): CombatItemRecoveryPreview {
    if (!isCombatRecoveryItem(item)) return noRecoveryChange('notCombatRecovery', carrier);

    const recovery = getCombatRecovery(item);
    const effective = getEffectiveStatsForCharacter(carrier);
    const currentHp = carrier.stats.hp;
    const currentMp = carrier.stats.mp;
    const effectiveHp = Math.max(0, Math.min(recovery.hp, effective.maxHp - currentHp));
    const effectiveMp = Math.max(0, Math.min(recovery.mp, effective.maxMp - currentMp));
    const nextHp = Math.max(0, Math.min(effective.maxHp, currentHp + effectiveHp));
    const nextMp = Math.max(0, Math.min(effective.maxMp, currentMp + effectiveMp));
    const preview: CombatItemApplicationPreview = {
        apCost: TOOL_ACTION_GAUGE_COST,
        effectiveHp,
        effectiveMp,
        effectiveMaxHp: effective.maxHp,
        effectiveMaxMp: effective.maxMp,
        nextHp,
        nextMp,
    };

    if (effectiveHp <= 0 && effectiveMp <= 0) {
        return {
            ...preview,
            ok: false,
            reason: 'noEffect',
        };
    }
    return {
        ...preview,
        ok: true,
    };
}

export function previewCombatItemUse(input: {
    item: ItemDef | null | undefined;
    carrier: StatusCarrier;
    remainingAp: number;
}): CombatItemUsePreview {
    if (!isCombatRecoveryItem(input.item)) return noRecoveryChange('notCombatRecovery', input.carrier);
    if (input.remainingAp < TOOL_ACTION_GAUGE_COST) return noRecoveryChange('noAction', input.carrier);
    return previewCombatItemRecovery(input.item, input.carrier);
}

function noRecoveryChange<TReason extends CombatItemUseFailureReason>(
    reason: TReason,
    carrier: StatusCarrier
): CombatItemApplicationPreview & { ok: false; reason: TReason } {
    const effective = getEffectiveStatsForCharacter(carrier);
    return {
        ok: false,
        reason,
        apCost: TOOL_ACTION_GAUGE_COST,
        effectiveHp: 0,
        effectiveMp: 0,
        effectiveMaxHp: effective.maxHp,
        effectiveMaxMp: effective.maxMp,
        nextHp: Math.max(0, Math.min(effective.maxHp, carrier.stats.hp)),
        nextMp: Math.max(0, Math.min(effective.maxMp, carrier.stats.mp)),
    };
}
