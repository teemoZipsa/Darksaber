import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseStats } from '../../src/data/Stats';
import { createDefaultCharacterSave, type AuthCharacter } from '../../server/AuthStore';
import {
    resolveRaidLabClass,
    resolveRaidLabCompanionClasses,
    resolveRaidLabConserve,
    resolveRaidLabLoadout,
    resolveRaidLabMultiReady,
    resolveRaidLabPartySize,
    resolveRaidLabSupply,
} from '../../scripts/raid-lab/matrix';
import {
    applyLabPartyToSave,
    buildLabPartySpecs,
    selectReadyActor,
    type LabReadyActorView,
} from '../../scripts/raid-lab/party';
import { runRaidLabExpedition } from '../../scripts/raid-lab/runner';
import type { RaidLabPartySize } from '../../scripts/raid-lab/types';

/** Full sweep resolution matching the Phase 4b cohort CLI matrix. */
function runSwept(seed: number, maxActions = 1500) {
    const partySize = resolveRaidLabPartySize('sweep', seed);
    return runRaidLabExpedition({
        seed,
        policy: 'balanced',
        maxActions,
        classKey: resolveRaidLabClass('sweep', seed),
        routeMode: 'sweep',
        loadout: resolveRaidLabLoadout('sweep', seed),
        supply: resolveRaidLabSupply('sweep', seed),
        conserve: resolveRaidLabConserve('sweep', seed),
        partySize,
        multiReady: resolveRaidLabMultiReady('sweep', seed),
        companionClasses: resolveRaidLabCompanionClasses(partySize, seed),
    });
}

function labLeader(seed: number): AuthCharacter {
    return {
        id: `lab_char_${seed}`,
        accountId: `lab_account_${seed}`,
        slotNo: 0,
        name: `LabHero${seed}`,
        classKey: 'infantry',
        tier: 1,
        level: 1,
        exp: 0,
        baseStats: createBaseStats({ spd: 100, mov: 50, actionLimit: 80, hitRate: 200 }),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
    };
}

function readyView(overrides: Partial<LabReadyActorView> & Pick<LabReadyActorView, 'id' | 'localActorId'>): LabReadyActorView {
    return {
        hp: 100,
        maxHp: 100,
        mp: 50,
        maxMp: 50,
        tile: { x: 0, y: 0 },
        remainingAp: 80,
        actionGauge: 100,
        attackRange: 1,
        mov: 3,
        level: 1,
        exp: 0,
        isDead: false,
        isLeader: false,
        ...overrides,
    };
}

test('buildLabPartySpecs + applyLabPartyToSave produce partySize 1/2/3 with unique companion ids', () => {
    for (const partySize of [1, 2, 3] as const) {
        const seed = 17 + partySize;
        const leader = labLeader(seed);
        const save = createDefaultCharacterSave(leader, 'M', '2026-01-01T00:00:00.000Z');
        const companionClasses = partySize === 1
            ? []
            : partySize === 2
                ? (['cleric'] as const)
                : (['cleric', 'mage'] as const);
        const specs = buildLabPartySpecs(seed, leader, partySize, companionClasses);
        applyLabPartyToSave(save, leader, specs, 'bare');

        assert.equal(specs.length, partySize, `partySize ${partySize} specs length`);
        assert.equal(specs[0]?.id, leader.id);
        assert.equal(specs[0]?.isLeader, true);
        const activeIds = (save.partySnapshot as { activeCharacterIds: string[] }).activeCharacterIds;
        const rosterChars = (save.rosterSnapshot as { characters: unknown[] }).characters;
        assert.equal(activeIds.length, partySize);
        assert.equal(rosterChars.length, partySize);

        const ids = specs.map((entry) => entry.id);
        assert.equal(new Set(ids).size, ids.length, `partySize ${partySize} unique ids`);
        for (const companion of specs.slice(1)) {
            assert.equal(companion.isLeader, false);
            assert.notEqual(companion.id, leader.id);
            assert.match(companion.id, new RegExp(`^lab_comp_${seed}_\\d+$`));
        }
    }
});

test('buildLabPartySpecs never duplicates companion ids across slots', () => {
    const seed = 99;
    const leader = labLeader(seed);
    const specs = buildLabPartySpecs(seed, leader, 3, ['cavalry', 'mage']);
    const ids = specs.map((entry) => entry.id);
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    assert.equal(specs[1]?.id, `lab_comp_${seed}_1`);
    assert.equal(specs[2]?.id, `lab_comp_${seed}_2`);
});

test('companion class resolution always matches the requested party size', () => {
    assert.deepEqual(resolveRaidLabCompanionClasses(1, 7, ['mage']), []);
    assert.deepEqual(resolveRaidLabCompanionClasses(2, 7, ['cleric', 'mage']), ['cleric']);
    assert.deepEqual(resolveRaidLabCompanionClasses(3, 7, ['cleric']), ['cleric', 'cavalry']);
});

test('selectReadyActor prefers leader, lowest-hp, then round-robin', () => {
    const views: LabReadyActorView[] = [
        readyView({ id: 'a', localActorId: 'a', isLeader: true, hp: 80, maxHp: 100 }),
        readyView({ id: 'b', localActorId: 'b', hp: 20, maxHp: 100 }),
        readyView({ id: 'c', localActorId: 'c', hp: 40, maxHp: 100 }),
    ];

    const leaderFirst = selectReadyActor(views, 'leader-first', 0);
    assert.equal(leaderFirst?.actor.id, 'a');
    assert.equal(leaderFirst?.nextCursor, 0);

    const lowestHp = selectReadyActor(views, 'lowest-hp', 0);
    assert.equal(lowestHp?.actor.id, 'b');
    assert.equal(lowestHp?.nextCursor, 0);

    const first = selectReadyActor(views, 'round-robin', 0);
    const second = selectReadyActor(views, 'round-robin', first!.nextCursor);
    const third = selectReadyActor(views, 'round-robin', second!.nextCursor);
    assert.equal(first?.actor.id, 'a');
    assert.equal(second?.actor.id, 'b');
    assert.equal(third?.actor.id, 'c');
    assert.equal(third?.nextCursor, 3);
});

test('selectReadyActor skips dead and zero-AP actors', () => {
    const views: LabReadyActorView[] = [
        readyView({ id: 'leader', localActorId: 'leader', isLeader: true, remainingAp: 0 }),
        readyView({ id: 'down', localActorId: 'down', isDead: true, hp: 0 }),
        readyView({ id: 'ready', localActorId: 'ready', hp: 50, maxHp: 100 }),
    ];
    const selected = selectReadyActor(views, 'leader-first', 0);
    assert.equal(selected?.actor.id, 'ready');
});

test('runRaidLabExpedition partySize=2 joins with 2 actors and no party_size_mismatch', () => {
    const result = runRaidLabExpedition({
        seed: 21,
        policy: 'balanced',
        partySize: 2,
        companionClasses: ['cleric'],
        maxActions: 0,
    });
    assert.equal(result.partySize, 2);
    assert.equal(result.companionClasses.length, 1);
    assert.equal(result.companionClasses[0], 'cleric');
    assert.ok(
        result.invariantViolations.length === 0
        || !result.invariantViolations.some((entry) => entry.code === 'party_size_mismatch'),
        `unexpected party_size_mismatch: ${JSON.stringify(result.invariantViolations)}`,
    );
});

test('runRaidLabExpedition partySize=2 digests are deterministic', () => {
    const first = runRaidLabExpedition({
        seed: 33,
        policy: 'balanced',
        partySize: 2,
        companionClasses: ['mage'],
        multiReady: 'leader-first',
        maxActions: 60,
    });
    const second = runRaidLabExpedition({
        seed: 33,
        policy: 'balanced',
        partySize: 2,
        companionClasses: ['mage'],
        multiReady: 'leader-first',
        maxActions: 60,
    });
    assert.equal(first.partySize, 2);
    assert.equal(first.digest, second.digest);
    assert.deepEqual(first.actions, second.actions);
    assert.deepEqual(first.invariantViolations, second.invariantViolations);
});

test('runRaidLabExpedition defaults remain partySize 1 and multiReady leader-first', () => {
    const result = runRaidLabExpedition({
        seed: 1,
        policy: 'balanced',
        maxActions: 0,
    });
    assert.equal(result.partySize, 1);
    assert.equal(result.multiReady, 'leader-first');
    assert.deepEqual(result.companionClasses, []);
});

test('runRaidLabExpedition reports only companion classes that actually join', () => {
    const solo = runRaidLabExpedition({
        seed: 7,
        policy: 'balanced',
        partySize: 1,
        companionClasses: ['mage'],
        maxActions: 0,
    });
    assert.deepEqual(solo.companionClasses, []);

    const trio = runRaidLabExpedition({
        seed: 7,
        policy: 'balanced',
        partySize: 3,
        companionClasses: ['cleric'],
        maxActions: 0,
    });
    assert.deepEqual(trio.companionClasses, ['cleric', 'cavalry']);
    assert.equal(trio.actorsFinal?.length, 3);
});

test('matrix sweep covers all 12 partySize×class pairs within seeds 0..35', () => {
    const pairs = new Set<string>();
    for (let seed = 0; seed <= 35; seed++) {
        const partySize = resolveRaidLabPartySize('sweep', seed);
        const classKey = resolveRaidLabClass('sweep', seed);
        pairs.add(`${partySize}×${classKey}`);
    }
    assert.equal(pairs.size, 12);
    for (const partySize of [1, 2, 3] as RaidLabPartySize[]) {
        for (const classKey of ['infantry', 'cavalry', 'cleric', 'mage'] as const) {
            assert.ok(pairs.has(`${partySize}×${classKey}`), `missing ${partySize}×${classKey}`);
        }
    }
});

test('matrix sweep covers partySize×conserve and partySize×multiReady pairs within seeds 0..35', () => {
    const conservePairs = new Set<string>();
    const multiReadyPairs = new Set<string>();
    for (let seed = 0; seed <= 35; seed++) {
        const partySize = resolveRaidLabPartySize('sweep', seed);
        conservePairs.add(`${partySize}×${resolveRaidLabConserve('sweep', seed)}`);
        multiReadyPairs.add(`${partySize}×${resolveRaidLabMultiReady('sweep', seed)}`);
    }
    assert.equal(conservePairs.size, 9, `conserve pairs=${[...conservePairs].join(',')}`);
    assert.equal(multiReadyPairs.size, 9, `multiReady pairs=${[...multiReadyPairs].join(',')}`);
});

// --- Phase 4b cohort representative clusters (swept matrix, maxActions 1500) ---

test('phase 4b swept seed 0 dies to enemy', () => {
    const result = runSwept(0);
    assert.equal(result.result, 'DEAD');
    assert.equal(result.telemetry.deathCause, 'enemy');
    assert.deepEqual(result.invariantViolations, []);
});

test('phase 4b swept seed 8 survives with partySize 3 and deterministic digest', () => {
    const first = runSwept(8);
    const second = runSwept(8);
    assert.equal(first.result, 'SURVIVED');
    assert.equal(first.partySize, 3);
    assert.equal(first.actorsFinal?.length, 3);
    assert.deepEqual(first.invariantViolations, []);
    assert.equal(first.digest, second.digest);
    assert.deepEqual(first.actions, second.actions);
});

test('phase 4b swept seed 4 leaves legally on max_actions', () => {
    const result = runSwept(4);
    assert.equal(result.result, 'LEFT');
    assert.equal(result.stopReason, 'max_actions');
    assert.equal(result.telemetry.deathCause, 'manual');
    assert.deepEqual(result.invariantViolations, []);
});

test('phase 4b swept seed 611 preserves curse death hazard', () => {
    const first = runSwept(611);
    const second = runSwept(611);
    assert.equal(first.result, 'DEAD');
    assert.equal(first.telemetry.deathCause, 'curse');
    assert.deepEqual(first.invariantViolations, []);
    assert.equal(first.digest, second.digest);
});
