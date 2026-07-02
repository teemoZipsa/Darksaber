import type { EquipmentLoss, RaidLossPlan } from './RaidOutcome';

export const RAID_INSURANCE_PRICE = 120;

export interface RaidInsuranceResult {
    loss: RaidLossPlan;
    protectedEquipment: EquipmentLoss | null;
}

export function applyRaidInsurance(loss: RaidLossPlan, active: boolean): RaidInsuranceResult {
    if (!active || loss.equipmentLost.length === 0) {
        return { loss, protectedEquipment: null };
    }

    const protectedEquipment = [...loss.equipmentLost]
        .sort((a, b) => equipmentLossValue(b) - equipmentLossValue(a))[0] ?? null;
    if (!protectedEquipment) return { loss, protectedEquipment: null };

    return {
        loss: {
            backpackLost: loss.backpackLost,
            equipmentLost: loss.equipmentLost.filter((entry) => entry !== protectedEquipment),
        },
        protectedEquipment,
    };
}

function equipmentLossValue(loss: EquipmentLoss): number {
    return loss.item.baseValue * Math.max(1, Math.floor(loss.item.quantity));
}
