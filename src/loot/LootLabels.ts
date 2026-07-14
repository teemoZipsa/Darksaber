import { formatT, i18n, t } from '../i18n/LanguageManager';
import { formatStoredEnemyName } from '../i18n/DisplayNames';
import { WORLD_LOOT_CONTAINER_TYPES, type WorldLootContainerType } from './WorldLootTypes';

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
    if (!sourceLabel) return getDefaultLootSourceLabel();

    const defaultLabels = [
        i18n.strings.ko['worldLoot.source.default'],
        i18n.strings.en['worldLoot.source.default'],
    ];
    if (defaultLabels.includes(sourceLabel)) return getDefaultLootSourceLabel();
    const recoveredContainerType = WORLD_LOOT_CONTAINER_TYPES.find((containerType) => {
        const key = `worldLoot.source.${containerType}` as const;
        return i18n.strings.ko[key] === sourceLabel || i18n.strings.en[key] === sourceLabel;
    });
    if (recoveredContainerType) return getWorldLootSourceLabel(recoveredContainerType);

    const enemyName = sourceLabel.endsWith(' 전리품')
        ? sourceLabel.slice(0, -' 전리품'.length)
        : sourceLabel.endsWith(' loot')
            ? sourceLabel.slice(0, -' loot'.length)
            : null;
    return enemyName === null
        ? sourceLabel
        : getEnemyLootSourceLabel(formatStoredEnemyName(enemyName));
}
