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
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { t } from '../../../i18n/LanguageManager';
import { SettingsManager } from '../../../engine/SettingsManager';
import { AudioManager } from '../../../engine/AudioManager';
import type { PlacedItem } from '../../../inventory/GridInventory';
import type { GridInventory } from '../../../inventory/GridInventory';
import {
    EQUIP_SLOT_LIST,
    type InventoryUI,
    type InvDragSource,
    type InvGridKind,
} from '../../../inventory/InventoryUI';
import type { ItemSlot } from '../../../data/ItemDB';
import { useStore, useUiVersion } from '../UiContext';
import { ItemGlyph, itemName, statSummary } from '../town/itemView';

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
    isDragging: boolean;
} | null;
type DragPreview = { placed: PlacedItem; x: number; y: number } | null;

function placedItemKey(placed: PlacedItem): number {
    let key = placedItemKeys.get(placed);
    if (!key) {
        key = nextPlacedItemKey++;
        placedItemKeys.set(placed, key);
    }
    return key;
}

function InvItem({
    placed,
    spanned,
    dragging,
    onPointerDown,
}: {
    placed: PlacedItem;
    spanned: boolean; // true = positioned on a grid; false = fills an equip slot
    dragging: boolean;
    onPointerDown: (e: ReactPointerEvent) => void;
}) {
    const it = placed.item;
    const posStyle: CSSProperties = spanned
        ? { position: 'absolute', left: placed.gridX * CELL, top: placed.gridY * CELL, width: it.gridW * CELL, height: it.gridH * CELL }
        : { width: '100%', height: '100%' };
    const duraPct = it.maxDurability > 0 ? Math.max(0, Math.min(1, placed.durability / it.maxDurability)) : 1;
    const socketed = placed.sockets?.length ?? 0;
    return (
        <div
            className={`inv-item${dragging ? ' is-dragging' : ''}`}
            style={{ ...posStyle, background: `${it.color}33`, borderColor: it.color }}
            onPointerDown={onPointerDown}
            title={`${itemName(it)}\n${statSummary(it)}`}
            aria-label={itemName(it)}
        >
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

export function InventoryPanel({ inv, embedded = false }: { inv: InventoryUI; embedded?: boolean }) {
    useUiVersion();
    const store = useStore();
    const drag = useRef<DragState>(null);
    const [dragPreview, setDragPreview] = useState<DragPreview>(null);
    const [mutationSeq, setMutationSeq] = useState(0);

    const bag = inv.getBag();
    const ext = inv.getExternalGrid();
    const char = inv.getActiveCharacter();

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
        const rect = e.currentTarget.getBoundingClientRect();
        const offsetX = source.kind === 'grid'
            ? e.clientX - rect.left
            : (placed.item.gridW * CELL) / 2;
        const offsetY = source.kind === 'grid'
            ? e.clientY - rect.top
            : (placed.item.gridH * CELL) / 2;
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
        };

        const finishDrop = (d: NonNullable<DragState>, clientX: number, clientY: number): boolean => {
            const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
            const gridEl = target?.closest<HTMLElement>('[data-inv-grid]');
            if (gridEl) {
                const kind = gridEl.dataset.invGrid as InvGridKind | undefined;
                if (!kind) return false;
                const rect = gridEl.getBoundingClientRect();
                const gx = Math.floor((clientX - d.offsetX - rect.left) / CELL);
                const gy = Math.floor((clientY - d.offsetY - rect.top) / CELL);
                return inv.moveToCell(d.placed, d.source, kind, gx, gy);
            }
            const equipEl = target?.closest<HTMLElement>('[data-inv-equip]');
            if (equipEl) {
                const slot = equipEl.dataset.invEquip as ItemSlot | undefined;
                if (!slot) return false;
                return inv.moveToEquip(d.placed, d.source, slot);
            }
            return false;
        };

        const finishActiveDrag = (clientX: number, clientY: number) => {
            const d = drag.current;
            if (!d) return;
            clearDrag();
            const success = d.isDragging
                ? finishDrop(d, clientX, clientY)
                : inv.quickMove(d.placed, d.source);
            if (success) AudioManager.playUi(d.isDragging ? 'ui.confirm' : 'ui.hover');
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
                setDragPreview({ placed: d.placed, x: d.x, y: d.y });
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
            className="inv-grid"
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
                />
            ))}
        </div>
    );

    const panelStyle = { '--ds-scale': SettingsManager.getUIScale() } as CSSProperties;

    return (
        <div className={`ds-panel ds-inv${embedded ? ' is-embedded' : ''}`} style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div className="ds-panel__header">
                <span className="ds-panel__title">{t('inv.title')}</span>
                {!embedded && (
                    <button className="ds-close-btn" onClick={() => store.closeInventory()} aria-label={t('ui.close')} title={t('ui.close')}>✕</button>
                )}
            </div>

            <div className="ds-inv__body">
                {/* External grid (stash / loot) */}
                {ext && (
                    <div className="ds-inv__col">
                        <div className="ds-inv__coltitle">{inv.getExternalTitle()}</div>
                        {renderGrid(ext, 'ext')}
                        {inv.isExternalRaidLoot() && (
                            <button className="ds-btn ds-inv__action" onClick={() => mutateInventory(() => setFeedback(inv.takeAll()))}>
                                {t('inv.takeAll')}
                            </button>
                        )}
                    </div>
                )}

                {/* Equipment */}
                <div className="ds-inv__col ds-inv__equipcol">
                    <div className="ds-inv__coltitle">{t('inv.equipment')}</div>
                    <div className="inv-equip">
                        {EQUIP_SLOT_LIST.map(({ slot, labelKey }) => {
                            const equipped = char?.equipment.get(slot);
                            return (
                                <div
                                    key={slot}
                                    className={`inv-eqslot inv-eqslot--${slot}`}
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
                                        />
                                    ) : (
                                        <span className="inv-eqslot__label">{t(labelKey)}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Backpack */}
                <div className="ds-inv__col">
                    <div className="ds-inv__coltitle">
                        <span>{t('inv.backpack')}</span>
                        <button className="ds-btn ds-inv__sortbtn" onClick={() => mutateInventory(() => setFeedback(inv.sortBag()))}>
                            {t('inv.sort')}
                        </button>
                    </div>
                    {renderGrid(bag, 'bag')}
                </div>
            </div>

            <div className="ds-inv__feedback">{feedback}</div>
            {dragPreview && (
                <div
                    className="inv-drag-ghost"
                    style={{
                        left: dragPreview.x,
                        top: dragPreview.y,
                        transform: 'none',
                        width: dragPreview.placed.item.gridW * CELL,
                        height: dragPreview.placed.item.gridH * CELL,
                        background: `${dragPreview.placed.item.color}33`,
                        borderColor: dragPreview.placed.item.color,
                    } as CSSProperties}
                >
                    <ItemGlyph item={dragPreview.placed.item} className="inv-item__icon" />
                </div>
            )}
        </div>
    );
}
