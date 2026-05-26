import type { StatusKind } from '../combat/StatusEffects';
import type { TilePoint } from './FieldPathing';

export type EnemyRole =
    | 'bruiser'
    | 'tank'
    | 'archer'
    | 'healer'
    | 'coward'
    | 'support'
    | 'boss';

export interface EnemyAIProfile {
    role: EnemyRole;
    attackRange: number;
    preferredRange: number;
    minRange: number;
    supportRange: number;
    healThreshold: number;
    fleeHpPct: number;
    guardHpPct: number;
    assistRange: number;
}

export interface EnemyAIUnit {
    id: string;
    name: string;
    tile: TilePoint;
    hp: number;
    maxHp: number;
    role?: EnemyRole;
    isBoss?: boolean;
    isAggro?: boolean;
    statusKinds?: StatusKind[];
}

export type EnemyAIDecision =
    | { kind: 'attack'; targetId: string; range: number; reason: string }
    | { kind: 'moveToward'; targetId: string; desiredRange: number; reason: string }
    | { kind: 'moveAway'; targetId: string; reason: string }
    | { kind: 'healAlly'; allyId: string; reason: string }
    | { kind: 'buffAlly'; allyId: string; status: StatusKind; reason: string }
    | { kind: 'debuffTarget'; targetId: string; status: StatusKind; reason: string }
    | { kind: 'guard'; reason: string }
    | { kind: 'bossPattern'; targetId: string; pattern: BossPattern; reason: string }
    | { kind: 'wait'; reason: string };

export type BossPattern = 'cleave' | 'voidBolt' | 'darkPulse' | 'enrage';

export interface EnemyAIDecisionInput {
    self: EnemyAIUnit;
    targets: EnemyAIUnit[];
    allies: EnemyAIUnit[];
    profile?: EnemyAIProfile;
    turnCount?: number;
    hasLineOfSight?: (from: TilePoint, to: TilePoint) => boolean;
}

export function createEnemyAIProfile(role: EnemyRole, overrides: Partial<EnemyAIProfile> = {}): EnemyAIProfile {
    const base: Record<EnemyRole, EnemyAIProfile> = {
        bruiser: {
            role: 'bruiser',
            attackRange: 1,
            preferredRange: 1,
            minRange: 1,
            supportRange: 1,
            healThreshold: 0.65,
            fleeHpPct: 0.2,
            guardHpPct: 0.35,
            assistRange: 7,
        },
        tank: {
            role: 'tank',
            attackRange: 1,
            preferredRange: 1,
            minRange: 1,
            supportRange: 2,
            healThreshold: 0.65,
            fleeHpPct: 0.15,
            guardHpPct: 0.5,
            assistRange: 8,
        },
        archer: {
            role: 'archer',
            attackRange: 4,
            preferredRange: 3,
            minRange: 2,
            supportRange: 1,
            healThreshold: 0.65,
            fleeHpPct: 0.3,
            guardHpPct: 0.25,
            assistRange: 7,
        },
        healer: {
            role: 'healer',
            attackRange: 1,
            preferredRange: 3,
            minRange: 2,
            supportRange: 5,
            healThreshold: 0.7,
            fleeHpPct: 0.45,
            guardHpPct: 0.35,
            assistRange: 8,
        },
        coward: {
            role: 'coward',
            attackRange: 1,
            preferredRange: 5,
            minRange: 2,
            supportRange: 1,
            healThreshold: 0.65,
            fleeHpPct: 0.5,
            guardHpPct: 0.25,
            assistRange: 6,
        },
        support: {
            role: 'support',
            attackRange: 1,
            preferredRange: 3,
            minRange: 2,
            supportRange: 4,
            healThreshold: 0.65,
            fleeHpPct: 0.35,
            guardHpPct: 0.3,
            assistRange: 8,
        },
        boss: {
            role: 'boss',
            attackRange: 3,
            preferredRange: 2,
            minRange: 1,
            supportRange: 5,
            healThreshold: 0.65,
            fleeHpPct: 0,
            guardHpPct: 0.4,
            assistRange: 12,
        },
    };

    return { ...base[role], ...overrides, role };
}

export function decideEnemyAction(input: EnemyAIDecisionInput): EnemyAIDecision {
    const profile = input.profile ?? createEnemyAIProfile(input.self.role ?? 'bruiser');
    const targets = input.targets.filter((target) => target.hp > 0);
    const allies = input.allies.filter((ally) => ally.hp > 0);
    const closest = findClosest(input.self, targets);

    if (!closest) return { kind: 'wait', reason: 'no target' };

    switch (profile.role) {
        case 'tank':
            return decideTank(input, profile, closest);
        case 'archer':
            return decideArcher(input, profile, closest);
        case 'healer':
            return decideHealer(input, profile, closest, allies);
        case 'coward':
            return decideCoward(input, profile, closest);
        case 'support':
            return decideSupport(input, profile, closest, allies);
        case 'boss':
            return decideBoss(input, profile, closest);
        case 'bruiser':
        default:
            return decideBruiser(input, profile, closest);
    }
}

function decideBruiser(input: EnemyAIDecisionInput, profile: EnemyAIProfile, closest: EnemyAIUnit): EnemyAIDecision {
    if (canAttack(input, closest, profile.attackRange)) {
        return { kind: 'attack', targetId: closest.id, range: profile.attackRange, reason: 'bruiser in range' };
    }
    return { kind: 'moveToward', targetId: closest.id, desiredRange: profile.preferredRange, reason: 'bruiser chase' };
}

function decideTank(input: EnemyAIDecisionInput, profile: EnemyAIProfile, closest: EnemyAIUnit): EnemyAIDecision {
    if (hpPct(input.self) <= profile.guardHpPct && !hasStatus(input.self, 'guard')) {
        return { kind: 'guard', reason: 'tank low hp guard' };
    }
    if (canAttack(input, closest, profile.attackRange)) {
        return { kind: 'attack', targetId: closest.id, range: profile.attackRange, reason: 'tank lock target' };
    }
    return { kind: 'moveToward', targetId: closest.id, desiredRange: 1, reason: 'tank body block' };
}

function decideArcher(input: EnemyAIDecisionInput, profile: EnemyAIProfile, closest: EnemyAIUnit): EnemyAIDecision {
    const distance = manhattan(input.self.tile, closest.tile);
    if (distance < profile.minRange) {
        return { kind: 'moveAway', targetId: closest.id, reason: 'archer keep distance' };
    }
    if (canAttack(input, closest, profile.attackRange)) {
        return { kind: 'attack', targetId: closest.id, range: profile.attackRange, reason: 'archer ranged shot' };
    }
    return { kind: 'moveToward', targetId: closest.id, desiredRange: profile.preferredRange, reason: 'archer seek lane' };
}

function decideHealer(
    input: EnemyAIDecisionInput,
    profile: EnemyAIProfile,
    closest: EnemyAIUnit,
    allies: EnemyAIUnit[]
): EnemyAIDecision {
    const wounded = allies
        .filter((ally) => ally.id !== input.self.id)
        .filter((ally) => hpPct(ally) <= profile.healThreshold)
        .filter((ally) => manhattan(input.self.tile, ally.tile) <= profile.supportRange)
        .sort((a, b) => hpPct(a) - hpPct(b))[0];
    if (wounded) return { kind: 'healAlly', allyId: wounded.id, reason: 'healer save ally' };

    const distance = manhattan(input.self.tile, closest.tile);
    if (hpPct(input.self) <= profile.fleeHpPct || distance < profile.minRange) {
        return { kind: 'moveAway', targetId: closest.id, reason: 'healer avoid melee' };
    }
    if (canAttack(input, closest, profile.attackRange)) {
        return { kind: 'attack', targetId: closest.id, range: profile.attackRange, reason: 'healer fallback hit' };
    }
    return { kind: 'moveToward', targetId: closest.id, desiredRange: profile.preferredRange, reason: 'healer stay close' };
}

function decideCoward(input: EnemyAIDecisionInput, profile: EnemyAIProfile, closest: EnemyAIUnit): EnemyAIDecision {
    const distance = manhattan(input.self.tile, closest.tile);
    if (hpPct(input.self) <= profile.fleeHpPct || distance <= profile.minRange) {
        return { kind: 'moveAway', targetId: closest.id, reason: 'coward flee' };
    }
    if (canAttack(input, closest, profile.attackRange)) {
        return { kind: 'attack', targetId: closest.id, range: profile.attackRange, reason: 'coward cornered' };
    }
    return { kind: 'wait', reason: 'coward hiding' };
}

function decideSupport(
    input: EnemyAIDecisionInput,
    profile: EnemyAIProfile,
    closest: EnemyAIUnit,
    allies: EnemyAIUnit[]
): EnemyAIDecision {
    const buffTarget = allies
        .filter((ally) => manhattan(input.self.tile, ally.tile) <= profile.supportRange)
        .filter((ally) => !hasStatus(ally, 'attackUp') && !hasStatus(ally, 'defenseUp'))
        .sort((a, b) => scoreSupportTarget(b) - scoreSupportTarget(a))[0];
    if (buffTarget) {
        const status: StatusKind = buffTarget.role === 'tank' || hpPct(buffTarget) < 0.5 ? 'defenseUp' : 'attackUp';
        return { kind: 'buffAlly', allyId: buffTarget.id, status, reason: 'support buff ally' };
    }

    if (manhattan(input.self.tile, closest.tile) <= profile.supportRange && !hasStatus(closest, 'attackDown')) {
        return { kind: 'debuffTarget', targetId: closest.id, status: 'attackDown', reason: 'support weaken target' };
    }
    if (canAttack(input, closest, profile.attackRange)) {
        return { kind: 'attack', targetId: closest.id, range: profile.attackRange, reason: 'support fallback hit' };
    }
    return { kind: 'moveToward', targetId: closest.id, desiredRange: profile.preferredRange, reason: 'support reposition' };
}

function decideBoss(input: EnemyAIDecisionInput, profile: EnemyAIProfile, closest: EnemyAIUnit): EnemyAIDecision {
    const turn = input.turnCount ?? 1;
    const distance = manhattan(input.self.tile, closest.tile);
    if (hpPct(input.self) <= 0.3 && !hasStatus(input.self, 'allUp') && !hasStatus(input.self, 'attackUp')) {
        return { kind: 'bossPattern', targetId: closest.id, pattern: 'enrage', reason: 'boss low hp enrage' };
    }
    if (turn > 0 && turn % 4 === 0) {
        return { kind: 'bossPattern', targetId: closest.id, pattern: 'darkPulse', reason: 'boss pulse cycle' };
    }
    if (distance <= 1) {
        return { kind: 'bossPattern', targetId: closest.id, pattern: 'cleave', reason: 'boss melee cleave' };
    }
    if (canAttack(input, closest, profile.attackRange)) {
        return { kind: 'bossPattern', targetId: closest.id, pattern: 'voidBolt', reason: 'boss ranged pattern' };
    }
    return { kind: 'moveToward', targetId: closest.id, desiredRange: profile.preferredRange, reason: 'boss pressure' };
}

function canAttack(input: EnemyAIDecisionInput, target: EnemyAIUnit, range: number): boolean {
    if (manhattan(input.self.tile, target.tile) > range) return false;
    if (range <= 1) return true;
    return input.hasLineOfSight ? input.hasLineOfSight(input.self.tile, target.tile) : true;
}

function findClosest(self: EnemyAIUnit, units: EnemyAIUnit[]): EnemyAIUnit | null {
    let closest: EnemyAIUnit | null = null;
    let closestDistance = Infinity;
    for (const unit of units) {
        const distance = manhattan(self.tile, unit.tile);
        if (distance < closestDistance) {
            closest = unit;
            closestDistance = distance;
        }
    }
    return closest;
}

function scoreSupportTarget(unit: EnemyAIUnit): number {
    const roleScore = unit.role === 'tank' ? 4 : unit.role === 'boss' ? 5 : unit.role === 'archer' ? 3 : 2;
    return roleScore + (1 - hpPct(unit));
}

function hpPct(unit: EnemyAIUnit): number {
    return unit.hp / Math.max(1, unit.maxHp);
}

function hasStatus(unit: EnemyAIUnit, kind: StatusKind): boolean {
    return Boolean(unit.statusKinds?.includes(kind));
}

function manhattan(a: TilePoint, b: TilePoint): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
