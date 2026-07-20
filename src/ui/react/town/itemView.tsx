/** Shared item helpers for the DOM town shop/inventory panels. */

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, FocusEvent, MouseEvent, PointerEvent, ReactNode } from 'react';
import type { ItemDef, ItemRarity, ItemSlot } from '../../../data/ItemDB';
import type { PlacedItem } from '../../../inventory/GridInventory';
import { i18n, t } from '../../../i18n/LanguageManager';

const ITEM_SPRITE_SHEET = '/assets/images/items/darksaber_items.png';
const ITEM_CELL_SIZE = 32;

export function itemName(item: ItemDef): string {
    return i18n.lang === 'ko' ? item.nameKr : item.name;
}

function itemDescription(item: ItemDef): string {
    return i18n.lang === 'ko' ? (item.descriptionKr ?? item.description) : item.description;
}

export function statSummary(item: ItemDef): string {
    const stats = formatStats(item.stats);
    if (stats) return stats;
    const socketStats = socketSummary(item);
    if (socketStats) return socketStats;
    return itemDescription(item);
}

function formatStats(stats: ItemDef['stats'] | undefined): string {
    return statRows(stats).map((r) => `${r.label}+${r.value}`).join(' · ');
}

type StatRow = { key: string; label: string; value: number };

/** Structured per-stat rows (used by tooltips/compare). Labels mirror formatStats. */
export function statRows(stats: ItemDef['stats'] | undefined): StatRow[] {
    if (!stats) return [];
    const rows: StatRow[] = [];
    const add = (key: string, label: string, v?: number) => { if (v) rows.push({ key, label, value: v }); };
    add('atk', 'ATK', stats.atk);
    add('def', 'DEF', stats.def);
    add('magAtk', 'MAG', stats.magAtk);
    add('magDef', 'MDEF', stats.magDef);
    add('hp', 'HP', stats.maxHp ?? stats.hp);
    add('mp', 'MP', stats.maxMp ?? stats.mp);
    add('hitRate', 'HIT', stats.hitRate);
    add('critRate', 'CRIT', stats.critRate);
    add('evasion', 'EVA', stats.evasion);
    add('spd', 'SPD', stats.spd);
    return rows;
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

/* ─── Rarity & type ─────────────────────────────────────────── */

const RARITY_CLASS: Record<ItemRarity, string> = {
    common: 'is-rarity-common',
    uncommon: 'is-rarity-uncommon',
    rare: 'is-rarity-rare',
    epic: 'is-rarity-epic',
    legend: 'is-rarity-legend',
    unique: 'is-rarity-unique',
};

const SLOT_LABEL_KEY: Record<ItemSlot, string> = {
    weapon: 'inv.weapon',
    shield: 'inv.shield',
    head: 'inv.head',
    body: 'inv.body',
    boots: 'inv.boots',
    accessory: 'inv.accessory',
    accessory2: 'inv.accessory2',
    consumable: 'item.consumable',
    material: 'item.material',
    rune: 'item.rune',
    gem: 'item.gem',
};

/** Whether an item occupies an equipment slot (so a compare tooltip makes sense). */
export function isEquippable(item: ItemDef): boolean {
    return item.slot !== 'consumable' && item.slot !== 'material' && item.slot !== 'rune' && item.slot !== 'gem';
}

function itemTypeLabel(item: ItemDef): string {
    return t(SLOT_LABEL_KEY[item.slot] ?? '');
}

/* ─── Glyph / swatch ────────────────────────────────────────── */

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

/* ─── Tooltips ──────────────────────────────────────────────── */

function DurabilityMeta({ placed, item }: { placed?: PlacedItem; item: ItemDef }) {
    if (!placed || item.maxDurability <= 0 || placed.durability >= item.maxDurability) return null;
    return (
        <span className="ds-tooltip__metaitem">
            {t('tooltip.durability')} {Math.round(placed.durability)}/{item.maxDurability}
        </span>
    );
}

function SocketMeta({ placed, item }: { placed?: PlacedItem; item: ItemDef }) {
    if (!item.maxSockets) return null;
    const filled = placed?.sockets?.length ?? 0;
    return (
        <span className="ds-tooltip__metaitem">
            {t('tooltip.sockets')} {filled}/{item.maxSockets} {'◆'.repeat(filled)}{'◇'.repeat(Math.max(0, item.maxSockets - filled))}
        </span>
    );
}

function ItemHeader({ item }: { item: ItemDef }) {
    return (
        <div className="ds-tooltip__head">
            <span className={`ds-tooltip__glyph ${RARITY_CLASS[item.rarity]}`} aria-hidden>
                <ItemGlyph item={item} />
            </span>
            <span className="ds-tooltip__identity">
                <span className={`ds-tooltip__name ${RARITY_CLASS[item.rarity]}`}>{itemName(item)}</span>
                <span className="ds-tooltip__type">{itemTypeLabel(item)}</span>
            </span>
            <span className={`ds-tooltip__rarity ${RARITY_CLASS[item.rarity]}`}>{t(`rarity.${item.rarity}`)}</span>
        </div>
    );
}

function ItemMeta({ item, placed }: { item: ItemDef; placed?: PlacedItem }) {
    return (
        <div className="ds-tooltip__meta">
            <span className="ds-tooltip__metaitem">{t('tooltip.size')} {item.gridW}x{item.gridH}</span>
            <DurabilityMeta placed={placed} item={item} />
            <SocketMeta placed={placed} item={item} />
            {item.weight > 0 && <span className="ds-tooltip__metaitem">{t('tooltip.weight')} {item.weight}</span>}
            {item.baseValue > 0 && <span className="ds-tooltip__metaitem">{t('tooltip.value')} {item.baseValue} G</span>}
        </div>
    );
}

/** Body of a single item card (header + stats + meta + flavor). */
function ItemCard({ item, placed }: { item: ItemDef; placed?: PlacedItem }) {
    const rows = statRows(item.stats);
    const flavor = itemDescription(item);
    return (
        <>
            <ItemHeader item={item} />
            {rows.length > 0 && (
                <div className="ds-tooltip__stats">
                    {rows.map((r) => (
                        <div key={r.key} className="ds-tooltip__stat"><span>{r.label}</span><span>+{r.value}</span></div>
                    ))}
                </div>
            )}
            <ItemMeta item={item} placed={placed} />
            {flavor && <div className="ds-tooltip__flavor">{flavor}</div>}
        </>
    );
}

export function ItemTooltip({ item, placed }: { item: ItemDef; placed?: PlacedItem }) {
    return (
        <div className="ds-tooltip">
            <ItemCard item={item} placed={placed} />
        </div>
    );
}

type CompareRow = { key: string; label: string; cand: number; equip: number; delta: number };

function compareRows(candidate: ItemDef, equipped: ItemDef): CompareRow[] {
    const candMap = new Map(statRows(candidate.stats).map((r) => [r.key, r]));
    const equipMap = new Map(statRows(equipped.stats).map((r) => [r.key, r]));
    const order = ['atk', 'def', 'magAtk', 'magDef', 'hp', 'mp', 'hitRate', 'critRate', 'evasion', 'spd'];
    const rows: CompareRow[] = [];
    for (const key of order) {
        const c = candMap.get(key);
        const e = equipMap.get(key);
        if (!c && !e) continue;
        const label = c?.label ?? e!.label;
        const cand = c?.value ?? 0;
        const equip = e?.value ?? 0;
        rows.push({ key, label, cand, equip, delta: cand - equip });
    }
    return rows;
}

/** Candidate item shown next to the currently-equipped item, with stat deltas. */
export function ItemCompareTooltip({
    candidate,
    equipped,
    candidatePlaced,
    equippedPlaced,
}: {
    candidate: ItemDef;
    equipped?: PlacedItem;
    candidatePlaced?: PlacedItem;
    equippedPlaced?: PlacedItem;
}) {
    if (!equipped) return <ItemTooltip item={candidate} placed={candidatePlaced} />;
    const rows = compareRows(candidate, equipped.item);
    return (
        <div className="ds-tooltip ds-tooltip--compare">
            <div className="ds-tooltip__col is-equipped">
                <div className="ds-tooltip__collabel">{t('tooltip.equipped')}</div>
                <ItemCard item={equipped.item} placed={equippedPlaced ?? equipped} />
            </div>
            <div className="ds-tooltip__col">
                <div className="ds-tooltip__collabel">{t('tooltip.candidate')}</div>
                <ItemHeader item={candidate} />
                {rows.length > 0 && (
                    <div className="ds-tooltip__stats">
                        {rows.map((r) => (
                            <div key={r.key} className="ds-tooltip__stat">
                                <span>{r.label}</span>
                                <span className="ds-tooltip__statvals">
                                    +{r.cand}
                                    {r.delta !== 0 && (
                                        <span className={`ds-tooltip__delta ${r.delta > 0 ? 'is-up' : 'is-down'}`}>
                                            {r.delta > 0 ? `▲${r.delta}` : `▼${Math.abs(r.delta)}`}
                                        </span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                <ItemMeta item={candidate} placed={candidatePlaced} />
            </div>
        </div>
    );
}

/* ─── Hover tooltip layer ───────────────────────────────────── */

type TipState = { content: ReactNode; x: number; y: number } | null;

function TooltipHost({ x, y, children }: { x: number; y: number; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number }>({ left: x + 18, top: y + 18 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const margin = 10;
        let left = x + 18;
        let top = y + 18;
        if (left + r.width > window.innerWidth - margin) left = x - r.width - 18;
        if (left < margin) left = margin;
        if (top + r.height > window.innerHeight - margin) top = window.innerHeight - r.height - margin;
        if (top < margin) top = margin;
        setPos({ left, top });
    }, [x, y, children]);
    // Portal into the overlay root: .ds-panel ancestors are `transform: scale`d,
    // which would otherwise make position:fixed relative to the panel, not the viewport.
    const host = (
        <div ref={ref} className="ds-tooltip-host" style={{ left: pos.left, top: pos.top }}>
            {children}
        </div>
    );
    const root = typeof document !== 'undefined' ? document.getElementById('ui-overlay') : null;
    return root ? createPortal(host, root) : host;
}

/**
 * Cursor-following item tooltip state. Usage:
 *   const tip = useItemTooltip();
 *   <div onPointerEnter={tip.show(<ItemTooltip ... />)} onPointerMove={tip.move} onPointerLeave={tip.hide} />
 *   ... {tip.node}
 */
export function useItemTooltip() {
    const [state, setState] = useState<TipState>(null);
    const show = (content: ReactNode) => (e: PointerEvent | MouseEvent) =>
        setState({ content, x: e.clientX, y: e.clientY });
    const move = (e: PointerEvent | MouseEvent) =>
        setState((s) => (s ? { ...s, x: e.clientX, y: e.clientY } : s));
    const hide = () => setState(null);
    // Keyboard-focus variant: anchor the tooltip to the focused element's box so
    // it is reachable without a pointer.
    const showFor = (content: ReactNode) => (e: FocusEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        setState({ content, x: r.right, y: r.top });
    };
    const node = state ? <TooltipHost x={state.x} y={state.y}>{state.content}</TooltipHost> : null;
    return { show, move, hide, showFor, node };
}
