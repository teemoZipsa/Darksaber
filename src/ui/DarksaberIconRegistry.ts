import type { StatusKind } from '../combat/StatusEffects';
import type { Skill } from '../data/SkillDB';
import type { ActionType } from './ActionMenuUI';
import type { IconCell } from './DarksaberSpriteAtlas';

const cell = (col: number, row: number): IconCell => ({ col, row });

export const ACTION_ICON_CELLS: Partial<Record<ActionType, IconCell>> = {
    attack: cell(1, 0),
    magic: cell(13, 1),
    defend: cell(2, 2),
    move: cell(15, 1),
    open: cell(19, 1),
    tool: cell(3, 0),
};

export const STATUS_KIND_ICON_CELLS: Record<StatusKind, IconCell> = {
    guard: cell(2, 2),
    counterReady: cell(8, 2),
    poison: cell(17, 2),
    regen: cell(8, 0),
    slow: cell(9, 3),
    silence: cell(4, 3),
    immobilize: cell(2, 3),
    blind: cell(19, 1),
    attackDown: cell(2, 3),
    defenseDown: cell(16, 3),
    resistDown: cell(10, 1),
    attackUp: cell(1, 0),
    defenseUp: cell(2, 2),
    speedUp: cell(15, 1),
    resistUp: cell(9, 2),
    allUp: cell(7, 0),
    maxHpUp: cell(18, 2),
    maxMpUp: cell(3, 1),
    critUp: cell(11, 2),
    evasionUp: cell(9, 3),
    hitDown: cell(19, 1),
    damageTakenDown: cell(9, 2),
    injury: cell(11, 3),
};

const STATUS_ICON_TO_KIND: Record<string, StatusKind> = {
    '\u{1f6e1}\ufe0f': 'guard',
    '\u{1f6e1}': 'guard',
    '\u21a9': 'counterReady',
    '\u2620\ufe0f': 'poison',
    '\u2620': 'poison',
    '\u{1f340}': 'regen',
    '\u{1f40c}': 'slow',
    '\u{1f507}': 'silence',
    '\u{1f6ab}': 'immobilize',
    '\u{1f3af}': 'blind',
    '\u2b07\ufe0f': 'attackDown',
    '\u2b07': 'attackDown',
    '\u{1f9e8}': 'defenseDown',
    '\u{1f494}': 'resistDown',
    '\u2694\ufe0f': 'attackUp',
    '\u2694': 'attackUp',
    '\u{1f4a8}': 'speedUp',
    '\u{1f530}': 'resistUp',
    '\u2728': 'allUp',
    '\u2665': 'maxHpUp',
    '\u25c6': 'maxMpUp',
    '\u2726': 'critUp',
    '\u25c7': 'evasionUp',
    '\u25bd': 'hitDown',
    '\u25a3': 'damageTakenDown',
    '\u271a': 'injury',
};

export function getStatusIconCell(source: StatusKind | string | undefined): IconCell | null {
    if (!source) return null;
    if (Object.prototype.hasOwnProperty.call(STATUS_KIND_ICON_CELLS, source)) {
        return STATUS_KIND_ICON_CELLS[source as StatusKind];
    }
    const kind = STATUS_ICON_TO_KIND[source];
    return kind ? STATUS_KIND_ICON_CELLS[kind] : null;
}

export function getSkillIconCell(skill: Pick<Skill, 'element' | 'type' | 'buffStat'>): IconCell | null {
    if (skill.type === 'heal') return cell(11, 3);

    if (skill.type === 'buff') {
        switch (skill.buffStat) {
            case 'atk': return cell(1, 0);
            case 'def': return cell(2, 2);
            case 'spd': return cell(15, 1);
            case 'mdef': return cell(13, 1);
            case 'regen': return cell(18, 2);
            case 'all': return cell(7, 0);
            default: return cell(7, 0);
        }
    }

    if (skill.type === 'debuff') {
        switch (skill.element) {
            case 'ice': return cell(9, 3);
            case 'lightning': return cell(4, 1);
            case 'dark': return cell(17, 2);
            case 'wind': return cell(7, 1);
            default: return cell(10, 1);
        }
    }

    switch (skill.element) {
        case 'fire': return skill.type === 'aoe' ? cell(14, 2) : cell(0, 1);
        case 'ice': return cell(2, 1);
        case 'lightning': return cell(4, 1);
        case 'holy': return cell(11, 3);
        case 'dark': return cell(10, 1);
        case 'earth': return cell(8, 1);
        case 'wind': return skill.type === 'aoe' ? cell(7, 1) : cell(6, 1);
        case 'physical': return cell(1, 0);
        case 'none': return null;
        default: return null;
    }
}
