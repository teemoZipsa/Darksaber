import { formatT } from '../i18n/LanguageManager';
import { formatTownName } from '../i18n/TownMessages';
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

export function formatRaidBannerSubtitle(
    departureTownId: string,
    modifier?: RaidModifier | null,
): string {
    const route = formatT('raid.banner.extractOtherTown', {
        town: formatTownName(departureTownId),
    });
    return modifier ? `${formatRaidModifierName(modifier)}  |  ${route}` : route;
}
