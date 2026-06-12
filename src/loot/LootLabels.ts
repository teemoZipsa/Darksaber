import { formatT, t } from '../i18n/LanguageManager';
import type { WorldLootContainerType } from './WorldLootTypes';

export function getDefaultLootSourceLabel(): string {
    return t('worldLoot.source.default');
}

export function getWorldLootSourceLabel(containerType: WorldLootContainerType): string {
    return t(`worldLoot.source.${containerType}`);
}

export function getEnemyLootSourceLabel(source: string): string {
    return formatT('field.log.lootSource', { source });
}
