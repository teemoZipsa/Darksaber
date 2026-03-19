/**
 * ItemDB — Item definitions with Tarkov-style grid sizes.
 * Each item has a width × height in inventory grid cells.
 */

export type ItemSlot = 'weapon' | 'shield' | 'head' | 'body' | 'accessory' | 'consumable' | 'material';

export interface ItemDef {
    id: string;
    name: string;
    nameKr: string;
    slot: ItemSlot;
    gridW: number;    // width in inventory cells
    gridH: number;    // height in inventory cells
    color: string;    // display color in inventory
    icon: string;     // emoji/text icon
    maxDurability: number;
    stats?: {
        atk?: number;
        def?: number;
        magAtk?: number;
        magDef?: number;
        hp?: number;
        mp?: number;
    };
    description: string;
}

/** Item database — starting items */
export const ITEMS: ItemDef[] = [
    // ─── Weapons ─────────────────────
    {
        id: 'short_sword', name: 'Short Sword', nameKr: '단검',
        slot: 'weapon', gridW: 1, gridH: 3, color: '#8899aa', icon: '🗡️',
        maxDurability: 100,
        stats: { atk: 8 },
        description: 'A basic iron short sword.'
    },
    {
        id: 'long_sword', name: 'Long Sword', nameKr: '장검',
        slot: 'weapon', gridW: 1, gridH: 4, color: '#aabbcc', icon: '⚔️',
        maxDurability: 120,
        stats: { atk: 14 },
        description: 'A well-forged long sword with good reach.'
    },
    {
        id: 'staff', name: 'Magic Staff', nameKr: '스태프',
        slot: 'weapon', gridW: 1, gridH: 4, color: '#9966cc', icon: '🪄',
        maxDurability: 80,
        stats: { magAtk: 12, mp: 10 },
        description: 'A staff imbued with magical energy.'
    },
    {
        id: 'short_bow', name: 'Short Bow', nameKr: '숏보우',
        slot: 'weapon', gridW: 2, gridH: 3, color: '#8b6914', icon: '🏹',
        maxDurability: 90,
        stats: { atk: 10 },
        description: 'A compact bow for ranged attacks.'
    },
    {
        id: 'lance', name: 'Iron Lance', nameKr: '철창',
        slot: 'weapon', gridW: 1, gridH: 5, color: '#778899', icon: '🔱',
        maxDurability: 110,
        stats: { atk: 12 },
        description: 'A long iron lance for cavalry and lancers.'
    },

    // ─── Shields ─────────────────────
    {
        id: 'wooden_shield', name: 'Wooden Shield', nameKr: '나무방패',
        slot: 'shield', gridW: 2, gridH: 2, color: '#a0522d', icon: '🛡️',
        maxDurability: 80,
        stats: { def: 5 },
        description: 'A simple wooden shield.'
    },

    // ─── Armor ───────────────────────
    {
        id: 'leather_armor', name: 'Leather Armor', nameKr: '가죽갑옷',
        slot: 'body', gridW: 2, gridH: 3, color: '#8b4513', icon: '🦺',
        maxDurability: 100,
        stats: { def: 8, magDef: 2 },
        description: 'Light leather armor with decent protection.'
    },
    {
        id: 'iron_armor', name: 'Iron Armor', nameKr: '철갑옷',
        slot: 'body', gridW: 2, gridH: 3, color: '#708090', icon: '🛡️',
        maxDurability: 150,
        stats: { def: 15, magDef: 3 },
        description: 'Heavy iron plate armor.'
    },

    // ─── Headgear ────────────────────
    {
        id: 'iron_helm', name: 'Iron Helmet', nameKr: '철투구',
        slot: 'head', gridW: 2, gridH: 2, color: '#696969', icon: '⛑️',
        maxDurability: 90,
        stats: { def: 4 },
        description: 'A sturdy iron helmet.'
    },

    // ─── Consumables ─────────────────
    {
        id: 'hp_potion', name: 'HP Potion', nameKr: 'HP 포션',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#ff4444', icon: '🧪',
        maxDurability: 1,
        stats: { hp: 50 },
        description: 'Restores 50 HP.'
    },
    {
        id: 'mp_potion', name: 'MP Potion', nameKr: 'MP 포션',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#4488ff', icon: '🧪',
        maxDurability: 1,
        stats: { mp: 30 },
        description: 'Restores 30 MP.'
    },
    {
        id: 'repair_kit', name: 'Repair Kit', nameKr: '수리 키트',
        slot: 'consumable', gridW: 1, gridH: 2, color: '#ffaa00', icon: '🔧',
        maxDurability: 5,
        description: 'Repairs equipped weapon durability.'
    },

    // ─── Accessories ─────────────────
    {
        id: 'power_ring', name: 'Power Ring', nameKr: '힘의 반지',
        slot: 'accessory', gridW: 1, gridH: 1, color: '#ff6600', icon: '💍',
        maxDurability: 999,
        stats: { atk: 3 },
        description: 'A ring that slightly boosts attack.'
    },
];

/** Lookup item by ID */
export function getItemDef(id: string): ItemDef | undefined {
    return ITEMS.find(item => item.id === id);
}
