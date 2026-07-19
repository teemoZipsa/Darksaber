import { createBaseStats, getBaseStatsForClass } from '../../src/data/Stats';
import { getClassLine } from '../../src/data/ClassTree';
import type { AuthCharacter } from '../../server/AuthStore';
import type { CharacterSave } from '../../src/shared/CharacterSave';
import type { StartingClassId } from '../../src/data/characterClasses';
import { applyRaidLabLoadout } from './loadouts';
import type { RaidLabLoadoutId, RaidLabMultiReadyId, RaidLabPartySize } from './types';
import { RAID_LAB_DEFAULT_MULTI_READY, RAID_LAB_DEFAULT_PARTY_SIZE } from './types';

export interface LabPartyMemberSpec {
    id: string;
    name: string;
    classKey: StartingClassId;
    /** True for the selected character / controllable leader. */
    isLeader: boolean;
}

export interface LabReadyActorView {
    id: string;
    localActorId: string;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    tile: { x: number; y: number };
    remainingAp: number;
    actionGauge: number;
    attackRange: number;
    mov: number;
    level: number;
    exp: number;
    isDead: boolean;
    isLeader: boolean;
}

/**
 * Build leader + companion specs for a lab expedition.
 * Companion ids are deterministic per seed/slot and never collide with the leader.
 */
export function buildLabPartySpecs(
    seed: number,
    leader: AuthCharacter,
    partySize: RaidLabPartySize,
    companionClasses: readonly StartingClassId[],
): LabPartyMemberSpec[] {
    const size = clampPartySize(partySize);
    const specs: LabPartyMemberSpec[] = [{
        id: leader.id,
        name: leader.name,
        classKey: leader.classKey as StartingClassId,
        isLeader: true,
    }];
    for (let slot = 1; slot < size; slot++) {
        const classKey = companionClasses[slot - 1] ?? 'infantry';
        specs.push({
            id: companionId(seed, slot),
            name: `LabCompanion${seed}_${slot}`,
            classKey,
            isLeader: false,
        });
    }
    return specs;
}

/** Wire roster + active party onto the save the production join path reads. */
export function applyLabPartyToSave(
    save: CharacterSave,
    leader: AuthCharacter,
    specs: readonly LabPartyMemberSpec[],
    loadout: RaidLabLoadoutId,
): void {
    const characters = specs.map((spec) => {
        const classLine = getClassLine(spec.classKey);
        const baseStats = spec.isLeader
            ? leader.baseStats
            : createBaseStats(getBaseStatsForClass(spec.classKey, classLine?.baseMovRange ?? 3));
        const equipment = spec.isLeader
            ? save.equipment
            : buildCompanionEquipment(spec.classKey, loadout);
        return {
            id: spec.id,
            name: spec.name,
            classKey: spec.classKey,
            gender: 'M',
            tier: 1,
            level: 1,
            exp: 0,
            hasEmblem: false,
            baseStats,
            magicLoadout: [] as string[],
            skillUpgradeLevels: {} as Record<string, number>,
            equipment,
            injured: false,
        };
    });
    save.rosterSnapshot = { characters };
    save.partySnapshot = {
        activeCharacterIds: characters.map((entry) => entry.id),
    };
}

export function selectReadyActor(
    ready: readonly LabReadyActorView[],
    multiReady: RaidLabMultiReadyId,
    roundRobinCursor: number,
): { actor: LabReadyActorView; nextCursor: number } | null {
    const living = ready.filter((entry) => !entry.isDead && entry.remainingAp > 0);
    if (living.length === 0) return null;

    switch (multiReady) {
        case 'leader-first': {
            const leader = living.find((entry) => entry.isLeader);
            return { actor: leader ?? living[0]!, nextCursor: roundRobinCursor };
        }
        case 'lowest-hp': {
            const sorted = [...living].sort((a, b) => {
                const ratioA = a.hp / Math.max(1, a.maxHp);
                const ratioB = b.hp / Math.max(1, b.maxHp);
                if (ratioA !== ratioB) return ratioA - ratioB;
                return a.id.localeCompare(b.id);
            });
            return { actor: sorted[0]!, nextCursor: roundRobinCursor };
        }
        case 'round-robin': {
            const ordered = [...living].sort((a, b) => a.id.localeCompare(b.id));
            const index = ((roundRobinCursor % ordered.length) + ordered.length) % ordered.length;
            return { actor: ordered[index]!, nextCursor: roundRobinCursor + 1 };
        }
        default: {
            const _exhaustive: never = multiReady;
            return _exhaustive;
        }
    }
}

export function clampPartySize(value: number): RaidLabPartySize {
    if (value >= 3) return 3;
    if (value === 2) return 2;
    return 1;
}

export function resolveDefaultPartySize(value: RaidLabPartySize | undefined): RaidLabPartySize {
    return value ?? RAID_LAB_DEFAULT_PARTY_SIZE;
}

export function resolveDefaultMultiReady(value: RaidLabMultiReadyId | undefined): RaidLabMultiReadyId {
    return value ?? RAID_LAB_DEFAULT_MULTI_READY;
}

function companionId(seed: number, slot: number): string {
    return `lab_comp_${seed}_${slot}`;
}

function buildCompanionEquipment(classKey: StartingClassId, loadout: RaidLabLoadoutId): Record<string, unknown> {
    if (loadout === 'bare') return {};
    // Reuse leader loadout rules on a throwaway save shape.
    const stub = {
        equipment: {} as CharacterSave['equipment'],
        inventory: { width: 10, height: 6, items: [] as CharacterSave['inventory']['items'] },
    } as CharacterSave;
    applyRaidLabLoadout(stub, classKey, loadout);
    return stub.equipment ?? {};
}
