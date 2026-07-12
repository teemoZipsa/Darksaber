import { formatT, t } from '../i18n/LanguageManager';
import type { WorldLootContainerType } from './WorldLootTypes';

export interface LootSourceDisplayInput {
    sourceLabel?: string;
    containerType?: WorldLootContainerType;
}

export function getDefaultLootSourceLabel(): string {
    return t('worldLoot.source.default');
}

export function getWorldLootSourceLabel(containerType: WorldLootContainerType): string {
    return t(`worldLoot.source.${containerType}`);
}

export function getEnemyLootSourceLabel(source: string): string {
    return formatT('field.log.lootSource', { source });
}

export function getLootSourceLabelForDisplay(loot?: LootSourceDisplayInput | null): string {
    if (loot?.containerType) return getWorldLootSourceLabel(loot.containerType);
    const sourceLabel = loot?.sourceLabel?.trim();
    return sourceLabel || getDefaultLootSourceLabel();
}
