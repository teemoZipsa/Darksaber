/**
 * InventoryPanel — DD-styled DOM replacement for the canvas InventoryUI.
 *
 * LEFT: external grid (Stash in town / Loot in raid) · CENTER: equipment slots
 * around the character · RIGHT: Tarkov-style backpack grid.
 *
 * Interaction:
 *  - Pointer drag moves an item precisely (grid↔grid, grid↔equip, socketing).
 *    Drop cell = the grid cell under the dragged item's visible top-left.
 *  - A plain click quick-transfers (bag→ext, ext→bag, equip→bag), mirroring the
 *    canvas "click without dragging" shortcut.
 * All placement rules live in InventoryUI (moveToCell / moveToEquip / quickMove);
 * this component only reads the model (live via useUiVersion) and calls those.
 *
 * Rendered two ways: as a world overlay (with close button) and embedded in the
 * town storage tab (no close button — the town chrome owns closing).
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { formatT, t } from '../../../i18n/LanguageManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import { getCarryAtbPercent, getPartyCarriedWeight } from '../../../inventory/CarryWeight';
import type { PlacedItem } from '../../../inventory/GridInventory';
import type { GridInventory } from '../../../inventory/GridInventory';
import {
    EQUIP_SLOT_LIST,
    slotAcceptsItem,
    type InventoryUI,
    type InvDragSource,
    type InvGridKind,
} from '../../../inventory/InventoryUI';
import type { ItemRarity, ItemSlot } from '../../../data/ItemDB';
import { useStore, useUiVersion } from '../UiContext';
import { useModalDialog } from '../useModalDialog';
import {
    ItemCompareTooltip,
    ItemGlyph,
    ItemTooltip,
    isEquippable,
    itemName,
    useItemTooltip,
} from '../town/itemView';

const CELL = 40;
const DRAG_THRESHOLD = 5;
const placedItemKeys = new WeakMap<PlacedItem, number>();
let nextPlacedItemKey = 1;

type DragState = {
    placed: PlacedItem;
    source: InvDragSource;
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    previewW: number;
    previewH: number;
    isDragging: boolean;
} | null;
type DragPreview = { placed: PlacedItem; x: number; y: number; width: number; height: number } | null;
type DropHint = { kind: InvGridKind; gx: number; gy: number; valid: boolean } | null;
type GridMetrics = {
    originX: number;
    originY: number;
    cellW: number;
    cellH: number;
};

const RARITY_CLASS: Record<ItemRarity, string> = {
    common: 'is-rarity-common',
    uncommon: 'is-rarity-uncommon',
    rare: 'is-rarity-rare',
    epic: 'is-rarity-epic',
    legend: 'is-rarity-legend',
    unique: 'is-rarity-unique',
};

function itemRarityClass(placed: PlacedItem): string {
    return RARITY_CLASS[placed.item.rarity] ?? RARITY_CLASS.common;
}

/** Read-only drop validity for a grid cell, ignoring the dragged item's own cells. */
function canDropAt(grid: GridInventory, placed: PlacedItem, gx: number, gy: number): boolean {
    const item = placed.item;
    if (gx < 0 || gy < 0 || gx + item.gridW > grid.width || gy + item.gridH > grid.height) return false;
    for (let dy = 0; dy < item.gridH; dy++) {
        for (let dx = 0; dx < item.gridW; dx++) {
            const occ = grid.getAt(gx + dx, gy + dy);
            if (occ && occ !== placed) {
                // A rune/gem dropped onto a socket-capable host is still a valid move.
                if (!isSocketDrop(item, occ)) return false;
            }
        }
    }
    return true;
}

/** Mirrors InventoryUI's socketing rule for hint purposes (read-only). */
function isSocketDrop(item: PlacedItem['item'], host: PlacedItem): boolean {
    if (!host.item.maxSockets) return false;
    const cat = item.itemCategory ?? item.slot;
    if (cat !== 'rune' && cat !== 'gem') return false;
    if (!host.item.socketTypes?.includes(cat)) return false;
    return (host.sockets?.length ?? 0) < host.item.maxSockets;
}

function placedItemKey(placed: PlacedItem): number {
    let key = placedItemKeys.get(placed);
    if (!key) {
        key = nextPlacedItemKey++;
        placedItemKeys.set(placed, key);
    }
    return key;
}

function gridMetrics(gridEl: HTMLElement, grid: GridInventory): GridMetrics {
    const rect = gridEl.getBoundingClientRect();
    const style = window.getComputedStyle(gridEl);
    const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
    const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
    return {
        originX: rect.left + borderLeft,
        originY: rect.top + borderTop,
        cellW: (rect.width - borderLeft - borderRight) / grid.width,
        cellH: (rect.height - borderTop - borderBottom) / grid.height,
    };
}

function gridCellFromPoint(
    gridEl: HTMLElement,
    grid: GridInventory,
    clientX: number,
    clientY: number,
    offsetX: number,
    offsetY: number,
): { gx: number; gy: number } {
    const metrics = gridMetrics(gridEl, grid);
    return {
        gx: Math.floor((clientX - offsetX - metrics.originX) / metrics.cellW),
        gy: Math.floor((clientY - offsetY - metrics.originY) / metrics.cellH),
    };
}

function InvItem({
    placed,
    spanned,
    dragging,
    onPointerDown,
    onHoverEnter,
    onHoverMove,
    onHoverLeave,
}: {
    placed: PlacedItem;
    spanned: boolean; // true = positioned on a grid; false = fills an equip slot
    dragging: boolean;
    onPointerDown: (e: ReactPointerEvent) => void;
    onHoverEnter?: (e: ReactPointerEvent | ReactMouseEvent) => void;
    onHoverMove?: (e: ReactPointerEvent | ReactMouseEvent) => void;
    onHoverLeave?: () => void;
}) {
    const it = placed.item;
    const posStyle: CSSProperties = spanned
        ? { position: 'absolute', left: placed.gridX * CELL, top: placed.gridY * CELL, width: it.gridW * CELL, height: it.gridH * CELL }
        : { width: '100%', height: '100%' };
    const itemStyle = { ...posStyle, '--inv-item-color': it.color } as CSSProperties;
    const duraPct = it.maxDurability > 0 ? Math.max(0, Math.min(1, placed.durability / it.maxDurability)) : 1;
    const socketed = placed.sockets?.length ?? 0;
    return (
        <div
            className={`inv-item ${itemRarityClass(placed)}${dragging ? ' is-dragging' : ''}`}
            style={itemStyle}
            onPointerDown={onPointerDown}
            onPointerEnter={onHoverEnter}
            onPointerMove={onHoverMove}
            onPointerLeave={onHoverLeave}
            onMouseEnter={onHoverEnter}
            onMouseMove={onHoverMove}
            onMouseLeave={onHoverLeave}
            aria-label={itemName(it)}
        >
            <span className="inv-item__rarity" aria-hidden />
            <span className="inv-item__shine" aria-hidden />
            <ItemGlyph item={it} className="inv-item__icon" />
            {placed.quantity > 1 && <span className="inv-item__qty">{placed.quantity}</span>}
            {!!it.maxSockets && (
                <span className="inv-item__sockets">
                    {'◆'.repeat(socketed)}{'◇'.repeat(Math.max(0, it.maxSockets - socketed))}
                </span>
            )}
            {duraPct < 1 && (
                <div className="inv-item__dura"><div style={{ width: `${duraPct * 100}%` }} /></div>
            )}
        </div>
    );
}

export function InventoryPanel({
    inv,
    embedded = false,
    townStorage = false,
}: {
    inv: InventoryUI;
    embedded?: boolean;
    townStorage?: boolean;
}) {
    useUiVersion();
    const store = useStore();
    const dialogRef = useModalDialog<HTMLDivElement>(!embedded);
    const tip = useItemTooltip();
    const drag = useRef<DragState>(null);
    const [dragPreview, setDragPreview] = useState<DragPreview>(null);
    const [dropHint, setDropHint] = useState<DropHint>(null);
    const [equipHint, setEquipHint] = useState<ItemSlot | null>(null);
    const [mutationSeq, setMutationSeq] = useState(0);

    const bag = inv.getBag();
    const ext = inv.getExternalGrid();
    const char = inv.getActiveCharacter();
    const carryWeight = getPartyCarriedWeight(bag.items, store.getActiveParty());
    const carryAtbPercent = getCarryAtbPercent(carryWeight);

    // Tooltip content for a hovered item — equippables in a grid compare against
    // the currently-worn item in that slot; everything else shows a plain card.
    const tipFor = (placed: PlacedItem, fromEquip: boolean) => {
        const it = placed.item;
        if (!fromEquip && isEquippable(it) && char) {
            return <ItemCompareTooltip candidate={it} equipped={char.equipment.get(it.slot)} candidatePlaced={placed} />;
        }
        return <ItemTooltip item={it} placed={placed} />;
    };

    // Surface InventoryUI feedback (sort/takeAll/raid-loot) transiently.
    const fb = inv.getFeedback();
    const [feedback, setFeedback] = useState('');
    useEffect(() => {
        if (fb.id === 0) return;
        setFeedback(fb.text);
        const id = window.setTimeout(() => setFeedback(''), 2200);
        return () => window.clearTimeout(id);
    }, [fb.id]);

    const beginPointerDrag = (placed: PlacedItem, source: InvDragSource) => (e: ReactPointerEvent) => {
        if (e.button !== 0) return;
        tip.hide();
        const rect = e.currentTarget.getBoundingClientRect();
        const offsetX = source.kind === 'grid'
            ? e.clientX - rect.left
            : (placed.item.gridW * CELL) / 2;
        const offsetY = source.kind === 'grid'
            ? e.clientY - rect.top
            : (placed.item.gridH * CELL) / 2;
        const uiScale = SettingsManager.getUIScale();
        drag.current = {
            placed,
            source,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            x: e.clientX - offsetX,
            y: e.clientY - offsetY,
            offsetX,
            offsetY,
            previewW: source.kind === 'grid' ? rect.width : placed.item.gridW * CELL * uiScale,
            previewH: source.kind === 'grid' ? rect.height : placed.item.gridH * CELL * uiScale,
            isDragging: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
    };

    useEffect(() => {
        const clearDrag = () => {
            drag.current = null;
            setDragPreview(null);
            setDropHint(null);
            setEquipHint(null);
        };

        // Read-only drop-target highlight while dragging (footprint + equip slot).
        const updateHints = (d: NonNullable<DragState>, clientX: number, clientY: number) => {
            const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
            const gridEl = target?.closest<HTMLElement>('[data-inv-grid]');
            if (gridEl) {
                const kind = gridEl.dataset.invGrid as InvGridKind | undefined;
                const grid = kind === 'bag' ? inv.getBag() : kind === 'ext' ? inv.getExternalGrid() : null;
                if (kind && grid) {
                    const { gx, gy } = gridCellFromPoint(gridEl, grid, clientX, clientY, d.offsetX, d.offsetY);
                    setDropHint({ kind, gx, gy, valid: canDropAt(grid, d.placed, gx, gy) });
                    setEquipHint(null);
                    return;
                }
            }
            const equipEl = target?.closest<HTMLElement>('[data-inv-equip]');
            if (equipEl) {
                const slot = equipEl.dataset.invEquip as ItemSlot | undefined;
                setEquipHint(slot && slotAcceptsItem(slot, d.placed.item.slot) ? slot : null);
                setDropHint(null);
                return;
            }
            setDropHint(null);
            setEquipHint(null);
        };

        const finishDrop = (d: NonNullable<DragState>, clientX: number, clientY: number): 'equip' | 'unequip' | 'move' | null => {
            const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
            const gridEl = target?.closest<HTMLElement>('[data-inv-grid]');
            if (gridEl) {
                const kind = gridEl.dataset.invGrid as InvGridKind | undefined;
                if (!kind) return null;
                const grid = kind === 'bag' ? inv.getBag() : kind === 'ext' ? inv.getExternalGrid() : null;
                if (!grid) return null;
                const { gx, gy } = gridCellFromPoint(gridEl, grid, clientX, clientY, d.offsetX, d.offsetY);
                if (!inv.moveToCell(d.placed, d.source, kind, gx, gy)) return null;
                return d.source.kind === 'equip' ? 'unequip' : 'move';
            }
            const equipEl = target?.closest<HTMLElement>('[data-inv-equip]');
            if (equipEl) {
                const slot = equipEl.dataset.invEquip as ItemSlot | undefined;
                if (!slot) return null;
                return inv.moveToEquip(d.placed, d.source, slot) ? 'equip' : null;
            }
            return null;
        };

        const finishActiveDrag = (clientX: number, clientY: number) => {
            const d = drag.current;
            if (!d) return;
            clearDrag();
            const result = d.isDragging
                ? finishDrop(d, clientX, clientY)
                : (inv.quickMove(d.placed, d.source) ? (d.source.kind === 'equip' ? 'unequip' : 'move') : null);
            if (result === 'equip') AudioManager.playSfx('sfx.equip');
            else if (result === 'unequip') AudioManager.playSfx('sfx.unequip');
            else if (result) AudioManager.playUi(d.isDragging ? 'ui.confirm' : 'ui.hover');
            const success = result !== null;
            if (success) setMutationSeq((seq) => seq + 1);
            store.refresh();
        };

        const onPointerMove = (e: PointerEvent) => {
            const d = drag.current;
            if (!d || e.pointerId !== d.pointerId) return;
            if (d.isDragging && e.buttons === 0) {
                clearDrag();
                store.refresh();
                return;
            }
            d.x = e.clientX - d.offsetX;
            d.y = e.clientY - d.offsetY;
            const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
            if (!d.isDragging && dist >= DRAG_THRESHOLD) d.isDragging = true;
            if (d.isDragging) {
                setDragPreview({
                    placed: d.placed,
                    x: d.x,
                    y: d.y,
                    width: d.previewW,
                    height: d.previewH,
                });
                updateHints(d, e.clientX, e.clientY);
                e.preventDefault();
            }
        };

        const onPointerUp = (e: PointerEvent) => {
            const d = drag.current;
            if (!d) return;
            if (e.pointerId !== d.pointerId) {
                clearDrag();
                store.refresh();
                return;
            }
            finishActiveDrag(e.clientX, e.clientY);
            e.preventDefault();
        };

        const onPointerCancel = (e: PointerEvent) => {
            const d = drag.current;
            if (!d || e.pointerId !== d.pointerId) return;
            clearDrag();
            store.refresh();
        };

        const onMouseUp = (e: MouseEvent) => {
            if (!drag.current) return;
            finishActiveDrag(e.clientX, e.clientY);
            e.preventDefault();
        };

        const onAbortDrag = () => {
            if (!drag.current) return;
            clearDrag();
            store.refresh();
        };

        const onVisibilityChange = () => {
            if (document.hidden) onAbortDrag();
        };

        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp, { passive: false });
        window.addEventListener('pointercancel', onPointerCancel);
        window.addEventListener('mouseup', onMouseUp, { passive: false });
        window.addEventListener('blur', onAbortDrag);
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerCancel);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('blur', onAbortDrag);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            clearDrag();
        };
    }, [inv, store]);

    const mutateInventory = (action: () => void) => {
        action();
        setMutationSeq((seq) => seq + 1);
        store.refresh();
    };

    const renderGrid = (grid: GridInventory, kind: InvGridKind) => (
        <div
            key={`${kind}-${mutationSeq}`}
            className={`inv-grid${dragPreview ? ' is-drop-active' : ''}`}
            style={{ width: grid.width * CELL, height: grid.height * CELL } as CSSProperties}
            data-inv-grid={kind}
        >
            {grid.items.map((placed) => (
                <InvItem
                    key={`${kind}-${placedItemKey(placed)}`}
                    placed={placed}
                    spanned
                    dragging={dragPreview?.placed === placed}
                    onPointerDown={beginPointerDrag(placed, { kind: 'grid', grid: kind, gridX: placed.gridX, gridY: placed.gridY })}
                    onHoverEnter={tip.show(tipFor(placed, false))}
                    onHoverMove={tip.move}
                    onHoverLeave={tip.hide}
                />
            ))}
            {dropHint?.kind === kind && drag.current && (
                <div
                    className={`inv-drop-cell ${dropHint.valid ? 'is-valid' : 'is-invalid'}`}
                    style={{
                        left: dropHint.gx * CELL,
                        top: dropHint.gy * CELL,
                        width: drag.current.placed.item.gridW * CELL,
                        height: drag.current.placed.item.gridH * CELL,
                    } as CSSProperties}
                />
            )}
        </div>
    );

    const panelStyle = { '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;
    const panelTitle = townStorage ? t('inv.storageTitle') : t('inv.title');
    const panelClass = [
        'ds-panel',
        'ds-inv',
        embedded ? 'is-embedded' : '',
        townStorage ? 'is-town-storage' : '',
    ].filter(Boolean).join(' ');
    const bodyClass = [
        'ds-inv__body',
        townStorage ? 'is-town-storage' : '',
    ].filter(Boolean).join(' ');
    const dragLayer = typeof document === 'undefined' ? null : document.getElementById('ui-overlay');
    const renderExternal = () => ext ? (
        <div className="ds-inv__col">
            <div className="ds-inv__coltitle">{inv.getExternalTitle()}</div>
            {renderGrid(ext, 'ext')}
            {inv.isExternalRaidLoot() && (
                <button className="ds-btn ds-inv__action" onClick={() => mutateInventory(() => setFeedback(inv.takeAll()))}>
                    {t('inv.takeAll')}
                </button>
            )}
        </div>
    ) : null;
    const renderEquipment = () => (
        <div className="ds-inv__col ds-inv__equipcol">
            <div className="ds-inv__coltitle">{t('inv.equipment')}</div>
            <div className="inv-equip">
                {EQUIP_SLOT_LIST.map(({ slot, labelKey }) => {
                    const equipped = char?.equipment.get(slot);
                    return (
                        <div
                            key={slot}
                            className={`inv-eqslot inv-eqslot--${slot}${equipHint === slot ? ' is-drop-target' : ''}`}
                            data-inv-equip={slot}
                            title={t(labelKey)}
                        >
                            {equipped ? (
                                <InvItem
                                    placed={equipped}
                                    key={`equip-${slot}-${placedItemKey(equipped)}`}
                                    spanned={false}
                                    dragging={dragPreview?.placed === equipped}
                                    onPointerDown={beginPointerDrag(equipped, { kind: 'equip', slot })}
                                    onHoverEnter={tip.show(tipFor(equipped, true))}
                                    onHoverMove={tip.move}
                                    onHoverLeave={tip.hide}
                                />
                            ) : (
                                <span className="inv-eqslot__label">{t(labelKey)}</span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
    const renderBackpack = () => (
        <div className="ds-inv__col">
            <div className="ds-inv__coltitle">
                <span>{t('inv.backpack')}</span>
                <span className="ds-inv__weight">
                    {formatT('inv.weightSummary', { weight: carryWeight.toFixed(1), percent: carryAtbPercent })}
                </span>
                <button className="ds-btn ds-inv__sortbtn" onClick={() => mutateInventory(() => setFeedback(inv.sortBag()))}>
                    {t('inv.sort')}
                </button>
            </div>
            {renderGrid(bag, 'bag')}
        </div>
    );

    return (
        <div
            ref={dialogRef}
            role={embedded ? undefined : 'dialog'}
            aria-modal={embedded ? undefined : 'true'}
            aria-label={embedded ? undefined : panelTitle}
            tabIndex={embedded ? undefined : -1}
            className={panelClass}
            style={panelStyle}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="ds-panel__header">
                <span className="ds-panel__title">{panelTitle}</span>
                {!embedded && (
                    <button className="ds-close-btn" onClick={() => store.closeInventory()} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
                )}
            </div>

            <div className={bodyClass}>
                {townStorage ? (
                    <>
                        {renderExternal()}
                        <div className="ds-inv__town-side">
                            {renderEquipment()}
                            {renderBackpack()}
                        </div>
                    </>
                ) : (
                    <>
                        {renderExternal()}
                        {renderEquipment()}
                        {renderBackpack()}
                    </>
                )}
            </div>

            <div className="ds-inv__feedback">{feedback}</div>
            {dragPreview && dragLayer && createPortal(
                <div
                    className={`inv-drag-ghost ${itemRarityClass(dragPreview.placed)}`}
                    style={{
                        left: dragPreview.x,
                        top: dragPreview.y,
                        transform: 'none',
                        width: dragPreview.width,
                        height: dragPreview.height,
                        '--inv-item-color': dragPreview.placed.item.color,
                    } as CSSProperties}
                >
                    <span className="inv-item__rarity" aria-hidden />
                    <span className="inv-item__shine" aria-hidden />
                    <ItemGlyph item={dragPreview.placed.item} className="inv-drag-ghost__icon" />
                    <span className="inv-drag-ghost__label">{itemName(dragPreview.placed.item)}</span>
                </div>,
                dragLayer,
            )}
            {tip.node}
        </div>
    );
}
