/**
 * ItemDB — Item definitions with Tarkov-style grid sizes.
 * Each item has a width × height in inventory grid cells.
 */

import { MasterBranch } from './ClassTree';

export type ItemSlot = 'weapon' | 'shield' | 'head' | 'body' | 'boots' | 'accessory' | 'accessory2' | 'consumable' | 'material';

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
    descriptionKr?: string;
    buyPrice?: number;     // gold cost to buy from shop
    requiredTier?: number; // minimum tier to equip (1-7)
    branch?: MasterBranch; // which branch can equip (battle/tactics/healer/magic)
}

// ─── Armor Generation ─────────────────────────────────────────
// 4 branches × 7 tiers × 3 slots = 84 armor pieces

interface ArmorSeriesInfo {
    branch: MasterBranch;
    branchKr: string;
    series: { tier: number; nameEn: string; nameKr: string; color: string }[];
}

const ARMOR_SERIES: ArmorSeriesInfo[] = [
    {
        branch: 'battle', branchKr: '전투',
        series: [
            { tier: 1, nameEn: 'Leather', nameKr: '래더', color: '#8b4513' },
            { tier: 2, nameEn: 'Wood', nameKr: '우드', color: '#6b8e23' },
            { tier: 3, nameEn: 'Bronze', nameKr: '브론즈', color: '#cd7f32' },
            { tier: 4, nameEn: 'Iron', nameKr: '아이언', color: '#708090' },
            { tier: 5, nameEn: 'Mithril', nameKr: '미스릴', color: '#4682b4' },
            { tier: 6, nameEn: 'Silver', nameKr: '실버', color: '#c0c0c0' },
            { tier: 7, nameEn: 'Gold', nameKr: '골드', color: '#ffd700' },
        ]
    },
    {
        branch: 'tactics', branchKr: '전술',
        series: [
            { tier: 1, nameEn: 'Leather', nameKr: '래더', color: '#8b4513' },
            { tier: 2, nameEn: 'Wood', nameKr: '우드', color: '#6b8e23' },
            { tier: 3, nameEn: 'Bronze', nameKr: '브론즈', color: '#cd7f32' },
            { tier: 4, nameEn: 'Iron', nameKr: '아이언', color: '#708090' },
            { tier: 5, nameEn: 'Mithril', nameKr: '미스릴', color: '#4682b4' },
            { tier: 6, nameEn: 'Silver', nameKr: '실버', color: '#c0c0c0' },
            { tier: 7, nameEn: 'Gold', nameKr: '골드', color: '#ffd700' },
        ]
    },
    {
        branch: 'healer', branchKr: '힐러',
        series: [
            { tier: 1, nameEn: 'Leather', nameKr: '래더', color: '#8b4513' },
            { tier: 2, nameEn: 'Wood', nameKr: '우드', color: '#6b8e23' },
            { tier: 3, nameEn: 'Bronze', nameKr: '브론즈', color: '#cd7f32' },
            { tier: 4, nameEn: 'Iron', nameKr: '아이언', color: '#708090' },
            { tier: 5, nameEn: 'Mithril', nameKr: '미스릴', color: '#4682b4' },
            { tier: 6, nameEn: 'Silver', nameKr: '실버', color: '#c0c0c0' },
            { tier: 7, nameEn: 'Gold', nameKr: '골드', color: '#ffd700' },
        ]
    },
    {
        branch: 'magic', branchKr: '마법',
        series: [
            { tier: 1, nameEn: 'White', nameKr: '화이트', color: '#f0f0f0' },
            { tier: 2, nameEn: 'Yellow', nameKr: '옐로우', color: '#daa520' },
            { tier: 3, nameEn: 'Blue', nameKr: '블루', color: '#4169e1' },
            { tier: 4, nameEn: 'Red', nameKr: '레드', color: '#dc143c' },
            { tier: 5, nameEn: 'Mithril', nameKr: '미스릴', color: '#4682b4' },
            { tier: 6, nameEn: 'Magenta', nameKr: '마젠타', color: '#ff00ff' },
            { tier: 7, nameEn: 'Rainbow', nameKr: '레인보우', color: '#ff69b4' },
        ]
    }
];

interface ArmorSlotInfo {
    slot: ItemSlot;
    nameEn: string;
    nameKr: string;
    icon: string;
    gridW: number;
    gridH: number;
    /** stat multiplier vs base */
    defMult: number;
    magDefMult: number;
}

const ARMOR_SLOTS: ArmorSlotInfo[] = [
    { slot: 'head',  nameEn: 'Helmet', nameKr: '투구',  icon: '⛑️', gridW: 2, gridH: 2, defMult: 0.6, magDefMult: 0.3 },
    { slot: 'body',  nameEn: 'Armor',  nameKr: '갑옷',  icon: '🦺', gridW: 2, gridH: 3, defMult: 1.0, magDefMult: 0.5 },
    { slot: 'boots', nameEn: 'Boots',  nameKr: '장화',  icon: '🥾', gridW: 2, gridH: 2, defMult: 0.4, magDefMult: 0.2 },
];

function generateBranchArmor(): ItemDef[] {
    const items: ItemDef[] = [];
    for (const branchInfo of ARMOR_SERIES) {
        for (const tier of branchInfo.series) {
            for (const slotInfo of ARMOR_SLOTS) {
                const baseDef = 3 + tier.tier * 4;  // 7, 11, 15, 19, 23, 27, 31
                const isMagicBranch = branchInfo.branch === 'magic';
                const def = isMagicBranch
                    ? Math.floor(baseDef * slotInfo.defMult * 0.5)
                    : Math.floor(baseDef * slotInfo.defMult);
                const magDef = isMagicBranch
                    ? Math.floor(baseDef * slotInfo.magDefMult * 2)
                    : Math.floor(baseDef * slotInfo.magDefMult);
                
                const id = `${branchInfo.branch}_t${tier.tier}_${slotInfo.slot}`;
                items.push({
                    id,
                    name: `${tier.nameEn} ${slotInfo.nameEn}`,
                    nameKr: `${tier.nameKr} ${slotInfo.nameKr}`,
                    slot: slotInfo.slot,
                    gridW: slotInfo.gridW,
                    gridH: slotInfo.gridH,
                    color: tier.color,
                    icon: slotInfo.icon,
                    maxDurability: 80 + tier.tier * 20,
                    stats: { def, magDef },
                    description: `${tier.nameEn} ${slotInfo.nameEn} for ${branchInfo.branch} classes. Requires Tier ${tier.tier}.`,
                    descriptionKr: `${branchInfo.branchKr} 계열 ${tier.tier}단 이상 착용 가능한 ${tier.nameKr} ${slotInfo.nameKr}.`,
                    buyPrice: 50 + tier.tier * 80,
                    requiredTier: tier.tier,
                    branch: branchInfo.branch,
                });
            }
        }
    }
    return items;
}

/** All generated branch armor */
const BRANCH_ARMOR = generateBranchArmor();

/** Item database — starting items */
export const ITEMS: ItemDef[] = [
    // ─── Weapons ─────────────────────
    {
        id: 'short_sword', name: 'Short Sword', nameKr: '단검',
        slot: 'weapon', gridW: 1, gridH: 3, color: '#8899aa', icon: '🗡️',
        maxDurability: 100,
        stats: { atk: 8 },
        description: 'A basic iron short sword.',
        descriptionKr: '기본적인 철제 단검입니다.'
    },
    {
        id: 'long_sword', name: 'Long Sword', nameKr: '장검',
        slot: 'weapon', gridW: 1, gridH: 4, color: '#aabbcc', icon: '⚔️',
        maxDurability: 120,
        stats: { atk: 14 },
        description: 'A well-forged long sword with good reach.',
        descriptionKr: '리치가 길고 잘 벼려진 장검입니다.'
    },
    {
        id: 'staff', name: 'Magic Staff', nameKr: '스태프',
        slot: 'weapon', gridW: 1, gridH: 4, color: '#9966cc', icon: '🪄',
        maxDurability: 80,
        stats: { magAtk: 12, mp: 10 },
        description: 'A staff imbued with magical energy.',
        descriptionKr: '마력이 깃든 지팡이입니다.'
    },
    {
        id: 'short_bow', name: 'Short Bow', nameKr: '숏보우',
        slot: 'weapon', gridW: 2, gridH: 3, color: '#8b6914', icon: '🏹',
        maxDurability: 90,
        stats: { atk: 10 },
        description: 'A compact bow for ranged attacks.',
        descriptionKr: '원거리 공격용 소형 활입니다.'
    },
    {
        id: 'lance', name: 'Iron Lance', nameKr: '철창',
        slot: 'weapon', gridW: 1, gridH: 5, color: '#778899', icon: '🔱',
        maxDurability: 110,
        stats: { atk: 12 },
        description: 'A long iron lance for cavalry and lancers.',
        descriptionKr: '기병과 창병을 위한 긴 철제 창입니다.'
    },

    // ─── Shields ─────────────────────
    {
        id: 'wooden_shield', name: 'Wooden Shield', nameKr: '나무방패',
        slot: 'shield', gridW: 2, gridH: 2, color: '#a0522d', icon: '🛡️',
        maxDurability: 80,
        stats: { def: 5 },
        description: 'A simple wooden shield.',
        descriptionKr: '단순한 나무 방패입니다.'
    },

    // ─── Branch Armor (4 branches × 7 tiers × 3 slots) ──────
    ...BRANCH_ARMOR,

    // ─── Consumables (약초 시리즈) ──────
    {
        id: 'herb_cheap', name: 'Cheap Herb', nameKr: '싸구려약초',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#8fbc8f', icon: '🌿',
        maxDurability: 1,
        stats: { hp: 50 },
        description: 'A cheap, common herb. Restores 50 HP.',
        descriptionKr: '어디서나 쉽게 구할 수 있는 싸구려 약초. HP 50 회복.',
        buyPrice: 10
    },
    {
        id: 'herb_common', name: 'Common Herb', nameKr: '흔한약초',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#3cb371', icon: '🌿',
        maxDurability: 1,
        stats: { hp: 150 },
        description: 'A commonly found herb. Restores 150 HP.',
        descriptionKr: '그럭저럭 쓸만한 흔한 약초. HP 150 회복.',
        buyPrice: 50
    },
    {
        id: 'herb_rare', name: 'Precious Herb', nameKr: '귀한약초',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#2e8b57', icon: '🍀',
        maxDurability: 1,
        stats: { hp: 500 },
        description: 'A precious herb with strong healing properties. Restores 500 HP.',
        descriptionKr: '치유 효과가 뛰어난 귀한 약초. HP 500 회복.',
        buyPrice: 200
    },
    {
        id: 'herb_legendary', name: 'Legendary Herb', nameKr: '희귀한약초',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#006400', icon: '🍀',
        maxDurability: 1,
        stats: { hp: 999 },
        description: 'An extremely rare herb. Restores 999 HP. ...supposedly rare.',
        descriptionKr: '매우 희귀하다고 적혀있으나 실상은 지극히 흔한 약초. HP 999 회복.',
        buyPrice: 500
    },
    {
        id: 'mp_potion', name: 'MP Potion', nameKr: 'MP 포션',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#4488ff', icon: '🧪',
        maxDurability: 1,
        stats: { mp: 30 },
        description: 'Restores 30 MP.',
        descriptionKr: '마나를 30 회복합니다.',
        buyPrice: 25
    },
    {
        id: 'repair_kit', name: 'Repair Kit', nameKr: '수리 키트',
        slot: 'consumable', gridW: 1, gridH: 2, color: '#ffaa00', icon: '🔧',
        maxDurability: 5,
        description: 'Repairs equipped weapon durability.',
        descriptionKr: '착용한 무기의 내구도를 수리합니다.',
        buyPrice: 50
    },

    // ─── Accessories (다크세이버 장신구) ─────
    {
        id: 'sword_manual', name: 'Sword Manual', nameKr: '검술교본',
        slot: 'accessory', gridW: 1, gridH: 2, color: '#c4a265', icon: '📖',
        maxDurability: 999,
        stats: { atk: 5 },
        description: 'A manual on swordsmanship. Boosts all physical combat ability and critical rate.',
        descriptionKr: '물리공격 능률과 크리티컬 확률을 높여주는 검술 교본. 아켄의 혼이 없다면 이걸로 끝까지.',
        buyPrice: 300
    },
    {
        id: 'power_ring', name: 'Power Ring', nameKr: '파워링',
        slot: 'accessory', gridW: 1, gridH: 1, color: '#ff6600', icon: '💍',
        maxDurability: 999,
        stats: { atk: 8 },
        description: 'A ring of raw power. Higher ATK boost than Sword Manual, but harder to obtain.',
        descriptionKr: '검술교본보다 공격능률이 높은 반지. 구하기 쉽지 않다.',
        buyPrice: 800
    },
    {
        id: 'shell_ring', name: 'Shell Ring', nameKr: '쉘링',
        slot: 'accessory', gridW: 1, gridH: 1, color: '#9966ff', icon: '💎',
        maxDurability: 999,
        stats: { magAtk: 8 },
        description: 'A ring that amplifies magical power. Essential for mage classes.',
        descriptionKr: '마법공격 능률을 높여주는 반지. 7단까진 나쁘지 않게 쓰인다.',
        buyPrice: 500
    },
    {
        id: 'heal_ring', name: 'Heal Ring', nameKr: '힐 링',
        slot: 'accessory', gridW: 1, gridH: 1, color: '#00ff88', icon: '💚',
        maxDurability: 999,
        stats: { hp: 10 },  // special: 10% HP regen per action (handled in engine)
        description: 'The legendary Heal Ring. Restores 10% HP on every action. The most broken item in Darksaber history.',
        descriptionKr: '온라인게임 역사상 최강의 사기템. 이동·공격·스킬 사용시 전체 HP의 10% 회복.',
        buyPrice: 5000
    },
    {
        id: 'amulet', name: 'Amulet', nameKr: '아뮬렛',
        slot: 'accessory', gridW: 1, gridH: 1, color: '#4488cc', icon: '🔮',
        maxDurability: 999,
        stats: { mp: 30 },
        description: 'An amulet that increases maximum MP.',
        descriptionKr: '최대 마나를 늘려주는 아뮬렛. 쉘링보다 쓸모가 없다고 한다.',
        buyPrice: 400
    },

    // ─── Boss Drops (Rare) ──────────
    {
        id: 'corrupted_blade', name: 'Corrupted Blade', nameKr: '타락한 검',
        slot: 'weapon', gridW: 2, gridH: 4, color: '#cc0033', icon: '🗡️',
        maxDurability: 200,
        stats: { atk: 28, magAtk: 8 },
        description: 'A cursed blade dripping with dark energy. Dropped by Corrupted Giants.',
        descriptionKr: '어둠의 에너지가 흐르는 저주받은 검입니다. 타락한 거인이 드랍합니다.'
    },
    {
        id: 'shadow_cloak', name: 'Shadow Cloak', nameKr: '그림자 망토',
        slot: 'body', gridW: 2, gridH: 3, color: '#2a0845', icon: '🧥',
        maxDurability: 180,
        stats: { def: 18, magDef: 12 },
        description: 'A cloak woven from shadows. Dropped by Shadow Drakes.',
        descriptionKr: '그림자로 짠 망토입니다. 그림자 드레이크가 드랍합니다.'
    },
    {
        id: 'void_crystal', name: 'Void Crystal', nameKr: '공허의 수정',
        slot: 'accessory', gridW: 1, gridH: 1, color: '#6600cc', icon: '💎',
        maxDurability: 999,
        stats: { magAtk: 15, mp: 30 },
        description: 'A crystal pulsing with void energy. Dropped by Void Wardens.',
        descriptionKr: '공허의 에너지가 맥동하는 수정입니다. 공허의 감시자가 드랍합니다.'
    },
];

/** Lookup item by ID */
export function getItemDef(id: string): ItemDef | undefined {
    return ITEMS.find(item => item.id === id);
}

/** Get all armor for a specific branch and tier */
export function getArmorForBranchTier(branch: MasterBranch, tier: number): ItemDef[] {
    return BRANCH_ARMOR.filter(item => item.branch === branch && item.requiredTier === tier);
}

/** Get all armor equippable by a branch up to a certain tier */
export function getEquippableArmor(branch: MasterBranch, maxTier: number): ItemDef[] {
    return BRANCH_ARMOR.filter(item => item.branch === branch && (item.requiredTier || 1) <= maxTier);
}

