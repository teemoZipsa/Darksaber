/** Mulberry32 PRNG — same family as field nest seeding. */
export function createMulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Derive a stable 32-bit sessionEpoch from a lab seed. */
export function sessionEpochFromSeed(seed: number): number {
    let h = (seed + 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
}

export function createLabTokenFactory(seed: number): (prefix: string) => string {
    let ordinal = 0;
    return (prefix: string) => `${prefix}_lab_${seed}_${ordinal++}`;
}

export function pickIndex(random: () => number, length: number): number {
    if (length <= 0) return 0;
    return Math.min(length - 1, Math.floor(random() * length));
}
