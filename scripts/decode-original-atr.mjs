// Decode the original Dark Saver `.atr` data tables (EUC-KR text) into JSON.
//
// These tables are the authoritative original balance/progression data:
//   magictbl  — skill definitions (per Lv1..6 scaling)
//   levelabl  — class×level progression: exp curve, promotion chain, skill unlocks
//   ability   — per class-tier base stats + class name + tier label
//   magicatr  — element × target-class damage multiplier (%)
//   sangsung  — class × class affinity matrix
//
// Usage:  node scripts/decode-original-atr.mjs [SET_DIR]
// SET_DIR may also be supplied through DARKSABER_ORIGINAL_SET_DIR. Output → src/data/original/*.json
//
// The source `.atr` files live outside the repo; the emitted JSON is the in-repo
// artifact. Re-run this when the source tables change.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const DEFAULT_SET = process.env.DARKSABER_ORIGINAL_SET_DIR?.trim() ?? '';

const SET_DIR = process.argv[2]?.trim() || DEFAULT_SET;
if (!SET_DIR) {
    throw new Error('Original set directory is required. Set DARKSABER_ORIGINAL_SET_DIR or pass [SET_DIR].');
}
const OUT_DIR = join(REPO, 'src', 'data', 'original');

const decoder = new TextDecoder('euc-kr');
function readAtr(name) {
    return decoder.decode(readFileSync(join(SET_DIR, name)));
}

/** Split a data line into a trailing `;comment` (if any) and whitespace tokens. */
function splitLine(line) {
    const semi = line.indexOf(';');
    const comment = semi >= 0 ? line.slice(semi + 1).trim() : '';
    const body = (semi >= 0 ? line.slice(0, semi) : line).trim();
    const tokens = body.length ? body.split(/\s+/) : [];
    return { tokens, comment };
}

function dataLines(text) {
    return text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith(';'));
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

// ── magictbl: 번호 이름 속성 거리 범위 MP 시간 팀 유닛 EA EB EC TICK LVPT 패턴 iconx icony
function decodeMagicTbl() {
    return dataLines(readAtr('magictbl.atr')).map((line) => {
        const { tokens: t } = splitLine(line);
        return {
            id: num(t[0]), name: t[1] ?? '',
            element: num(t[2]), range: num(t[3]), aoe: num(t[4]), mp: num(t[5]),
            time: num(t[6]), team: num(t[7]), unit: num(t[8]),
            ea: num(t[9]), eb: num(t[10]), ec: num(t[11]),
            tick: num(t[12]), lvpt: num(t[13]), pattern: num(t[14]),
            iconX: num(t[15]), iconY: num(t[16]),
        };
    }).filter((r) => r.id > 0);
}

// ── levelabl: 직업 레벨 체력수 마력수 공격수 방어수 마공수 마방수 명중수 회피수 마렙업 포인트 담직업 섭돈수 섭경수 경험치 섭마법 사용기술
function decodeLevelAbl() {
    return dataLines(readAtr('levelabl.atr')).map((line) => {
        const { tokens: t } = splitLine(line);
        const usableSkills = (t[17] ?? '').split(',').map(num).filter((n) => n > 0);
        return {
            classId: num(t[0]), level: num(t[1]),
            growth: { hp: num(t[2]), mp: num(t[3]), atk: num(t[4]), def: num(t[5]), magAtk: num(t[6]), magDef: num(t[7]), hit: num(t[8]), eva: num(t[9]) },
            magicLvUp: num(t[10]), abilityPoints: num(t[11]),
            promoteTo: num(t[12]),
            goldGain: num(t[13]), expGain: num(t[14]), expRequired: num(t[15]),
            learnSkill: num(t[16]),
            usableSkills,
        };
    }).filter((r) => r.classId > 0);
}

// ── ability: id (+dup) <numeric stat columns...> name label
function decodeAbility() {
    return dataLines(readAtr('ability.atr')).map((line) => {
        const { tokens: t } = splitLine(line);
        if (!/^\d+$/.test(t[0] ?? '')) return null;
        const label = t[t.length - 1] ?? '';
        const name = t[t.length - 2] ?? '';
        const stats = t.slice(1, t.length - 2).map(num);
        return { classId: num(t[0]), name, label, stats };
    }).filter(Boolean);
}

// ── magicatr: elementId <11 class multipliers> ;elementName
function decodeMagicAtr() {
    const headerLine = readAtr('magicatr.atr').split(/\r?\n/)[0] ?? '';
    const classes = splitLine(headerLine).comment ? [] : headerLine.replace(/^;/, '').split(/\s+/).filter(Boolean);
    const rows = dataLines(readAtr('magicatr.atr')).map((line) => {
        const { tokens: t, comment } = splitLine(line);
        return { elementId: num(t[0]), element: comment, multipliers: t.slice(1).map(num) };
    });
    return { classes, rows };
}

// ── sangsung: classId <11 cells of "a b"> ;className   (tab-separated cells)
function decodeSangsung() {
    const lines = readAtr('sangsung.atr').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith(';999'));
    const header = lines.shift() ?? '';
    const classes = header.replace(/^;/, '').split(/\t+/).map((s) => s.trim()).filter(Boolean);
    const rows = lines.filter((l) => !l.trim().startsWith(';')).map((line) => {
        const semi = line.lastIndexOf(';');
        const className = semi >= 0 ? line.slice(semi + 1).trim() : '';
        const body = (semi >= 0 ? line.slice(0, semi) : line);
        const cells = body.split(/\t/).map((c) => c.trim()).filter((c) => c.length);
        const classId = num(cells.shift());
        const pairs = cells.map((c) => { const [a, b] = c.split(/\s+/); return [num(a), num(b)]; });
        return { classId, className, pairs };
    });
    return { classes, rows };
}

function main() {
    if (!existsSync(SET_DIR)) {
        console.error(`SET_DIR not found: ${SET_DIR}\nPass the extracted gameres 'set' folder as argv[1].`);
        process.exit(1);
    }
    mkdirSync(OUT_DIR, { recursive: true });
    const outputs = {
        'magictbl.json': decodeMagicTbl(),
        'levelabl.json': decodeLevelAbl(),
        'ability.json': decodeAbility(),
        'magicatr.json': decodeMagicAtr(),
        'sangsung.json': decodeSangsung(),
    };
    for (const [file, data] of Object.entries(outputs)) {
        writeFileSync(join(OUT_DIR, file), JSON.stringify(data, null, 2) + '\n');
        const count = Array.isArray(data) ? data.length : (data.rows?.length ?? 0);
        console.log(`wrote ${file} (${count} rows)`);
    }
}

main();
