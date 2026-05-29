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
    const stats = formatStats(item.stats);
    if (stats) return stats;
    const socketStats = socketSummary(item);
    if (socketStats) return socketStats;
    return i18n.lang === 'ko' ? (item.descriptionKr ?? item.description) : item.description;
}

function formatStats(stats: ItemDef['stats'] | undefined): string {
    if (!stats) return '';
    const parts: string[] = [];
    if (stats.atk) parts.push(`ATK+${stats.atk}`);
    if (stats.def) parts.push(`DEF+${stats.def}`);
    if (stats.magAtk) parts.push(`MAG+${stats.magAtk}`);
    if (stats.magDef) parts.push(`MDEF+${stats.magDef}`);
    if (stats.hp || stats.maxHp) parts.push(`HP+${stats.maxHp ?? stats.hp}`);
    if (stats.mp || stats.maxMp) parts.push(`MP+${stats.maxMp ?? stats.mp}`);
    if (stats.hitRate) parts.push(`HIT+${stats.hitRate}`);
    if (stats.critRate) parts.push(`CRIT+${stats.critRate}`);
    if (stats.evasion) parts.push(`EVA+${stats.evasion}`);
    if (stats.spd) parts.push(`SPD+${stats.spd}`);
    return parts.join(' · ');
}

function socketSummary(item: ItemDef): string {
    if (!item.socketEffects) return '';
    const labels: Array<[keyof NonNullable<ItemDef['socketEffects']>, string]> = [
        ['weapon', 'W'],
        ['armor', 'A'],
        ['shield', 'S'],
    ];
    return labels
        .map(([kind, label]) => {
            const stats = formatStats(item.socketEffects?.[kind]);
            return stats ? `${label}: ${stats}` : '';
        })
        .filter(Boolean)
        .join(' · ');
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
