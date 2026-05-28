import type { Skill } from '../data/SkillDB';
import type { CharacterStats } from '../data/Stats';

export type StatusKind =
    | 'guard'
    | 'counterReady'
    | 'poison'
    | 'regen'
    | 'slow'
    | 'silence'
    | 'immobilize'
    | 'blind'
    | 'attackDown'
    | 'defenseDown'
    | 'resistDown'
    | 'attackUp'
    | 'defenseUp'
    | 'speedUp'
    | 'resistUp'
    | 'allUp'
    | 'maxHpUp'
    | 'maxMpUp'
    | 'critUp'
    | 'evasionUp'
    | 'hitDown'
    | 'damageTakenDown'
    | 'injury';

export type StatusActivation = 'immediate' | 'on_raid_start';
export type StatusSourceType = 'skill' | 'rest' | 'injury';

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
    counterReady: { icon: '↩', durationTurns: 1, magnitude: 0.75, charges: 1 },
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
    const before = getEffectiveStats(carrier.stats, carrier.statuses);
    carrier.statuses = applyStatus(carrier.statuses, next);
    adjustCurrentResources(carrier.stats, before, getEffectiveStats(carrier.stats, carrier.statuses));
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

    const before = getEffectiveStats(carrier.stats, current);
    carrier.statuses = current.filter((status) => !predicate(status));
    adjustCurrentResources(carrier.stats, before, getEffectiveStats(carrier.stats, carrier.statuses));
    return removed;
}

export function removeRestStatusesFromCarrier(carrier: StatusCarrier): StatusEffect[] {
    return removeStatusesFromCarrier(carrier, (status) => status.sourceType === 'rest');
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
    const damageTakenMultiplier = (statuses ?? [])
        .filter((status) => status.kind === 'damageTakenDown')
        .reduce((multiplier, status) => multiplier * status.magnitude, 1);

    if (!guard) {
        return {
            damage: scaleIncomingDamage(damage, damageTakenMultiplier),
            statuses: statuses ?? [],
            guarded: false,
        };
    }

    const consumed = consumeStatus(statuses, 'guard');
    return {
        damage: scaleIncomingDamage(damage, guard.magnitude * damageTakenMultiplier),
        statuses: consumed.statuses,
        guarded: true,
    };
}

export function resolveTurnStartStatuses(stats: CharacterStats, statuses: StatusEffect[] | undefined): TurnStartStatusResult {
    let hpDelta = 0;
    let poisonDamage = 0;
    let regenHealing = 0;
    const expiredReaction = hasStatus(statuses, 'guard') || hasStatus(statuses, 'counterReady');
    const nextStatuses: StatusEffect[] = [];

    for (const status of statuses ?? []) {
        if (status.kind === 'guard' || status.kind === 'counterReady') continue;

        if (status.kind === 'poison') {
            poisonDamage += Math.max(1, Math.floor(stats.maxHp * status.magnitude));
        } else if (status.kind === 'regen') {
            regenHealing += Math.max(1, Math.floor(stats.maxHp * status.magnitude));
        }

        if (status.durationTurns === undefined) {
            nextStatuses.push(status);
            continue;
        }

        const durationTurns = status.durationTurns - 1;
        if (durationTurns > 0) nextStatuses.push({ ...status, durationTurns });
    }

    hpDelta = regenHealing - poisonDamage;
    return { statuses: nextStatuses, hpDelta, poisonDamage, regenHealing, expiredReaction };
}

export function cleanseNegativeStatuses(statuses: StatusEffect[] | undefined): StatusEffect[] {
    return (statuses ?? []).filter((status) => !NEGATIVE_STATUSES.has(status.kind));
}

export function getStatusIcons(statuses: StatusEffect[] | undefined): string[] {
    return (statuses ?? []).map((status) => status.icon);
}

export function getEffectiveStatsForCharacter(character: StatusCarrier): CharacterStats {
    return getEffectiveStats(character.stats, character.statuses);
}

export function getEffectiveStatsForEnemy(enemy: StatusCarrier): CharacterStats {
    return getEffectiveStats(enemy.stats, enemy.statuses);
}

export function getEffectiveStats(stats: CharacterStats, statuses: StatusEffect[] | undefined = []): CharacterStats {
    const effective = { ...stats };

    for (const status of statuses) {
        switch (status.kind) {
            case 'slow':
                effective.spd = Math.max(1, Math.floor(effective.spd * status.magnitude));
                break;
            case 'immobilize':
                effective.mov = 0;
                break;
            case 'blind':
                effective.hitRate = Math.max(1, Math.floor(effective.hitRate * status.magnitude));
                break;
            case 'attackDown':
                effective.atk = Math.max(1, Math.floor(effective.atk * status.magnitude));
                break;
            case 'defenseDown':
                effective.def = Math.max(0, Math.floor(effective.def * status.magnitude));
                break;
            case 'resistDown':
                effective.magDef = Math.max(0, Math.floor(effective.magDef * status.magnitude));
                break;
            case 'attackUp':
                effective.atk = Math.max(1, Math.floor(effective.atk * status.magnitude));
                break;
            case 'defenseUp':
                effective.def = Math.max(0, Math.floor(effective.def * status.magnitude));
                break;
            case 'speedUp':
                effective.spd = Math.max(1, Math.floor(effective.spd * status.magnitude));
                break;
            case 'resistUp':
                effective.magDef = Math.max(0, Math.floor(effective.magDef * status.magnitude));
                break;
            case 'allUp':
                effective.atk = Math.max(1, Math.floor(effective.atk * status.magnitude));
                effective.def = Math.max(0, Math.floor(effective.def * status.magnitude));
                effective.spd = Math.max(1, Math.floor(effective.spd * status.magnitude));
                effective.magDef = Math.max(0, Math.floor(effective.magDef * status.magnitude));
                break;
            case 'maxHpUp':
                effective.maxHp = Math.max(1, Math.floor(effective.maxHp * status.magnitude));
                break;
            case 'maxMpUp':
                effective.maxMp = Math.max(0, Math.floor(effective.maxMp * status.magnitude));
                break;
            case 'critUp':
                effective.critRate = Math.max(0, effective.critRate + status.magnitude);
                break;
            case 'evasionUp':
                effective.evasion = Math.max(0, effective.evasion + status.magnitude);
                break;
            case 'hitDown':
                effective.hitRate = Math.max(1, effective.hitRate - status.magnitude);
                break;
            case 'damageTakenDown':
                break;
            case 'injury':
                effective.maxHp = Math.max(1, Math.floor(effective.maxHp * status.magnitude));
                break;
        }
    }

    return effective;
}

export function getStatusEffectsForSkill(skill: Skill): StatusEffect[] {
    switch (skill.id) {
        case 'og_poison':
            return [
                createStatus('poison', { sourceSkillId: skill.id }),
                createStatus('attackDown', { sourceSkillId: skill.id }),
            ];
        case 'og_slow':
            return [createStatus('slow', { sourceSkillId: skill.id })];
        case 'og_demove':
            return [createStatus('immobilize', { sourceSkillId: skill.id })];
        case 'og_deattack':
            return [createStatus('attackDown', { sourceSkillId: skill.id })];
        case 'og_mute':
            return [createStatus('silence', { sourceSkillId: skill.id })];
        case 'og_antiresist':
            return [createStatus('resistDown', { sourceSkillId: skill.id })];
    }

    if (skill.type !== 'buff') return [];

    const durationTurns = skill.buffDuration ?? 3;
    switch (skill.buffStat) {
        case 'atk':
            return [createStatus('attackUp', { icon: skill.icon, durationTurns, magnitude: skill.power, sourceSkillId: skill.id })];
        case 'def':
            return [createStatus('defenseUp', { icon: skill.icon, durationTurns, magnitude: skill.power, sourceSkillId: skill.id })];
        case 'spd':
            return [createStatus('speedUp', { icon: skill.icon, durationTurns, magnitude: skill.power, sourceSkillId: skill.id })];
        case 'mdef':
            return [createStatus('resistUp', { icon: skill.icon, durationTurns, magnitude: skill.power, sourceSkillId: skill.id })];
        case 'regen':
            return [createStatus('regen', { icon: skill.icon, durationTurns, sourceSkillId: skill.id })];
        case 'all':
            return [createStatus('allUp', { icon: skill.icon, durationTurns, magnitude: skill.power, sourceSkillId: skill.id })];
        default:
            return [createStatus('allUp', { icon: skill.icon, durationTurns, magnitude: skill.power, sourceSkillId: skill.id })];
    }
}

function chooseStrongerMagnitude(kind: StatusKind, current: number, next: number): number {
    if (LOWER_IS_STRONGER.has(kind)) return Math.min(current, next);
    return Math.max(current, next);
}

function isSameStatusSlot(current: StatusEffect, next: StatusEffect): boolean {
    if (current.kind !== next.kind) return false;
    if (current.kind === 'injury' || next.kind === 'injury') return true;
    if (current.sourceType === 'rest' || next.sourceType === 'rest') {
        return current.sourceType === next.sourceType && current.sourceRestMenuId === next.sourceRestMenuId;
    }
    return true;
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

function scaleIncomingDamage(damage: number, multiplier: number): number {
    if (damage <= 0) return 0;
    return Math.max(1, Math.floor(damage * multiplier));
}
