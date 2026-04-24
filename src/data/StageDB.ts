/**
 * StageDB — Battle stage definitions.
 * Each stage defines a fixed tile map, enemy placements, and rewards.
 */

export interface EnemyPlacement {
    name: string;
    level: number;
    x: number;
    y: number;
    color?: string;
    imageSrc?: string;
    isBoss?: boolean;
}

export interface StageReward {
    gold: number;
    exp: number;
    items?: string[];
}

export interface StageData {
    id: string;
    name: string;
    nameKr: string;
    width: number;
    height: number;
    /** 2D tile grid (0=grass, 1=wall, 2=lava, etc.) — uses simple numeric IDs */
    tiles: number[][];
    /** Player party start positions */
    startPositions: { x: number; y: number }[];
    enemies: EnemyPlacement[];
    rewards: StageReward;
    /** Recommended level range */
    recommendedLevel: [number, number];
}

// ═══════════════════════════════════════════════════════════
//  Test Stage — Goblin Cave
// ═══════════════════════════════════════════════════════════

const GOBLIN_CAVE: StageData = {
    id: 'goblin_cave',
    name: 'Goblin Cave',
    nameKr: '고블린 동굴',
    width: 12,
    height: 10,
    tiles: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,1,1,0,0,1,1,0,0,1],
        [1,0,0,1,0,0,0,0,1,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,1,0,0,0,0,1,0,0,1],
        [1,0,0,1,1,0,0,1,1,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
    ],
    startPositions: [
        { x: 1, y: 8 },
        { x: 2, y: 8 },
        { x: 3, y: 8 },
        { x: 4, y: 8 },
    ],
    enemies: [
        { name: '고블린', level: 2, x: 5, y: 2, color: '#44aa44' },
        { name: '고블린', level: 2, x: 8, y: 4, color: '#44aa44' },
        { name: '고블린 궁수', level: 3, x: 3, y: 3, color: '#66aa44' },
        { name: '고블린 대장', level: 5, x: 6, y: 1, color: '#ff6600', isBoss: true },
    ],
    rewards: {
        gold: 150,
        exp: 80,
        items: ['potion_hp_small'],
    },
    recommendedLevel: [1, 5],
};

// ═══════════════════════════════════════════════════════════
//  Stage Registry
// ═══════════════════════════════════════════════════════════

const STAGES: Map<string, StageData> = new Map();
STAGES.set(GOBLIN_CAVE.id, GOBLIN_CAVE);

export function getStage(id: string): StageData | undefined {
    return STAGES.get(id);
}

export function getAllStages(): StageData[] {
    return Array.from(STAGES.values());
}
