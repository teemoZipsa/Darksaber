/** EquipmentSlots — display-only list of the character's equipped gear. */

import type { Character } from '../../../character/Character';
import type { ItemSlot } from '../../../data/ItemDB';
import { i18n, t } from '../../../i18n/LanguageManager';

// Equippable slots shown in the panel, paired with their i18n label keys.
const SLOTS: Array<{ slot: ItemSlot; labelKey: string }> = [
    { slot: 'weapon', labelKey: 'inv.weapon' },
    { slot: 'shield', labelKey: 'inv.shield' },
    { slot: 'head', labelKey: 'inv.head' },
    { slot: 'body', labelKey: 'inv.body' },
    { slot: 'boots', labelKey: 'inv.boots' },
    { slot: 'accessory', labelKey: 'inv.accessory' },
];

export function EquipmentSlots({ char }: { char: Character }) {
    return (
        <div className="ds-character__equipment">
            {SLOTS.map(({ slot, labelKey }) => {
                const placed = char.equipment.get(slot);
                const itemName = placed
                    ? (i18n.lang === 'ko' ? placed.item.nameKr : placed.item.name)
                    : '—';
                return (
                    <div className="ds-slot" key={slot}>
                        <span className="ds-slot__label">{t(labelKey)}</span>
                        <span className={`ds-slot__item${placed ? '' : ' is-empty'}`}>{itemName}</span>
                    </div>
                );
            })}
        </div>
    );
}
