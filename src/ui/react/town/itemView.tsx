/** Shared item helpers for the DOM town shop/inventory panels. */

import type { CSSProperties } from 'react';
import type { ItemDef } from '../../../data/ItemDB';
import { i18n } from '../../../i18n/LanguageManager';

const ITEM_SPRITE_SHEET = '/assets/images/items/darksaber_items.png';
const ITEM_CELL_SIZE = 32;

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

export function ItemGlyph({ item, className = '' }: { item: ItemDef; className?: string }) {
    if (item.iconSprite) {
        const style: CSSProperties = {
            backgroundImage: `url(${ITEM_SPRITE_SHEET})`,
            backgroundPosition: `-${item.iconSprite.col * ITEM_CELL_SIZE}px -${item.iconSprite.row * ITEM_CELL_SIZE}px`,
        };
        return <span className={`ds-item-glyph is-sprite ${className}`.trim()} style={style} aria-hidden />;
    }
    return <span className={`ds-item-glyph is-emoji ${className}`.trim()} aria-hidden>{item.icon}</span>;
}

export function ItemSwatch({ item, dim }: { item: ItemDef; dim?: boolean }) {
    const style: CSSProperties = {
        background: `${item.color}33`,
        borderColor: item.color,
        opacity: dim ? 0.4 : 1,
    };
    return <div className="ds-item-swatch" style={style} aria-hidden><ItemGlyph item={item} /></div>;
}
