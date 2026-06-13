/**
 * ItemDB — Item definitions with Tarkov-style grid sizes.
 * Each item has a width × height in inventory grid cells.
 */

import type { MasterBranch } from './ClassTree';
import { ORIGINAL_LATE_STORY_REWARD_ITEMS } from './OriginalLateStoryItems';
import { ORIGINAL_SHOP_ITEMS } from './OriginalShopItems';
import type { CharacterStats } from './Stats';

export type ItemSlot = 'weapon' | 'shield' | 'head' | 'body' | 'boots' | 'accessory' | 'accessory2' | 'consumable' | 'material' | 'rune' | 'gem';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legend' | 'unique';
export type ItemUseEffect = { type: 'recover'; hp?: number; mp?: number };
export type SocketHostKind = 'weapon' | 'armor' | 'shield';
export type SocketInsertKind = 'rune' | 'gem';
export interface ItemIconSprite {
    col: number;
    row: number;
}

export interface ItemDef {
    id: string;
    name: string;
    nameKr: string;
    slot: ItemSlot;
    gridW: number;    // width in inventory cells
    gridH: number;    // height in inventory cells
    color: string;    // display color in inventory
    icon: string;     // emoji/text icon
    iconSprite?: ItemIconSprite; // 32x32 cell in the original item atlas
    maxDurability: number;
    stats?: Partial<CharacterStats>;
    attackRange?: number;
    magicRange?: number;
    description: string;
    descriptionKr?: string;
    rarity: ItemRarity;
    weight: number;
    baseValue: number;
    buyPrice?: number;     // gold cost to buy from shop
    sellable?: boolean;    // false for quest/bound items that cannot be sold
    requiredTier?: number; // minimum tier to equip (1-7)
    requiredLevel?: number; // original Darksaber equipment level requirement
    branch?: MasterBranch; // which branch can equip (battle/tactics/healer/magic)
    useEffect?: ItemUseEffect;
    
    // -- Sin Eater New Fields --
    itemCategory?: 'divine_weapon' | 'normal_weapon' | 'armor' | 'accessory' | 'consumable' | 'material' | 'rune' | 'gem';
    maxSockets?: number;
    socketTypes?: SocketInsertKind[];
    socketEffects?: Partial<Record<SocketHostKind, Partial<CharacterStats>>>;
}

export type RawItemDef = Omit<ItemDef, 'rarity' | 'weight' | 'baseValue'> & Partial<Pick<ItemDef, 'rarity' | 'weight' | 'baseValue'>>;

function inferRarity(item: RawItemDef): ItemRarity {
    if (item.rarity) return item.rarity;
    if (item.itemCategory === 'divine_weapon') return 'legend';
    if (item.id === 'heal_ring' || item.id === 'void_crystal') return 'legend';
    if (item.id === 'corrupted_blade' || item.id === 'shadow_cloak') return 'epic';
    const price = item.buyPrice ?? 0;
    const statTotal = item.slot === 'consumable'
        ? 0
        : Object.values(item.stats ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
    if (price >= 5000 || statTotal >= 40) return 'legend';
    if (price >= 1000 || statTotal >= 25) return 'epic';
    if (price >= 300 || statTotal >= 12) return 'rare';
    if (price >= 50 || statTotal >= 5) return 'uncommon';
    return 'common';
}

function inferWeight(item: RawItemDef): number {
    if (item.weight !== undefined) return item.weight;
    const cells = item.gridW * item.gridH;
    switch (item.slot) {
        case 'weapon': return Number((cells * 0.75).toFixed(1));
        case 'shield': return Number((cells * 0.65).toFixed(1));
        case 'body': return Number((cells * 0.9).toFixed(1));
        case 'head':
        case 'boots': return Number((cells * 0.45).toFixed(1));
        case 'accessory':
        case 'accessory2':
        case 'rune':
        case 'gem': return 0.1;
        case 'consumable': return Number(Math.max(0.1, cells * 0.2).toFixed(1));
        default: return Number(Math.max(0.1, cells * 0.3).toFixed(1));
    }
}

function inferBaseValue(item: RawItemDef): number {
    if (item.baseValue !== undefined) return item.baseValue;
    if (item.buyPrice !== undefined) return item.buyPrice;
    const statTotal = Object.values(item.stats ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
    const rarityMult: Record<ItemRarity, number> = {
        common: 1,
        uncommon: 2,
        rare: 4,
        epic: 8,
        legend: 18,
        unique: 30,
    };
    const rarity = inferRarity(item);
    return Math.max(10, Math.round((item.gridW * item.gridH * 20 + statTotal * 18) * rarityMult[rarity]));
}

export function normalizeItemDef(item: RawItemDef): ItemDef {
    const rarity = inferRarity(item);
    const maxSockets = item.maxSockets ?? inferMaxSockets(item, rarity);
    return {
        ...item,
        rarity,
        weight: inferWeight(item),
        baseValue: inferBaseValue(item),
        ...(maxSockets !== undefined ? { maxSockets } : {}),
        ...(maxSockets ? { socketTypes: item.socketTypes ?? ['rune', 'gem'] } : {}),
    };
}

function inferMaxSockets(item: RawItemDef, rarity: ItemRarity): number | undefined {
    if (!isSocketableHostSlot(item.slot)) return undefined;
    if (rarity === 'common' || rarity === 'uncommon') return 1;
    if (rarity === 'rare') return 2;
    return 3;
}

function isSocketableHostSlot(slot: ItemSlot): boolean {
    return slot === 'weapon' || slot === 'shield' || slot === 'head' || slot === 'body' || slot === 'boots';
}

export function isCombatRecoveryConsumable(item: ItemDef): boolean {
    if (item.slot !== 'consumable' || item.useEffect?.type !== 'recover') return false;
    return Number(item.useEffect.hp ?? 0) > 0 || Number(item.useEffect.mp ?? 0) > 0;
}

export function getCombatRecovery(item: ItemDef): { hp: number; mp: number } {
    if (!isCombatRecoveryConsumable(item)) return { hp: 0, mp: 0 };
    return {
        hp: Math.max(0, Math.floor(item.useEffect?.hp ?? 0)),
        mp: Math.max(0, Math.floor(item.useEffect?.mp ?? 0)),
    };
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

function generateBranchArmor(): RawItemDef[] {
    const items: RawItemDef[] = [];
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
                    itemCategory: 'armor',
                });
            }
        }
    }
    return items;
}

/** All generated branch armor */
const BRANCH_ARMOR: RawItemDef[] = generateBranchArmor();

const RUNE_ORDER = [
    ['el', 'El', '엘'],
    ['eld', 'Eld', '엘드'],
    ['tir', 'Tir', '티르'],
    ['nef', 'Nef', '네프'],
    ['eth', 'Eth', '에드'],
    ['ith', 'Ith', '아이드'],
    ['tal', 'Tal', '탈'],
    ['ral', 'Ral', '랄'],
    ['ort', 'Ort', '오르트'],
    ['thul', 'Thul', '주울'],
    ['amn', 'Amn', '앰'],
    ['sol', 'Sol', '솔'],
    ['shael', 'Shael', '샤엘'],
    ['dol', 'Dol', '돌'],
    ['hel', 'Hel', '헬'],
    ['io', 'Io', '이오'],
    ['lum', 'Lum', '룸'],
    ['ko', 'Ko', '코'],
    ['fal', 'Fal', '팔'],
    ['lem', 'Lem', '렘'],
    ['pul', 'Pul', '풀'],
    ['um', 'Um', '움'],
    ['mal', 'Mal', '말'],
    ['ist', 'Ist', '이스트'],
    ['gul', 'Gul', '굴'],
    ['vex', 'Vex', '벡스'],
    ['ohm', 'Ohm', '오움'],
    ['lo', 'Lo', '로'],
    ['sur', 'Sur', '수르'],
    ['ber', 'Ber', '베르'],
    ['jah', 'Jah', '자'],
    ['cham', 'Cham', '참'],
    ['zod', 'Zod', '조드'],
] as const;

export const RUNE_ITEM_IDS = RUNE_ORDER.map(([id]) => `rune_${id}`);

function runeRarity(rank: number): ItemRarity {
    if (rank <= 6) return 'common';
    if (rank <= 12) return 'uncommon';
    if (rank <= 18) return 'rare';
    if (rank <= 24) return 'epic';
    if (rank <= 30) return 'legend';
    return 'unique';
}

function runeEffects(rank: number): Partial<Record<SocketHostKind, Partial<CharacterStats>>> {
    const power = Math.min(6, Math.ceil(rank / 6));
    switch ((rank - 1) % 7) {
        case 0:
            return {
                weapon: { atk: power + 1 },
                armor: { def: power },
                shield: { def: power + 1 },
            };
        case 1:
            return {
                weapon: { hitRate: power * 2 },
                armor: { maxHp: power * 6 },
                shield: { hitRate: power * 2 },
            };
        case 2:
            return {
                weapon: { critRate: power },
                armor: { evasion: power },
                shield: { evasion: power },
            };
        case 3:
            return {
                weapon: { magAtk: power + 1 },
                armor: { magDef: power },
                shield: { magDef: power + 1 },
            };
        case 4:
            return {
                weapon: { atkMod: power },
                armor: { defMod: power },
                shield: { defMod: power + 1 },
            };
        case 5:
            return {
                weapon: { magHit: power * 2 },
                armor: { maxMp: power * 4 },
                shield: { magEva: power },
            };
        default:
            return {
                weapon: { spd: Math.ceil(power / 2) },
                armor: { actionLimit: Math.ceil(power / 2) },
                shield: { cmdRange: power >= 4 ? 1 : 0 },
            };
    }
}

function generateRunes(): RawItemDef[] {
    return RUNE_ORDER.map(([id, name, nameKr], index) => {
        const rank = index + 1;
        return {
            id: `rune_${id}`,
            name: `${name} Rune`,
            nameKr: `${nameKr} 룬`,
            slot: 'rune',
            gridW: 1,
            gridH: 1,
            color: rank <= 12 ? '#d6b36a' : rank <= 24 ? '#e0d0ff' : '#ffcf6b',
            icon: 'ᚱ',
            maxDurability: 1,
            description: `Socket rune ${rank}/33. Effects change by weapon, armor, or shield.`,
            descriptionKr: `장비 부위에 따라 다른 효과를 주는 ${rank}번 룬입니다.`,
            rarity: runeRarity(rank),
            weight: 0.1,
            baseValue: 40 + rank * 18,
            sellable: true,
            itemCategory: 'rune',
            socketEffects: runeEffects(rank),
        };
    });
}

interface GemTierInfo {
    id: 'chipped' | 'flawed' | 'normal' | 'flawless' | 'perfect';
    name: string;
    nameKr: string;
    power: number;
    rarity: ItemRarity;
    baseValue: number;
    buyPrice?: number;
}

interface GemTypeInfo {
    id: 'amethyst' | 'diamond' | 'emerald' | 'ruby' | 'sapphire' | 'skull' | 'topaz';
    name: string;
    nameKr: string;
    color: string;
    icon: string;
    effects: (power: number) => Partial<Record<SocketHostKind, Partial<CharacterStats>>>;
}

const GEM_TIERS: GemTierInfo[] = [
    { id: 'chipped', name: 'Chipped', nameKr: '최하급', power: 1, rarity: 'common', baseValue: 25, buyPrice: 45 },
    { id: 'flawed', name: 'Flawed', nameKr: '하급', power: 2, rarity: 'uncommon', baseValue: 60 },
    { id: 'normal', name: 'Normal', nameKr: '일반', power: 3, rarity: 'rare', baseValue: 120 },
    { id: 'flawless', name: 'Flawless', nameKr: '상급', power: 4, rarity: 'epic', baseValue: 240 },
    { id: 'perfect', name: 'Perfect', nameKr: '최상급', power: 5, rarity: 'legend', baseValue: 480 },
];

const GEM_TYPES: GemTypeInfo[] = [
    {
        id: 'amethyst',
        name: 'Amethyst',
        nameKr: '자수정',
        color: '#a66cff',
        icon: '◆',
        effects: (p) => ({
            weapon: { atkMod: p },
            armor: { actionLimit: p <= 2 ? 1 : p <= 4 ? 2 : 3 },
            shield: { defMod: p },
        }),
    },
    {
        id: 'diamond',
        name: 'Diamond',
        nameKr: '다이아몬드',
        color: '#dff7ff',
        icon: '◇',
        effects: (p) => ({
            weapon: { atk: p, magAtk: p },
            armor: { magDef: p + 1 },
            shield: { def: p, magDef: p },
        }),
    },
    {
        id: 'emerald',
        name: 'Emerald',
        nameKr: '에메랄드',
        color: '#35d07f',
        icon: '◆',
        effects: (p) => ({
            weapon: { hitRate: p * 2 },
            armor: { evasion: p },
            shield: { magEva: p },
        }),
    },
    {
        id: 'ruby',
        name: 'Ruby',
        nameKr: '루비',
        color: '#e3425a',
        icon: '◆',
        effects: (p) => ({
            weapon: { atk: p },
            armor: { maxHp: p * 8 },
            shield: { def: p },
        }),
    },
    {
        id: 'sapphire',
        name: 'Sapphire',
        nameKr: '사파이어',
        color: '#3a7cff',
        icon: '◆',
        effects: (p) => ({
            weapon: { magAtk: p },
            armor: { maxMp: p * 4 },
            shield: { magDef: p },
        }),
    },
    {
        id: 'skull',
        name: 'Skull',
        nameKr: '해골',
        color: '#d8d0c8',
        icon: '☠',
        effects: (p) => ({
            weapon: { atk: Math.ceil(p / 2), magAtk: Math.ceil(p / 2) },
            armor: { maxHp: p * 4, maxMp: p * 2 },
            shield: { evasion: Math.ceil(p / 2), magEva: Math.ceil(p / 2) },
        }),
    },
    {
        id: 'topaz',
        name: 'Topaz',
        nameKr: '토파즈',
        color: '#f0c050',
        icon: '◆',
        effects: (p) => ({
            weapon: { critRate: p },
            armor: { spd: p <= 2 ? 1 : p <= 4 ? 2 : 3 },
            shield: { hitRate: p * 2 },
        }),
    },
];

export const GEM_ITEM_IDS = GEM_TIERS.flatMap((tier) => GEM_TYPES.map((gem) => `gem_${tier.id}_${gem.id}`));
export const CHIPPED_GEM_IDS = GEM_TYPES.map((gem) => `gem_chipped_${gem.id}`);

function generateGems(): RawItemDef[] {
    return GEM_TIERS.flatMap((tier) => GEM_TYPES.map((gem) => ({
        id: `gem_${tier.id}_${gem.id}`,
        name: `${tier.name} ${gem.name}`,
        nameKr: `${tier.nameKr} ${gem.nameKr}`,
        slot: 'gem' as const,
        gridW: 1,
        gridH: 1,
        color: gem.color,
        icon: gem.icon,
        maxDurability: 1,
        description: `${tier.name} ${gem.name}. Socket into weapons, armor, or shields for a small flat bonus.`,
        descriptionKr: `${tier.nameKr} ${gem.nameKr}. 무기/방어구/방패에 장착하면 낮은 고정 보너스를 줍니다.`,
        rarity: tier.rarity,
        weight: 0.1,
        baseValue: tier.baseValue,
        ...(tier.buyPrice !== undefined ? { buyPrice: tier.buyPrice } : {}),
        sellable: true,
        itemCategory: 'gem' as const,
        socketEffects: gem.effects(tier.power),
    })));
}

const SOCKET_INSERTS: RawItemDef[] = [
    ...generateRunes(),
    ...generateGems(),
];

/** Item database — starting items */
const RAW_ITEMS: RawItemDef[] = [
    // ─── Divine Weapon ─────────────────────
    {
        id: 'absolution_edge', name: 'Absolution Edge', nameKr: '속죄의 검',
        slot: 'weapon', gridW: 1, gridH: 3, color: '#ffd700', icon: '✨',
        maxDurability: 9999,
        stats: { atk: 25, magAtk: 25 },
        description: 'A divine blade that absorbs the sins of the fallen. A unique 3-socket weapon.',
        descriptionKr: '타락한 자들의 죄악을 흡수하는 신성한 검입니다. 3소켓 고유 무기입니다.',
        itemCategory: 'divine_weapon',
        maxSockets: 3,
        socketTypes: ['rune', 'gem']
    },

    // ─── Normal Weapons ─────────────────────
    {
        id: 'short_sword', name: 'Short Sword', nameKr: '단검',
        slot: 'weapon', gridW: 1, gridH: 3, color: '#8899aa', icon: '🗡️',
        maxDurability: 100,
        stats: { atk: 8 },
        description: 'A basic iron short sword.',
        descriptionKr: '기본적인 철제 단검입니다.',
        itemCategory: 'normal_weapon',
        maxSockets: 1,
        socketTypes: ['rune', 'gem']
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
        id: 'herb_cheap', name: 'Cheap Herb', nameKr: '싸구려 약초',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#8fbc8f', icon: '🌿',
        iconSprite: { col: 83, row: 0 },
        maxDurability: 1,
        stats: { hp: 50 },
        useEffect: { type: 'recover', hp: 50 },
        description: 'A cheap, common herb. Restores 50 HP.',
        descriptionKr: '어디서나 쉽게 구할 수 있는 싸구려 약초. HP 50 회복.',
        buyPrice: 10
    },
    {
        id: 'orig_story_0300_heal_potion', name: 'Heal Potion', nameKr: '힐포션',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#dc5f5f', icon: '+',
        iconSprite: { col: 82, row: 0 },
        maxDurability: 1,
        stats: { hp: 50 },
        useEffect: { type: 'recover', hp: 50 },
        description: 'Original Darksaber Heal Potion reward. Preserves GETITEM 300, magic 3001, and original price 500.',
        descriptionKr: '원작 다크세이버 힐포션 보상. GETITEM 300, 발동마법 3001, 원작 가격 500을 보존합니다.',
        rarity: 'uncommon',
        weight: 0.2,
        baseValue: 50,
        buyPrice: 50,
        itemCategory: 'consumable'
    },
    {
        id: 'herb_common', name: 'Common Herb', nameKr: '흔한 약초',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#3cb371', icon: '🌿',
        iconSprite: { col: 84, row: 0 },
        maxDurability: 1,
        stats: { hp: 150 },
        useEffect: { type: 'recover', hp: 150 },
        description: 'A commonly found herb. Restores 150 HP.',
        descriptionKr: '그럭저럭 쓸만한 흔한 약초. HP 150 회복.',
        buyPrice: 50
    },
    {
        id: 'herb_rare', name: 'Precious Herb', nameKr: '귀한 약초',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#2e8b57', icon: '🍀',
        iconSprite: { col: 85, row: 0 },
        maxDurability: 1,
        stats: { hp: 500 },
        useEffect: { type: 'recover', hp: 500 },
        description: 'A precious herb with strong healing properties. Restores 500 HP.',
        descriptionKr: '치유 효과가 뛰어난 귀한 약초. HP 500 회복.',
        buyPrice: 200
    },
    {
        id: 'herb_legendary', name: 'Legendary Herb', nameKr: '희귀한 약초',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#006400', icon: '🍀',
        iconSprite: { col: 86, row: 0 },
        maxDurability: 1,
        stats: { hp: 999 },
        useEffect: { type: 'recover', hp: 999 },
        description: 'An extremely rare herb. Restores 999 HP. ...supposedly rare.',
        descriptionKr: '매우 희귀하다고 적혀있으나 실상은 지극히 흔한 약초. HP 999 회복.',
        buyPrice: 500
    },
    {
        id: 'mp_potion', name: 'MP Potion', nameKr: 'MP 포션',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#4488ff', icon: '🧪',
        iconSprite: { col: 82, row: 0 },
        maxDurability: 1,
        stats: { mp: 30 },
        useEffect: { type: 'recover', mp: 30 },
        description: 'Restores 30 MP.',
        descriptionKr: '마나를 30 회복합니다.',
        buyPrice: 25
    },
    {
        id: 'orig_story_0305_magic_potion', name: 'Magic Potion', nameKr: '매직포션',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#4488ff', icon: 'M',
        iconSprite: { col: 87, row: 0 },
        maxDurability: 1,
        stats: { mp: 30 },
        useEffect: { type: 'recover', mp: 30 },
        description: 'Original Darksaber Magic Potion reward. Preserves GETITEM 305, magic 3201, and original price 10000.',
        descriptionKr: '원작 다크세이버 매직포션 보상. GETITEM 305, 발동마법 3201, 원작 가격 10000을 보존합니다.',
        rarity: 'uncommon',
        weight: 0.2,
        baseValue: 100,
        itemCategory: 'consumable'
    },
    {
        id: 'repair_kit', name: 'Repair Kit', nameKr: '수리 키트',
        slot: 'consumable', gridW: 1, gridH: 2, color: '#ffaa00', icon: '🔧',
        maxDurability: 5,
        description: 'Repairs equipped weapon durability.',
        descriptionKr: '착용한 무기의 내구도를 수리합니다.',
        buyPrice: 50
    },
    {
        id: 'antidote', name: 'Antidote', nameKr: '해독제',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#7bdc65', icon: '⚗',
        maxDurability: 1,
        description: 'Neutralizes common poison. V1 shop consumable.',
        descriptionKr: '일반 독을 중화하는 소모품. V1 상점 후보입니다.',
        buyPrice: 35
    },
    {
        id: 'fire_herb', name: 'Fire Herb', nameKr: '화염초',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#d95f3f', icon: '🔥',
        maxDurability: 1,
        description: 'A hot medicinal herb used by desert traders.',
        descriptionKr: '사막 상인들이 다루는 뜨거운 약초입니다.',
        buyPrice: 70
    },
    {
        id: 'ice_herb', name: 'Ice Herb', nameKr: '빙결초',
        slot: 'consumable', gridW: 1, gridH: 1, color: '#72bde8', icon: '❄',
        maxDurability: 1,
        description: 'A chilled medicinal herb valued in hot regions.',
        descriptionKr: '더운 지역에서 귀하게 여기는 차가운 약초입니다.',
        buyPrice: 70
    },

    // ─── Trade Goods (town economy V1) ──────
    {
        id: 'trade_forest_resin', name: 'Forest Resin', nameKr: '숲 수지',
        slot: 'material', gridW: 1, gridH: 1, color: '#6f9f4a', icon: '◆',
        maxDurability: 1,
        description: 'A Belfuers forest trade good.',
        descriptionKr: '벨퓌어스 숲에서 싸게 구할 수 있는 특산품입니다.',
        buyPrice: 80,
        itemCategory: 'material'
    },
    {
        id: 'trade_mooncap_mushroom', name: 'Mooncap Mushroom', nameKr: '월광 버섯',
        slot: 'material', gridW: 1, gridH: 1, color: '#8fcf7a', icon: '◇',
        maxDurability: 1,
        description: 'A rare forest mushroom used in tonics.',
        descriptionKr: '강장제에 쓰이는 숲 특산 버섯입니다.',
        buyPrice: 120,
        itemCategory: 'material'
    },
    {
        id: 'trade_sea_salt', name: 'Sicilio Sea Salt', nameKr: '시시리오 바다소금',
        slot: 'material', gridW: 1, gridH: 1, color: '#d8eef0', icon: '□',
        maxDurability: 1,
        description: 'A coast town trade good.',
        descriptionKr: '시시리오 항구에서 나는 해양 특산품입니다.',
        buyPrice: 70,
        itemCategory: 'material'
    },
    {
        id: 'trade_tide_pearl', name: 'Tide Pearl', nameKr: '조수 진주',
        slot: 'material', gridW: 1, gridH: 1, color: '#f0e4d8', icon: '○',
        maxDurability: 1,
        description: 'A small pearl popular with inland nobles.',
        descriptionKr: '내륙 귀족들이 찾는 작은 진주입니다.',
        buyPrice: 160,
        itemCategory: 'material'
    },
    {
        id: 'trade_desert_spice', name: 'Desert Spice', nameKr: '사막 향신료',
        slot: 'material', gridW: 1, gridH: 1, color: '#d4a24a', icon: '✦',
        maxDurability: 1,
        description: 'A fragrant desert outpost trade good.',
        descriptionKr: '사막 전초기지의 향이 강한 특산품입니다.',
        buyPrice: 90,
        itemCategory: 'material'
    },
    {
        id: 'trade_sun_ore', name: 'Sun Ore', nameKr: '태양석 원광',
        slot: 'material', gridW: 1, gridH: 1, color: '#e0b84a', icon: '◆',
        maxDurability: 1,
        description: 'A bright ore gathered near desert routes.',
        descriptionKr: '사막 교역로 근처에서 나는 밝은 원광입니다.',
        buyPrice: 140,
        itemCategory: 'material'
    },
    {
        id: 'trade_imported_silk', name: 'Imported Silk', nameKr: '수입 비단',
        slot: 'material', gridW: 1, gridH: 1, color: '#c77ce0', icon: '▣',
        maxDurability: 1,
        description: 'An Arikna import favored by wealthy towns.',
        descriptionKr: '아리크나에서 들여오는 고급 수입품입니다.',
        buyPrice: 180,
        itemCategory: 'material'
    },
    {
        id: 'trade_eastern_incense', name: 'Eastern Incense', nameKr: '동방 향',
        slot: 'material', gridW: 1, gridH: 1, color: '#b8794f', icon: '✧',
        maxDurability: 1,
        description: 'A fragrant import traded through Arikna.',
        descriptionKr: '아리크나 교역망을 통해 들어오는 향입니다.',
        buyPrice: 130,
        itemCategory: 'material'
    },
    {
        id: 'trade_contraband_relic', name: 'Contraband Relic', nameKr: '밀수 유물',
        slot: 'material', gridW: 1, gridH: 1, color: '#684a7e', icon: '◇',
        maxDurability: 1,
        description: 'A black-market relic from the southern hideout.',
        descriptionKr: '남부 은신처 암시장에서 유통되는 비정규 유물입니다.',
        buyPrice: 220,
        itemCategory: 'material'
    },
    {
        id: 'trade_shadow_amber', name: 'Shadow Amber', nameKr: '그림자 호박',
        slot: 'material', gridW: 1, gridH: 1, color: '#805d36', icon: '◆',
        maxDurability: 1,
        description: 'A dubious amber valued by collectors.',
        descriptionKr: '수집가들이 은밀히 찾는 수상한 호박석입니다.',
        buyPrice: 150,
        itemCategory: 'material'
    },
    {
        id: 'trade_sanctum_incense', name: 'Sanctum Incense', nameKr: '성역 향',
        slot: 'material', gridW: 1, gridH: 1, color: '#d8c780', icon: '✧',
        maxDurability: 1,
        description: 'A master sanctum ceremonial good.',
        descriptionKr: '마스터 성역 의식에 쓰이는 고급 특산품입니다.',
        buyPrice: 260,
        itemCategory: 'material'
    },
    {
        id: 'trade_astral_sigil', name: 'Astral Sigil', nameKr: '성좌 표식',
        slot: 'material', gridW: 1, gridH: 1, color: '#8aa8f0', icon: '✦',
        maxDurability: 1,
        description: 'A keepsake from Astral Keep.',
        descriptionKr: '성좌 요새에서 제작되는 표식입니다.',
        buyPrice: 300,
        itemCategory: 'material'
    },
    {
        id: 'trade_ember_core', name: 'Ember Core', nameKr: '홍염 핵',
        slot: 'material', gridW: 1, gridH: 1, color: '#e8663e', icon: '◆',
        maxDurability: 1,
        description: 'A hot trade core from Ember Citadel.',
        descriptionKr: '홍염 성채에서 다루는 뜨거운 교역품입니다.',
        buyPrice: 320,
        itemCategory: 'material'
    },

    // ─── Quest Items ──────
    {
        id: 'quest_bomb', name: 'Bomb', nameKr: '폭탄',
        slot: 'material', gridW: 1, gridH: 1, color: '#c05032', icon: '●',
        maxDurability: 1,
        description: 'A story item recovered after clearing the Burgos Castle quest.',
        descriptionKr: '부르고스성 퀘스트 클리어 후 획득하는 스토리 아이템입니다.',
        rarity: 'unique',
        weight: 0.4,
        baseValue: 1,
        sellable: false,
        itemCategory: 'material'
    },
    {
        id: 'quest_burgos_key', name: 'Burgos Key', nameKr: '부르고스성 열쇠',
        slot: 'material', gridW: 1, gridH: 1, color: '#d0aa55', icon: '⚿',
        maxDurability: 1,
        description: 'A story key received from a Burgos Castle survivor.',
        descriptionKr: '부르고스성 생존자에게 받은 스토리 열쇠입니다.',
        rarity: 'unique',
        weight: 0.1,
        baseValue: 1,
        sellable: false,
        itemCategory: 'material'
    },
    {
        id: 'quest_cain_necklace', name: "Cain's Necklace", nameKr: '케인의 목걸이',
        slot: 'material', gridW: 1, gridH: 1, color: '#b7c8e8', icon: '◇',
        maxDurability: 1,
        description: "A keepsake entrusted by Cain's son in Burgos Castle.",
        descriptionKr: '부르고스성에서 케인의 아들이 맡긴 유품입니다.',
        rarity: 'unique',
        weight: 0.1,
        baseValue: 1,
        sellable: false,
        itemCategory: 'material'
    },
    {
        id: 'quest_sacred_sword', name: 'Sacred Sword', nameKr: '보검',
        slot: 'weapon', gridW: 1, gridH: 3, color: '#f0c050', icon: '*',
        maxDurability: 1,
        stats: { atk: 12, magAtk: 4, hitRate: 8 },
        description: 'A class-free sacred blade recovered after clearing Etna Volcano. Its durability does not decrease.',
        descriptionKr: '에트나 화산 클리어 후 획득하는 직업 제한 없는 보검. 내구도가 소모되지 않습니다.',
        rarity: 'unique',
        weight: 1.2,
        baseValue: 1,
        sellable: false,
        itemCategory: 'divine_weapon'
    },
    {
        id: 'orig_story_0315_stone_snake', name: 'Stone Snake', nameKr: '스톤 스네이크',
        slot: 'material', gridW: 1, gridH: 1, color: '#8a8f98', icon: '◇',
        maxDurability: 1,
        description: 'Original Darksaber scenario reward. Preserves GETITEM 315.',
        descriptionKr: '원작 다크세이버 시나리오 보상. GETITEM 315를 보존합니다.',
        rarity: 'unique',
        weight: 0.2,
        baseValue: 1,
        sellable: false,
        itemCategory: 'material'
    },
    {
        id: 'orig_story_0008_star_knife', name: 'Star Knife', nameKr: '스타 나이프',
        slot: 'weapon', gridW: 1, gridH: 3, color: '#b7c8ff', icon: '*',
        maxDurability: 100,
        stats: { atk: 8, hitRate: 5 },
        description: 'Original Darksaber episode 13 chest reward. Preserves GETITEM 008.',
        descriptionKr: '원작 다크세이버 13화 상자 보상. GETITEM 008을 보존합니다.',
        rarity: 'unique',
        weight: 0.8,
        baseValue: 1,
        sellable: false,
        itemCategory: 'normal_weapon',
        maxSockets: 1,
        socketTypes: ['rune', 'gem']
    },
    {
        id: 'orig_story_0397_yellow_flower', name: 'Yellow Flower', nameKr: '노란 꽃',
        slot: 'material', gridW: 1, gridH: 1, color: '#e0c34a', icon: '*',
        maxDurability: 1,
        description: 'Original Darksaber scenario reward. Preserves GETITEM 397.',
        descriptionKr: '원작 다크세이버 시나리오 보상. GETITEM 397을 보존합니다.',
        rarity: 'unique',
        weight: 0.1,
        baseValue: 1,
        sellable: false,
        itemCategory: 'material'
    },
    {
        id: 'orig_ep19_shard_0386', name: 'North Mystic Shard', nameKr: '북쪽 신비 조각',
        slot: 'material', gridW: 1, gridH: 1, color: '#8fc8ff', icon: '◇',
        maxDurability: 1,
        description: 'Original Darksaber episode 19 shard reward. Preserves GETITEM 386.',
        descriptionKr: '원작 다크세이버 19화 조각 보상. GETITEM 386을 보존합니다.',
        rarity: 'unique',
        weight: 0.1,
        baseValue: 1,
        sellable: false,
        itemCategory: 'material'
    },
    {
        id: 'orig_ep19_shard_0387', name: 'South Mystic Shard', nameKr: '남쪽 신비 조각',
        slot: 'material', gridW: 1, gridH: 1, color: '#8fc8ff', icon: '◇',
        maxDurability: 1,
        description: 'Original Darksaber episode 19 shard reward. Preserves GETITEM 387.',
        descriptionKr: '원작 다크세이버 19화 조각 보상. GETITEM 387을 보존합니다.',
        rarity: 'unique',
        weight: 0.1,
        baseValue: 1,
        sellable: false,
        itemCategory: 'material'
    },
    {
        id: 'orig_ep19_shard_0388', name: 'West Mystic Shard', nameKr: '서쪽 신비 조각',
        slot: 'material', gridW: 1, gridH: 1, color: '#8fc8ff', icon: '◇',
        maxDurability: 1,
        description: 'Original Darksaber episode 19 shard reward. Preserves GETITEM 388.',
        descriptionKr: '원작 다크세이버 19화 조각 보상. GETITEM 388을 보존합니다.',
        rarity: 'unique',
        weight: 0.1,
        baseValue: 1,
        sellable: false,
        itemCategory: 'material'
    },
    {
        id: 'orig_ep19_shard_0389', name: 'East Mystic Shard', nameKr: '동쪽 신비 조각',
        slot: 'material', gridW: 1, gridH: 1, color: '#8fc8ff', icon: '◇',
        maxDurability: 1,
        description: 'Original Darksaber episode 19 shard reward. Preserves GETITEM 389.',
        descriptionKr: '원작 다크세이버 19화 조각 보상. GETITEM 389을 보존합니다.',
        rarity: 'unique',
        weight: 0.1,
        baseValue: 1,
        sellable: false,
        itemCategory: 'material'
    },
    {
        id: 'orig_story_0203_resist_fire_ring', name: 'Resist Fire Ring', nameKr: '레지스트파이어링',
        slot: 'accessory', gridW: 1, gridH: 1, color: '#d95f3f', icon: '◇',
        iconSprite: { col: 61, row: 0 },
        maxDurability: 250,
        description: 'Original Darksaber accessory reward. Preserves GETITEM 203 and original price 60000.',
        descriptionKr: '원작 다크세이버 장신구 보상. GETITEM 203과 원작 가격 60000을 보존합니다. 착용시 불에 대한 내성이 생긴다.',
        rarity: 'unique',
        weight: 0.1,
        baseValue: 60000,
        itemCategory: 'accessory'
    },
    {
        id: 'orig_story_0204_resist_thunder_ring', name: 'Resist Thunder Ring', nameKr: '레지스트썬더링',
        slot: 'accessory', gridW: 1, gridH: 1, color: '#d8c24a', icon: '◇',
        iconSprite: { col: 62, row: 0 },
        maxDurability: 250,
        description: 'Original Darksaber accessory reward. Preserves GETITEM 204 and original price 60000.',
        descriptionKr: '원작 다크세이버 장신구 보상. GETITEM 204와 원작 가격 60000을 보존합니다. 착용시 전격에 대한 내성이 생긴다.',
        rarity: 'unique',
        weight: 0.1,
        baseValue: 60000,
        itemCategory: 'accessory'
    },
    {
        id: 'orig_story_0207_illusion_ring', name: 'Illusion Ring', nameKr: '일루젼 링',
        slot: 'accessory', gridW: 1, gridH: 1, color: '#b7c8ff', icon: '◇',
        iconSprite: { col: 65, row: 0 },
        maxDurability: 250,
        stats: { evasion: 5 },
        description: 'Original Darksaber accessory reward. Preserves GETITEM 207 and original price 5000.',
        descriptionKr: '원작 다크세이버 장신구 보상. GETITEM 207과 원작 가격 5000을 보존합니다. 적에게 환상을 보여 적의 공격을 피하는 확률을 높이는 효과를 가진다.',
        rarity: 'unique',
        weight: 0.1,
        baseValue: 5000,
        itemCategory: 'accessory'
    },
    {
        id: 'orig_story_0208_necklace', name: 'Necklace', nameKr: '네크리스',
        slot: 'accessory', gridW: 1, gridH: 1, color: '#9bc4ff', icon: '◇',
        iconSprite: { col: 66, row: 0 },
        maxDurability: 250,
        stats: { magDef: 5 },
        description: 'Original Darksaber accessory reward. Preserves GETITEM 208 and original price 5000.',
        descriptionKr: '원작 다크세이버 장신구 보상. GETITEM 208과 원작 가격 5000을 보존합니다. 착용시 마법공격력을 약간 높여주는 목걸이.',
        rarity: 'unique',
        weight: 0.1,
        baseValue: 5000,
        itemCategory: 'accessory'
    },
    {
        id: 'orig_story_0005_assassin_knife', name: 'Assassin Knife', nameKr: '어새신 나이프',
        slot: 'weapon', gridW: 1, gridH: 3, color: '#b8a48c', icon: '🗡️',
        iconSprite: { col: 5, row: 0 },
        maxDurability: 300,
        stats: { atk: 45 },
        attackRange: 1,
        description: 'Original Darksaber weapon reward. Preserves GETITEM 005 and original price 11500.',
        descriptionKr: '원작 다크세이버 무기 보상. GETITEM 005와 원작 가격 11500을 보존합니다. 암살자용 칼 가볍고 얇다.',
        rarity: 'unique',
        weight: 2.3,
        baseValue: 11500,
        requiredLevel: 0,
        itemCategory: 'normal_weapon',
        maxSockets: 3,
        socketTypes: ['rune', 'gem']
    },
    {
        id: 'orig_story_0261_hermes_shoes', name: 'Hermes Shoes', nameKr: '엘메스의 구두',
        slot: 'boots', gridW: 2, gridH: 2, color: '#7f8c8d', icon: '🥾',
        iconSprite: { col: 80, row: 0 },
        maxDurability: 300,
        stats: { def: -4 },
        magicRange: -4,
        description: 'Original Darksaber boots reward. Preserves GETITEM 261 and original price 26000.',
        descriptionKr: '원작 다크세이버 장화 보상. GETITEM 261과 원작 가격 26000을 보존합니다. 이동력의 극대화를 꾀해 방어력에 문제가 있음.',
        rarity: 'unique',
        weight: 1.8,
        baseValue: 26000,
        requiredLevel: 16,
        itemCategory: 'armor',
        maxSockets: 3,
        socketTypes: ['rune', 'gem']
    },
    {
        id: 'orig_story_0619_dragon_killer6', name: 'Dragon Killer 6', nameKr: '드래곤 킬러6',
        slot: 'weapon', gridW: 1, gridH: 3, color: '#b8a48c', icon: '🗡️',
        iconSprite: { col: 78, row: 1 },
        maxDurability: 3200,
        stats: { atk: 100, hitRate: 10 },
        attackRange: 1,
        description: 'Original Darksaber weapon reward. Preserves GETITEM 619 and original price 800000.',
        descriptionKr: '원작 다크세이버 무기 보상. GETITEM 619와 원작 가격 800000을 보존합니다. 드래곤의 뼈로 만들어진 검, 두꺼운 드래곤의 피부를 뚫을 수 있는 검이다.',
        rarity: 'unique',
        weight: 2.3,
        baseValue: 800000,
        requiredLevel: 76,
        itemCategory: 'normal_weapon',
        maxSockets: 3,
        socketTypes: ['rune', 'gem']
    },

    // ─── Socket Inserts (Diablo II-style runes and gems) ──────
    ...SOCKET_INSERTS,

    // ─── Original Darksaber town weapon shops ──────
    ...ORIGINAL_SHOP_ITEMS,

    // ─── Original Darksaber late-story GETITEM rewards ──────
    ...ORIGINAL_LATE_STORY_REWARD_ITEMS,

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
        description: 'The legendary Heal Ring. Restores 10% HP on every action. The most broken item in Sin Eater history.',
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
        description: 'A cursed blade dripping with dark energy. Dropped by Destroyer Kaiger.',
        descriptionKr: '어둠의 에너지가 흐르는 저주받은 검입니다. 디스트로어 카이거가 드랍합니다.'
    },
    {
        id: 'shadow_cloak', name: 'Shadow Cloak', nameKr: '그림자 망토',
        slot: 'body', gridW: 2, gridH: 3, color: '#2a0845', icon: '🧥',
        maxDurability: 180,
        stats: { def: 18, magDef: 12 },
        description: 'A cloak woven from shadows. Dropped by Fire Demon Veramode.',
        descriptionKr: '그림자로 짠 망토입니다. 불의 마신 베라모드가 드랍합니다.'
    },
    {
        id: 'void_crystal', name: 'Void Crystal', nameKr: '공허의 수정',
        slot: 'accessory', gridW: 1, gridH: 1, color: '#6600cc', icon: '💎',
        maxDurability: 999,
        stats: { magAtk: 15, mp: 30 },
        description: 'A crystal pulsing with void energy. Dropped by Mephisto.',
        descriptionKr: '공허의 에너지가 맥동하는 수정입니다. 메피스토가 드랍합니다.'
    },
];

export const ITEMS: ItemDef[] = RAW_ITEMS.map(normalizeItemDef);

/** Lookup item by ID */
export function getItemDef(id: string): ItemDef | undefined {
    return ITEMS.find(item => item.id === id);
}

/** Get all armor for a specific branch and tier */
export function getArmorForBranchTier(branch: MasterBranch, tier: number): ItemDef[] {
    return ITEMS.filter(item => item.branch === branch && item.requiredTier === tier);
}

/** Get all armor equippable by a branch up to a certain tier */
export function getEquippableArmor(branch: MasterBranch, maxTier: number): ItemDef[] {
    return ITEMS.filter(item => item.branch === branch && (item.requiredTier || 1) <= maxTier);
}
