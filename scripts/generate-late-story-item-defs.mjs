// Generate the late-story reward item ledger from the original Dark Saver item table.
//
// Usage: node scripts/generate-late-story-item-defs.mjs [SET_DIR]
// SET_DIR defaults to the extracted gameres `set` folder used by decode-original-atr.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const DEFAULT_SET = 'C:/Users/Seonkyu/Documents/Codex/2026-06-03/c-users-seonkyu-downloads-saver200010-extracted/outputs/gameres_unpacked/set';
const SET_DIR = process.argv[2] ?? DEFAULT_SET;

const ITEMS_PATH = join(REPO, 'src', 'data', 'content', 'original-late-story-items.json');
const FACTS_PATH = join(REPO, 'src', 'data', 'content', 'original-late-story-facts.json');
const ITEMTBL_PATH = join(SET_DIR, 'itemtbl.atr');

const decoder = new TextDecoder('euc-kr');

const CLASS_LABELS = ['보병', '비병', '기병', '수병', '창병', '궁병', '승려', '신관', '마교', '사교'];
const SLOT_BY_TYPE = new Map([
    [1, 'weapon'],
    [2, 'weapon'],
    [3, 'body'],
    [4, 'boots'],
    [5, 'head'],
    [6, 'accessory'],
    [8, 'shield'],
    [9, 'material'],
]);
const GRID_BY_SLOT = {
    weapon: [1, 3],
    shield: [2, 2],
    head: [2, 2],
    body: [2, 3],
    boots: [2, 2],
    accessory: [1, 1],
    material: [1, 1],
};
const COLOR_BY_SLOT = {
    weapon: '#b8a48c',
    shield: '#8fa8b8',
    head: '#7f8c8d',
    body: '#7f8c8d',
    boots: '#7f8c8d',
    accessory: '#c4a265',
    material: '#f0c050',
};

function cleanText(value) {
    return value.replaceAll('_', ' ');
}

function iconFor(row, slot) {
    if (slot === 'shield') return '🛡️';
    if (slot === 'head') return '⛑️';
    if (slot === 'body') return '🦺';
    if (slot === 'boots') return '🥾';
    if (slot === 'accessory') return '💍';
    if (slot === 'material') return '*';
    if (row.slotType === 1 || row.attackRange >= 6) return '🏹';
    if (row.attackRange === 2 || row.usableClassFlags[4]) return '🔱';
    if (row.magAtk > 0 || row.magDef > 0) return '🪄';
    return '🗡️';
}

function itemCategoryFor(slot) {
    if (slot === 'weapon') return 'normal_weapon';
    if (slot === 'accessory') return 'accessory';
    if (slot === 'material') return 'material';
    return 'armor';
}

function decodeItemRows() {
    const rows = new Map();
    const text = decoder.decode(readFileSync(ITEMTBL_PATH));
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';')) continue;
        const tokens = trimmed.split(/\s+/);
        if (!/^\d+$/.test(tokens[0] ?? '')) continue;
        const n = (index) => Number(tokens[index] ?? 0) || 0;
        const iconCode = n(1);
        const usableClassFlags = tokens.slice(6, 16).map((value) => Number(value) || 0);
        rows.set(n(0), {
            originalItemId: n(0),
            iconSprite: { col: iconCode % 100, row: Math.floor(iconCode / 100) },
            slotType: n(3),
            requiredLevel: n(4),
            maxDurability: n(5),
            usableClassFlags,
            originalPrice: n(16),
            originalMagicId: n(17),
            move: n(19),
            atk: n(20),
            def: n(21),
            attackRange: n(22),
            magAtk: n(23),
            magDef: n(24),
            magicRange: n(25),
            commandRange: n(26),
            hitRate: n(28),
            evasion: n(29),
            nameKr: cleanText(tokens[42] ?? ''),
            descriptionKr: cleanText(tokens.slice(43).join(' ')),
        });
    }
    return rows;
}

function buildStats(row) {
    return {
        ...(row.atk ? { atk: row.atk } : {}),
        ...(row.def ? { def: row.def } : {}),
        ...(row.magAtk ? { magAtk: row.magAtk } : {}),
        ...(row.magDef ? { magDef: row.magDef } : {}),
        ...(row.move ? { mov: row.move } : {}),
        ...(row.commandRange ? { cmdRange: row.commandRange } : {}),
        ...(row.hitRate ? { hitRate: row.hitRate } : {}),
        ...(row.evasion ? { evasion: row.evasion } : {}),
    };
}

function buildUsableClasses(row) {
    return row.usableClassFlags
        .map((flag, index) => flag ? CLASS_LABELS[index] : null)
        .filter(Boolean)
        .join(', ');
}

function enrichItem(item, row) {
    const slot = item.rewardKind === 'mark' ? 'material' : (SLOT_BY_TYPE.get(row.slotType) ?? 'material');
    const [gridW, gridH] = GRID_BY_SLOT[slot];
    return {
        originalItemId: item.originalItemId,
        currentItemId: `orig_late_${String(item.originalItemId).padStart(4, '0')}`,
        rewardKind: item.rewardKind,
        originalNameKr: row.nameKr,
        originalDescriptionKr: row.descriptionKr,
        slot,
        gridW,
        gridH,
        color: COLOR_BY_SLOT[slot],
        icon: iconFor(row, slot),
        iconSprite: row.iconSprite,
        maxDurability: row.maxDurability,
        requiredLevel: row.requiredLevel,
        originalMagicId: row.originalMagicId,
        originalPrice: row.originalPrice,
        usableClasses: buildUsableClasses(row),
        stats: buildStats(row),
        ...(row.attackRange ? { attackRange: row.attackRange } : {}),
        ...(row.magicRange ? { magicRange: row.magicRange } : {}),
        sourceEvents: item.sourceEvents,
    };
}

function main() {
    if (!existsSync(ITEMTBL_PATH)) {
        console.error(`itemtbl.atr not found: ${ITEMTBL_PATH}`);
        process.exit(1);
    }

    const originalItems = JSON.parse(readFileSync(ITEMS_PATH, 'utf8')).items;
    const itemRows = decodeItemRows();
    const enrichedItems = originalItems.map((item) => {
        const row = itemRows.get(item.originalItemId);
        if (!row) throw new Error(`Missing itemtbl row for original item ${item.originalItemId}`);
        return enrichItem(item, row);
    });
    writeFileSync(ITEMS_PATH, `${JSON.stringify({ items: enrichedItems }, null, 2)}\n`);

    let factsText = readFileSync(FACTS_PATH, 'utf8');
    for (const item of enrichedItems) {
        const pattern = new RegExp(`("originalItemId": ${item.originalItemId}, "currentItemId": ")[^"]+(")`, 'g');
        factsText = factsText.replace(pattern, `$1${item.currentItemId}$2`);
    }
    writeFileSync(FACTS_PATH, factsText.endsWith('\n') ? factsText : `${factsText}\n`);
    console.log(`wrote ${enrichedItems.length} late-story reward item records`);
}

main();
