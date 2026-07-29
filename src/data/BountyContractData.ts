import {
    GENERAL_MONSTER_IDS,
    NEW_MONSTER_IDS,
    getMonsterDefinition,
    type MonsterId,
} from './MonsterCatalog';
import { isTownId, type TownId } from './TownFacilityData';
import {
    rollEliteAffixes,
    type EliteAffixId,
} from '../field/EliteAffixes';

export const BOUNTY_CONTRACT_VERSION = 1;
export const BOUNTY_PROOF_ITEM_ID = 'bounty_elite_proof';
export const BOUNTY_OFFER_COUNT = 3;

export const BOUNTY_RISK_IDS = [
    'swift_hunt',
    'unbroken',
    'blood_trail',
] as const;

export type BountyRiskId = typeof BOUNTY_RISK_IDS[number];

export interface BountyContract {
    version: typeof BOUNTY_CONTRACT_VERSION;
    id: string;
    originTownId: TownId;
    offerCycle: number;
    tier: number;
    slot: number;
    monsterId: MonsterId;
    monsterLevel: number;
    affixIds: EliteAffixId[];
    riskId: BountyRiskId;
    rewardGold: number;
    bonusGold: number;
}

export interface BountyRiskProgress {
    elapsedSeconds: number;
    hadActorDown: boolean;
    killsIncludingTarget: number;
}

const BOUNTY_MONSTER_POOL: readonly MonsterId[] = [
    ...GENERAL_MONSTER_IDS,
    ...NEW_MONSTER_IDS,
];

export function getBountyProgressionTier(completedQuestCount: number): number {
    const count = Number.isFinite(completedQuestCount) ? Math.max(0, Math.floor(completedQuestCount)) : 0;
    return Math.min(4, Math.floor(count / 5));
}

export function getBountyOffers(
    townId: string,
    offerCycle: number,
    completedQuestCount: number,
): BountyContract[] {
    if (!isTownId(townId)) return [];
    const cycle = normalizeCycle(offerCycle);
    const tier = getBountyProgressionTier(completedQuestCount);
    const monsters = deterministicShuffle(
        BOUNTY_MONSTER_POOL,
        `bounty:v${BOUNTY_CONTRACT_VERSION}:${townId}:${cycle}:${tier}`,
    ).slice(0, BOUNTY_OFFER_COUNT);

    return monsters.map((monsterId, slot) => {
        const id = createBountyContractId(townId, cycle, tier, slot);
        const monster = getMonsterDefinition(monsterId);
        const monsterLevel = clamp(
            Math.max(monster.level, 2 + tier * 3),
            monster.levelBand[0],
            monster.levelBand[1],
        );
        return {
            version: BOUNTY_CONTRACT_VERSION,
            id,
            originTownId: townId,
            offerCycle: cycle,
            tier,
            slot,
            monsterId,
            monsterLevel,
            affixIds: rollEliteAffixes(`${id}:affixes`, 2),
            riskId: BOUNTY_RISK_IDS[hashString(`${id}:risk`) % BOUNTY_RISK_IDS.length],
            rewardGold: 350 + tier * 225 + monsterLevel * 20,
            bonusGold: 200 + tier * 125,
        };
    });
}

export function resolveBountyContract(contractId: unknown): BountyContract | null {
    if (typeof contractId !== 'string') return null;
    const match = /^bounty-v1~([a-z0-9_]+)~(\d+)~(\d+)~([0-2])$/.exec(contractId);
    if (!match) return null;
    const [, townId, cycleRaw, tierRaw, slotRaw] = match;
    if (!isTownId(townId)) return null;
    const cycle = Number(cycleRaw);
    const tier = Number(tierRaw);
    const slot = Number(slotRaw);
    if (!Number.isSafeInteger(cycle) || cycle < 0 || tier < 0 || tier > 4) return null;
    return getBountyOffers(townId, cycle, tier * 5)
        .find((contract) => contract.slot === slot && contract.id === contractId)
        ?? null;
}

export function isCurrentBountyOffer(
    contractId: unknown,
    townId: string,
    offerCycle: number,
    completedQuestCount: number,
): boolean {
    return getBountyOffers(townId, offerCycle, completedQuestCount)
        .some((contract) => contract.id === contractId);
}

export function normalizeActiveBountyContractId(value: unknown): string | null {
    return resolveBountyContract(value)?.id ?? null;
}

export function isBountyRiskCompleted(
    contract: BountyContract,
    progress: BountyRiskProgress,
): boolean {
    switch (contract.riskId) {
        case 'swift_hunt':
            return progress.elapsedSeconds <= 10 * 60;
        case 'unbroken':
            return !progress.hadActorDown;
        case 'blood_trail':
            return progress.killsIncludingTarget >= 4;
    }
}

function createBountyContractId(townId: TownId, cycle: number, tier: number, slot: number): string {
    return `bounty-v${BOUNTY_CONTRACT_VERSION}~${townId}~${cycle}~${tier}~${slot}`;
}

function normalizeCycle(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function deterministicShuffle<T>(values: readonly T[], seed: string): T[] {
    const result = [...values];
    let state = hashString(seed) || 0x9e3779b9;
    for (let i = result.length - 1; i > 0; i--) {
        state = nextRandomState(state);
        const j = state % (i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function hashString(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function nextRandomState(state: number): number {
    let next = state >>> 0;
    next ^= next << 13;
    next ^= next >>> 17;
    next ^= next << 5;
    return next >>> 0;
}
