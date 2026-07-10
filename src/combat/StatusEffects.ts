import type { Skill } from '../data/SkillDB';
import type { CharacterStats } from '../data/Stats';
import type { ItemSlot } from '../data/ItemDB';
import type { PlacedItem } from '../inventory/GridInventory';
import { applyEquipmentStatBonuses } from '../inventory/Socketing';

export const STATUS_KINDS = [
    'guard',
    'counterReady',
    'resting',
    'poison',
    'regen',
    'slow',
    'silence',
    'immobilize',
    'blind',
    'attackDown',
    'defenseDown',
    'resistDown',
    'attackUp',
    'defenseUp',
    'speedUp',
    'resistUp',
    'allUp',
    'maxHpUp',
    'maxMpUp',
    'critUp',
    'evasionUp',
    'hitDown',
    'damageTakenDown',
    'injury',
] as const;

export type StatusKind = typeof STATUS_KINDS[number];

export type StatusActivation = 'immediate' | 'on_raid_start';
export type StatusSourceType = 'skill' | 'rest' | 'injury' | 'action';

export interface StatusEffect {
    kind: StatusKind;
    icon: string;
    durationTurns?: number;
    durationSeconds?: number;
    remainingSeconds?: number;
    magnitude: number;
    activation?: StatusActivation;
    sourceType?: StatusSourceType;
    charges?: number;
    sourceSkillId?: string;
    sourceRestMenuId?: string;
}

export interface StatusCarrier {
    stats: CharacterStats;
    statuses?: StatusEffect[];
    equipment?: Map<ItemSlot, PlacedItem>;
}

export interface TurnStartStatusResult {
    statuses: StatusEffect[];
    hpDelta: number;
    poisonDamage: number;
    regenHealing: number;
    expiredReaction: boolean;
}

export interface GuardDamageResult {
    damage: number;
    statuses: StatusEffect[];
    guarded: boolean;
}

const DEFAULT_STATUS: Record<StatusKind, Omit<StatusEffect, 'kind'>> = {
    guard: { icon: '🛡️', durationTurns: 1, magnitude: 0.5, charges: 1 },
    counterReady: { icon: '↩', durationTurns: 1, magnitude: 0.5, charges: 1 },
    resting: { icon: 'Zz', magnitude: 1 },
    poison: { icon: '☠️', durationTurns: 3, magnitude: 0.08 },
    regen: { icon: '🍀', durationTurns: 5, magnitude: 0.1 },
    slow: { icon: '🐌', durationTurns: 3, magnitude: 0.6 },
    silence: { icon: '🔇', durationTurns: 3, magnitude: 1 },
    immobilize: { icon: '🚫', durationTurns: 3, magnitude: 0 },
    blind: { icon: '🎯', durationTurns: 3, magnitude: 0.7 },
    attackDown: { icon: '⬇️', durationTurns: 3, magnitude: 0.7 },
    defenseDown: { icon: '🧨', durationTurns: 3, magnitude: 0.7 },
    resistDown: { icon: '💔', durationTurns: 3, magnitude: 0.5 },
    attackUp: { icon: '⚔️', durationTurns: 3, magnitude: 1.2 },
    defenseUp: { icon: '🛡️', durationTurns: 3, magnitude: 1.2 },
    speedUp: { icon: '💨', durationTurns: 3, magnitude: 1.3 },
    resistUp: { icon: '🔰', durationTurns: 3, magnitude: 1.3 },
    allUp: { icon: '✨', durationTurns: 3, magnitude: 1.2 },
    maxHpUp: { icon: '♥', magnitude: 1.1 },
    maxMpUp: { icon: '◆', magnitude: 1.1 },
    critUp: { icon: '✦', magnitude: 10 },
    evasionUp: { icon: '◇', magnitude: 10 },
    hitDown: { icon: '▽', magnitude: 5 },
    damageTakenDown: { icon: '▣', magnitude: 0.9 },
    injury: { icon: '✚', magnitude: 0.9, sourceType: 'injury' },
};

const LOWER_IS_STRONGER = new Set<StatusKind>([
    'guard',
    'slow',
    'blind',
    'attackDown',
    'defenseDown',
    'resistDown',
    'damageTakenDown',
    'injury',
]);

const REACTION_STATUSES = new Set<StatusKind>([
    'guard',
    'counterReady',
]);

const ACTION_STANCE_STATUSES = new Set<StatusKind>([
    'guard',
    'counterReady',
    'resting',
]);

const NEGATIVE_STATUSES = new Set<StatusKind>([
    'poison',
    'slow',
    'silence',
    'immobilize',
    'blind',
    'attackDown',
    'defenseDown',
    'resistDown',
]);

const STATUS_DISPLAY_PRIORITY: Partial<Record<StatusKind, number>> = {
    guard: 0,
    resting: 1,
    counterReady: 2,
    poison: 10,
    injury: 11,
    immobilize: 12,
    silence: 13,
    slow: 14,
    blind: 15,
};

export function createStatus(kind: StatusKind, overrides: Partial<Omit<StatusEffect, 'kind'>> = {}): StatusEffect {
    const status: StatusEffect = {
        kind,
        activation: 'immediate',
        sourceType: 'skill',
        ...DEFAULT_STATUS[kind],
        ...overrides,
    };
    if (status.activation === 'on_raid_start') {
        delete status.durationTurns;
    }
    return status;
}

export function getStatus(statuses: StatusEffect[] | undefined, kind: StatusKind): StatusEffect | undefined {
    return statuses?.find((status) => status.kind === kind);
}

export function hasStatus(statuses: StatusEffect[] | undefined, kind: StatusKind): boolean {
    return Boolean(getStatus(statuses, kind));
}

export function applyStatus(statuses: StatusEffect[] | undefined, next: StatusEffect): StatusEffect[] {
    const current = statuses ?? [];
    const existing = current.find((status) => isSameStatusSlot(status, next));
    if (!existing) return [...current, { ...next }];

    return current.map((status) => {
        if (!isSameStatusSlot(status, next)) return status;
        return {
            ...status,
            icon: next.icon,
            magnitude: chooseStrongerMagnitude(status.kind, status.magnitude, next.magnitude),
            durationTurns: maxOptional(status.durationTurns, next.durationTurns),
            durationSeconds: maxOptional(status.durationSeconds, next.durationSeconds),
            remainingSeconds: maxOptional(status.remainingSeconds, next.remainingSeconds),
            activation: next.activation ?? status.activation,
            sourceType: next.sourceType ?? status.sourceType,
            charges: Math.max(status.charges ?? 0, next.charges ?? 0) || undefined,
            sourceSkillId: next.sourceSkillId ?? status.sourceSkillId,
            sourceRestMenuId: next.sourceRestMenuId ?? status.sourceRestMenuId,
        };
    });
}

export function applyStatuses(statuses: StatusEffect[] | undefined, nextStatuses: StatusEffect[]): StatusEffect[] {
    return nextStatuses.reduce((result, status) => applyStatus(result, status), statuses ?? []);
}

export function applyStatusToCarrier(carrier: StatusCarrier, next: StatusEffect): void {
    const before = getEffectiveStatsForCharacter(carrier);
    carrier.statuses = applyStatus(carrier.statuses, next);
    adjustCurrentResources(carrier.stats, before, getEffectiveStatsForCharacter(carrier));
}

export function applyStatusesToCarrier(carrier: StatusCarrier, nextStatuses: StatusEffect[]): void {
    for (const status of nextStatuses) applyStatusToCarrier(carrier, status);
}

export function removeStatusesFromCarrier(
    carrier: StatusCarrier,
    predicate: (status: StatusEffect) => boolean
): StatusEffect[] {
    const current = carrier.statuses ?? [];
    const removed = current.filter(predicate);
    if (removed.length === 0) return [];

    const before = getEffectiveStatsForCharacter({ ...carrier, statuses: current });
    carrier.statuses = current.filter((status) => !predicate(status));
    adjustCurrentResources(carrier.stats, before, getEffectiveStatsForCharacter(carrier));
    return removed;
}

export function removeRestStatusesFromCarrier(carrier: StatusCarrier): StatusEffect[] {
    return removeStatusesFromCarrier(carrier, (status) => status.sourceType === 'rest');
}

export function isActionStanceStatus(status: StatusEffect): boolean {
    return status.sourceType === 'action' && ACTION_STANCE_STATUSES.has(status.kind);
}

export function removeActionStanceStatusesFromCarrier(carrier: StatusCarrier): StatusEffect[] {
    return removeStatusesFromCarrier(carrier, isActionStanceStatus);
}

export function replaceActionStanceStatuses(statuses: StatusEffect[] | undefined, nextStatuses: StatusEffect[]): StatusEffect[] {
    return applyStatuses((statuses ?? []).filter((status) => !isActionStanceStatus(status)), nextStatuses);
}

export function advanceTimedStatuses(statuses: StatusEffect[] | undefined, dt: number): StatusEffect[] {
    const next: StatusEffect[] = [];
    for (const status of statuses ?? []) {
        if (status.activation !== 'on_raid_start' || status.remainingSeconds === undefined) {
            next.push(status);
            continue;
        }

        const remainingSeconds = status.remainingSeconds - dt;
        if (remainingSeconds > 0) next.push({ ...status, remainingSeconds });
    }
    return next;
}

export function consumeStatus(statuses: StatusEffect[] | undefined, kind: StatusKind): { statuses: StatusEffect[]; consumed?: StatusEffect } {
    const current = statuses ?? [];
    const consumed = current.find((status) => status.kind === kind);
    return {
        statuses: current.filter((status) => status.kind !== kind),
        consumed,
    };
}

export function applyGuardToDamage(statuses: StatusEffect[] | undefined, damage: number): GuardDamageResult {
    const guard = getStatus(statuses, 'guard');
    const damageTakenMultiplier = getBestMagnitude(statuses, 'damageTakenDown', 1);
    const reducedDamage = scaleIncomingDamage(damage, damageTakenMultiplier);

    if (reducedDamage <= 0) {
        return {
            damage: 0,
            statuses: statuses ?? [],
            guarded: false,
        };
    }

    if (!guard) {
        return {
            damage: reducedDamage,
            statuses: statuses ?? [],
            guarded: false,
        };
    }

    const consumed = consumeStatus(statuses, 'guard');
    return {
        damage: scaleIncomingDamage(reducedDamage, guard.magnitude),
        statuses: consumed.statuses,
        guarded: true,
    };
}

export function resolveTurnStartStatuses(stats: CharacterStats, statuses: StatusEffect[] | undefined): TurnStartStatusResult {
    let poisonDamage = 0;
    let regenHealing = 0;
    let poisonMagnitude: number | undefined;
    let regenMagnitude: number | undefined;
    let expiredReaction = false;
    const nextStatuses: StatusEffect[] = [];

    for (const status of statuses ?? []) {
        if (status.kind === 'guard' || status.kind === 'counterReady') {
            if (status.sourceType === 'action') {
                nextStatuses.push(status);
                continue;
            }

            if (status.durationTurns === undefined) {
                nextStatuses.push(status);
                continue;
            }

            const durationTurns = status.durationTurns - 1;
            if (durationTurns > 0) {
                nextStatuses.push({ ...status, durationTurns });
            } else {
                expiredReaction = true;
            }
            continue;
        }

        if (status.kind === 'poison') {
            poisonMagnitude = Math.max(poisonMagnitude ?? 0, status.magnitude);
        } else if (status.kind === 'regen') {
            regenMagnitude = Math.max(regenMagnitude ?? 0, status.magnitude);
        }

        if (status.durationTurns === undefined) {
            nextStatuses.push(status);
            continue;
        }

        const durationTurns = status.durationTurns - 1;
        if (durationTurns > 0) nextStatuses.push({ ...status, durationTurns });
    }

    if (poisonMagnitude !== undefined) poisonDamage = Math.max(1, Math.floor(stats.maxHp * poisonMagnitude));
    if (regenMagnitude !== undefined) regenHealing = Math.max(1, Math.floor(stats.maxHp * regenMagnitude));
    const hpDelta = regenHealing - poisonDamage;
    return { statuses: nextStatuses, hpDelta, poisonDamage, regenHealing, expiredReaction };
}

export function cleanseNegativeStatuses(statuses: StatusEffect[] | undefined): StatusEffect[] {
    return (statuses ?? []).filter((status) => !NEGATIVE_STATUSES.has(status.kind));
}

export function getStatusIcons(statuses: StatusEffect[] | undefined): string[] {
    return getDisplayStatuses(statuses).map((status) => status.icon);
}

export function getStatusKinds(statuses: StatusEffect[] | undefined): StatusKind[] {
    return getDisplayStatuses(statuses).map((status) => status.kind);
}

export function getDisplayStatuses(statuses: StatusEffect[] | undefined): StatusEffect[] {
    const current = statuses ?? [];
    const hasGuard = current.some((status) => status.kind === 'guard');
    return current.filter((status) => !(hasGuard && status.kind === 'counterReady')).sort((a, b) => {
        const aPriority = STATUS_DISPLAY_PRIORITY[a.kind] ?? 50;
        const bPriority = STATUS_DISPLAY_PRIORITY[b.kind] ?? 50;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.kind.localeCompare(b.kind);
    });
}

export function getEffectiveStatsForCharacter(character: StatusCarrier): CharacterStats {
    return getEffectiveStats(applyEquipmentStatBonuses(character.stats, character.equipment), character.statuses);
}

export function getEffectiveStatsForEnemy(enemy: StatusCarrier): CharacterStats {
    return getEffectiveStats(enemy.stats, enemy.statuses);
}

export function getEffectiveStats(stats: CharacterStats, statuses: StatusEffect[] | undefined = []): CharacterStats {
    const effective = { ...stats };
    const allUpMultiplier = getBestMagnitude(statuses, 'allUp', 1);
    const atkMultiplier = allUpMultiplier
        * getBestMagnitude(statuses, 'attackUp', 1)
        * getBestMagnitude(statuses, 'attackDown', 1);
    const defMultiplier = allUpMultiplier
        * getBestMagnitude(statuses, 'defenseUp', 1)
        * getBestMagnitude(statuses, 'defenseDown', 1);
    const magAtkMultiplier = hasStatus(statuses, 'silence')
        ? 0
        : allUpMultiplier;
    const magDefMultiplier = allUpMultiplier
        * getBestMagnitude(statuses, 'resistUp', 1)
        * getBestMagnitude(statuses, 'resistDown', 1);
    const spdMultiplier = allUpMultiplier
        * getBestMagnitude(statuses, 'speedUp', 1)
        * getBestMagnitude(statuses, 'slow', 1);
    const hitRateMultiplier = getBestMagnitude(statuses, 'blind', 1);
    const maxHpMultiplier = getBestMagnitude(statuses, 'maxHpUp', 1)
        * getBestMagnitude(statuses, 'injury', 1);
    const maxMpMultiplier = getBestMagnitude(statuses, 'maxMpUp', 1);
    const hitRatePenalty = getBestMagnitude(statuses, 'hitDown', 0);
    const critRateBonus = getBestMagnitude(statuses, 'critUp', 0);
    const evasionBonus = getBestMagnitude(statuses, 'evasionUp', 0);
    const immobilized = hasStatus(statuses, 'immobilize');

    effective.atk = Math.max(1, Math.floor(stats.atk * atkMultiplier));
    effective.def = Math.max(0, Math.floor(stats.def * defMultiplier));
    effective.magAtk = Math.max(0, Math.floor(stats.magAtk * magAtkMultiplier));
    effective.magDef = Math.max(0, Math.floor(stats.magDef * magDefMultiplier));
    effective.spd = Math.max(1, Math.floor(stats.spd * spdMultiplier));
    effective.hitRate = Math.max(1, Math.floor(stats.hitRate * hitRateMultiplier) - hitRatePenalty);
    effective.maxHp = Math.max(1, Math.floor(stats.maxHp * maxHpMultiplier));
    effective.maxMp = Math.max(0, Math.floor(stats.maxMp * maxMpMultiplier));
    effective.critRate = Math.max(0, stats.critRate + critRateBonus);
    effective.evasion = Math.max(0, stats.evasion + evasionBonus);
    if (immobilized) effective.mov = 0;

    return effective;
}

export function getStatusEffectsForSkill(skill: Skill): StatusEffect[] {
    switch (skill.id) {
        case 'nav_t2':
            return [skillStatus(skill, 'slow', { magnitude: skill.power, durationTurns: 3 })];
        case 'inf_guard_stance':
            return [
                skillStatus(skill, 'guard', { magnitude: 0.45, durationTurns: 1 }),
                skillStatus(skill, 'defenseUp', { magnitude: 1.15, durationTurns: 1 }),
            ];
        case 'inf_iron_defense':
            return [
                skillStatus(skill, 'damageTakenDown', { magnitude: 0.8, durationTurns: 2 }),
                skillStatus(skill, 'counterReady', { magnitude: 0.45, durationTurns: 2 }),
            ];
        case 'cav_mobile_stance':
            return [
                skillStatus(skill, 'speedUp', { magnitude: 1.25, durationTurns: 3 }),
                skillStatus(skill, 'evasionUp', { magnitude: 8, durationTurns: 3 }),
            ];
        case 'lan_spear_wall':
            return [skillStatus(skill, 'guard', { magnitude: 0.5, durationTurns: 1 })];
        case 'lan_intercept_order':
            return [
                skillStatus(skill, 'counterReady', { magnitude: 0.7, durationTurns: 2 }),
                skillStatus(skill, 'defenseUp', { magnitude: 1.15, durationTurns: 2 }),
            ];
        case 'cle_life_prayer':
            return [skillStatus(skill, 'regen', { magnitude: 0.08, durationTurns: 3 })];
        case 'cle_healing_bell':
            return [
                skillStatus(skill, 'regen', { magnitude: 0.12, durationTurns: 3 }),
                skillStatus(skill, 'defenseUp', { magnitude: 1.15, durationTurns: 3 }),
            ];
        case 'pri_battle_chant':
            return [
                skillStatus(skill, 'attackUp', { magnitude: 1.15, durationTurns: 3 }),
                skillStatus(skill, 'defenseUp', { magnitude: 1.15, durationTurns: 3 }),
            ];
        case 'pri_victory_prayer':
            return [
                skillStatus(skill, 'attackUp', { magnitude: 1.25, durationTurns: 2 }),
                skillStatus(skill, 'critUp', { magnitude: 10, durationTurns: 2 }),
            ];
        case 'shr_guardian_aura':
            return [
                skillStatus(skill, 'resistUp', { magnitude: 1.2, durationTurns: 3 }),
                skillStatus(skill, 'damageTakenDown', { magnitude: 0.9, durationTurns: 3 }),
            ];
        case 'shr_sanctuary_dance':
            return [
                skillStatus(skill, 'regen', { magnitude: 0.1, durationTurns: 4 }),
                skillStatus(skill, 'resistUp', { magnitude: 1.25, durationTurns: 4 }),
            ];
        case 'lan_t5':
            return [skillStatus(skill, 'defenseDown', { magnitude: 0.75, durationTurns: 3 })];
        case 'cul_t2':
            return [
                skillStatus(skill, 'attackDown', { magnitude: skill.power, durationTurns: 3 }),
                skillStatus(skill, 'defenseDown', { magnitude: skill.power, durationTurns: 3 }),
            ];
        case 'alc_t2':
            return [skillStatus(skill, 'poison', { durationTurns: 4, magnitude: 0.1 })];
        case 'og_freeze':
            return [skillStatus(skill, 'slow', { magnitude: 0.7, durationTurns: 2 })];
        case 'og_poison':
            return [
                skillStatus(skill, 'poison'),
                skillStatus(skill, 'attackDown', { magnitude: skill.power }),
            ];
        case 'og_slow':
            return [skillStatus(skill, 'slow', { magnitude: skill.power })];
        case 'og_demove':
            return [skillStatus(skill, 'immobilize')];
        case 'og_deattack':
            return [skillStatus(skill, 'attackDown', { magnitude: skill.power })];
        case 'og_mute':
            return [skillStatus(skill, 'silence')];
        case 'og_antiresist':
            return [skillStatus(skill, 'resistDown', { magnitude: skill.power })];
        case 'pri_t2':
            return [
                skillStatus(skill, 'attackUp', { magnitude: skill.power, durationTurns: skill.buffDuration ?? 3 }),
                skillStatus(skill, 'defenseUp', { magnitude: skill.power, durationTurns: skill.buffDuration ?? 3 }),
            ];
        case 'pri_t6':
            return [
                skillStatus(skill, 'defenseUp', { magnitude: 1.6, durationTurns: skill.buffDuration ?? 5 }),
                skillStatus(skill, 'resistUp', { magnitude: 1.6, durationTurns: skill.buffDuration ?? 5 }),
            ];
        case 'shr_t3':
            return [
                skillStatus(skill, 'resistUp', { magnitude: skill.power, durationTurns: skill.buffDuration ?? 3 }),
                skillStatus(skill, 'damageTakenDown', { magnitude: 0.85, durationTurns: skill.buffDuration ?? 3 }),
            ];
        case 'shr_t5':
            return [
                skillStatus(skill, 'defenseUp', { magnitude: skill.power, durationTurns: skill.buffDuration ?? 5 }),
                skillStatus(skill, 'resistUp', { magnitude: skill.power, durationTurns: skill.buffDuration ?? 5 }),
                skillStatus(skill, 'damageTakenDown', { magnitude: 0.5, durationTurns: skill.buffDuration ?? 5 }),
            ];
        case 'shr_t7':
            return [
                skillStatus(skill, 'allUp', { magnitude: 1.35, durationTurns: 5 }),
                skillStatus(skill, 'regen', { durationTurns: 5, magnitude: 0.12 }),
                skillStatus(skill, 'damageTakenDown', { magnitude: 0.75, durationTurns: 5 }),
            ];
    }

    if (skill.type !== 'buff') return [];

    const durationTurns = skill.buffDuration ?? 3;
    switch (skill.buffStat) {
        case 'atk':
            return [skillStatus(skill, 'attackUp', { durationTurns, magnitude: skill.power })];
        case 'def':
            return [skillStatus(skill, 'defenseUp', { durationTurns, magnitude: skill.power })];
        case 'spd':
            return [skillStatus(skill, 'speedUp', { durationTurns, magnitude: skill.power })];
        case 'mdef':
            return [skillStatus(skill, 'resistUp', { durationTurns, magnitude: skill.power })];
        case 'regen':
            return [skillStatus(skill, 'regen', { durationTurns })];
        case 'all':
            return [skillStatus(skill, 'allUp', { durationTurns, magnitude: skill.power })];
        default:
            return [skillStatus(skill, 'allUp', { durationTurns, magnitude: skill.power })];
    }
}

function skillStatus(
    skill: Skill,
    kind: StatusKind,
    overrides: Partial<Omit<StatusEffect, 'kind'>> = {}
): StatusEffect {
    return createStatus(kind, {
        icon: skill.icon,
        sourceSkillId: skill.id,
        ...overrides,
    });
}

function chooseStrongerMagnitude(kind: StatusKind, current: number, next: number): number {
    if (LOWER_IS_STRONGER.has(kind)) return Math.min(current, next);
    return Math.max(current, next);
}

function isSameStatusSlot(current: StatusEffect, next: StatusEffect): boolean {
    if (current.kind !== next.kind) return false;
    if (REACTION_STATUSES.has(current.kind)) return true;
    if (current.kind === 'injury' || next.kind === 'injury') return true;
    if (current.sourceType === 'rest' || next.sourceType === 'rest') {
        return current.sourceType === next.sourceType;
    }
    return current.sourceSkillId === next.sourceSkillId;
}

function maxOptional(a: number | undefined, b: number | undefined): number | undefined {
    if (a === undefined) return b;
    if (b === undefined) return a;
    return Math.max(a, b);
}

function adjustCurrentResources(stats: CharacterStats, before: CharacterStats, after: CharacterStats): void {
    if (after.maxHp > before.maxHp) {
        stats.hp = Math.floor(stats.hp * (after.maxHp / Math.max(1, before.maxHp)));
    }
    if (after.maxMp > before.maxMp) {
        stats.mp = Math.floor(stats.mp * (after.maxMp / Math.max(1, before.maxMp)));
    }

    stats.hp = Math.max(0, Math.min(after.maxHp, stats.hp));
    stats.mp = Math.max(0, Math.min(after.maxMp, stats.mp));
}

function getBestMagnitude(statuses: StatusEffect[] | undefined, kind: StatusKind, fallback: number): number {
    const matches = (statuses ?? []).filter((status) => status.kind === kind);
    if (matches.length === 0) return fallback;
    return matches
        .map((status) => status.magnitude)
        .reduce((best, next) => chooseStrongerMagnitude(kind, best, next));
}

function scaleIncomingDamage(damage: number, multiplier: number): number {
    if (damage <= 0) return 0;
    return Math.max(1, Math.floor(damage * multiplier));
}
