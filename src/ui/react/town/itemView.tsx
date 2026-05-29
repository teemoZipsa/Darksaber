/** Shared item helpers for the DOM town shop/inventory panels. */

import type { CSSProperties } from 'react';
import type { ItemDef } from '../../../data/ItemDB';
import { i18n } from '../../../i18n/LanguageManager';

export function itemName(item: ItemDef): string {
    return i18n.lang === 'ko' ? item.nameKr : item.name;
}

export function statSummary(item: ItemDef): string {
    const stats: string[] = [];
    if (item.stats?.atk) stats.push(`ATK+${item.stats.atk}`);
    if (item.stats?.def) stats.push(`DEF+${item.stats.def}`);
    if (item.stats?.magAtk) stats.push(`MAG+${item.stats.magAtk}`);
    if (item.stats?.hp) stats.push(`HP+${item.stats.hp}`);
    if (stats.length > 0) return stats.join(' · ');
    return i18n.lang === 'ko' ? (item.descriptionKr ?? item.description) : item.description;
}

export function ItemSwatch({ item, dim }: { item: ItemDef; dim?: boolean }) {
    const style: CSSProperties = {
        background: `${item.color}33`,
        borderColor: item.color,
        opacity: dim ? 0.4 : 1,
    };
    return <div className="ds-item-swatch" style={style} aria-hidden>{item.icon}</div>;
}
