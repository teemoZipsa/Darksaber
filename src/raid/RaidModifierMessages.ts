import { formatT } from '../i18n/LanguageManager';
import type { RaidModifier } from './RaidModifiers';

export function formatRaidModifierName(modifier: RaidModifier): string {
    return formatT(`raid.modifier.${modifier.id}.name`, {});
}

export function formatRaidModifierLog(modifier: RaidModifier): string {
    return formatT('raid.modifier.log', {
        name: formatRaidModifierName(modifier),
        desc: formatT(`raid.modifier.${modifier.id}.desc`, {}),
    });
}
