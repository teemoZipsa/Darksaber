/**
 * InventoryPanel — DD-styled DOM replacement for the canvas InventoryUI.
 *
 * LEFT: external grid (Stash in town / Loot in raid) · CENTER: equipment slots
 * around the character · RIGHT: Tarkov-style backpack grid.
 *
 * Interaction:
 *  - HTML5 drag-and-drop moves an item precisely (grid↔grid, grid↔equip, socketing).
 *    Drop cell = the grid cell under the cursor (top-left of the placement).
 *  - A plain click quick-transfers (bag→ext, ext→bag, equip→bag), mirroring the
 *    canvas "click without dragging" shortcut.
 * All placement rules live in InventoryUI (moveToCell / moveToEquip / quickMove);
 * this component only reads the model (live via useUiVersion) and calls those.
 *
 * Rendered two ways: as a world overlay (with close button) and embedded in the
 * town storage tab (no close button — the town chrome owns closing).
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
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
import { useStore, useUiVersion } from '../UiContext';
import { itemName, statSummary } from '../town/itemView';

const CELL = 40;

type DragState = { placed: PlacedItem; source: InvDragSource } | null;

function InvItem({
    placed,
    spanned,
    onDragStart,
    onClick,
}: {
    placed: PlacedItem;
    spanned: boolean; // true = positioned on a grid; false = fills an equip slot
    onDragStart: (e: DragEvent) => void;
    onClick: () => void;
}) {
    const it = placed.item;
    const posStyle: CSSProperties = spanned
        ? { position: 'absolute', left: placed.gridX * CELL, top: placed.gridY * CELL, width: it.gridW * CELL, height: it.gridH * CELL }
        : { width: '100%', height: '100%' };
    const duraPct = it.maxDurability > 0 ? Math.max(0, Math.min(1, placed.durability / it.maxDurability)) : 1;
    const socketed = placed.sockets?.length ?? 0;
    return (
        <div
            className="inv-item"
            draggable
            style={{ ...posStyle, background: `${it.color}33`, borderColor: it.color }}
            onDragStart={onDragStart}
            onClick={onClick}
            title={`${itemName(it)}\n${statSummary(it)}`}
            aria-label={itemName(it)}
        >
            <span className="inv-item__icon">{it.icon}</span>
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

    const beginDrag = (placed: PlacedItem, source: InvDragSource) => (e: DragEvent) => {
        drag.current = { placed, source };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', placed.item.id);
    };

    const dropOnGrid = (kind: InvGridKind) => (e: DragEvent) => {
        e.preventDefault();
        const d = drag.current; drag.current = null;
        if (!d) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const gx = Math.floor((e.clientX - rect.left) / CELL);
        const gy = Math.floor((e.clientY - rect.top) / CELL);
        if (inv.moveToCell(d.placed, d.source, kind, gx, gy)) AudioManager.playUi('ui.confirm');
        store.refresh();
    };

    const dropOnEquip = (slot: typeof EQUIP_SLOT_LIST[number]['slot']) => (e: DragEvent) => {
        e.preventDefault();
        const d = drag.current; drag.current = null;
        if (!d) return;
        if (inv.moveToEquip(d.placed, d.source, slot)) AudioManager.playUi('ui.confirm');
        store.refresh();
    };

    const quick = (placed: PlacedItem, source: InvDragSource) => () => {
        if (inv.quickMove(placed, source)) AudioManager.playUi('ui.hover');
        store.refresh();
    };

    const renderGrid = (grid: GridInventory, kind: InvGridKind) => (
        <div
            className="inv-grid"
            style={{ width: grid.width * CELL, height: grid.height * CELL } as CSSProperties}
            onDragOver={(e) => e.preventDefault()}
            onDrop={dropOnGrid(kind)}
        >
            {grid.items.map((placed) => (
                <InvItem
                    key={`${placed.item.id}-${placed.gridX}-${placed.gridY}`}
                    placed={placed}
                    spanned
                    onDragStart={beginDrag(placed, { kind: 'grid', grid: kind, gridX: placed.gridX, gridY: placed.gridY })}
                    onClick={quick(placed, { kind: 'grid', grid: kind, gridX: placed.gridX, gridY: placed.gridY })}
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
                            <button className="ds-btn ds-inv__action" onClick={() => { setFeedback(inv.takeAll()); store.refresh(); }}>
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
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={dropOnEquip(slot)}
                                    title={t(labelKey)}
                                >
                                    {equipped ? (
                                        <InvItem
                                            placed={equipped}
                                            spanned={false}
                                            onDragStart={beginDrag(equipped, { kind: 'equip', slot })}
                                            onClick={quick(equipped, { kind: 'equip', slot })}
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
                        <button className="ds-btn ds-inv__sortbtn" onClick={() => { setFeedback(inv.sortBag()); store.refresh(); }}>
                            {t('inv.sort')}
                        </button>
                    </div>
                    {renderGrid(bag, 'bag')}
                </div>
            </div>

            <div className="ds-inv__feedback">{feedback}</div>
        </div>
    );
}
