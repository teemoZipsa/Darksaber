import type { TilePoint } from './FieldPathing';

export interface PartyTileTarget {
    id: string;
    gridX: number;
    gridY: number;
}

export interface EnemyTileTarget {
    id: string;
    gridX: number;
    gridY: number;
    isDead?: boolean;
    stats?: { hp: number };
}

export interface LootTileTarget {
    id: string;
    x: number;
    y: number;
    opened?: boolean;
}

export type FieldHit<TParty, TEnemy, TLoot> =
    | { kind: 'enemy'; enemy: TEnemy }
    | { kind: 'party'; party: TParty }
    | { kind: 'loot'; loot: TLoot }
    | { kind: 'ground'; tile: TilePoint }
    | { kind: 'blocked'; tile: TilePoint };

export interface FieldHitCandidates<TParty, TEnemy, TLoot> {
    party: TParty[];
    enemies: TEnemy[];
    loot: TLoot[];
    isGroundWalkable: (x: number, y: number) => boolean;
}

export function resolveFieldHit<
    TParty extends PartyTileTarget,
    TEnemy extends EnemyTileTarget,
    TLoot extends LootTileTarget
>(
    tile: TilePoint,
    candidates: FieldHitCandidates<TParty, TEnemy, TLoot>
): FieldHit<TParty, TEnemy, TLoot> {
    const enemy = candidates.enemies.find((candidate) =>
        candidate.gridX === tile.x &&
        candidate.gridY === tile.y &&
        !candidate.isDead &&
        candidate.stats?.hp !== 0
    );
    if (enemy) return { kind: 'enemy', enemy };

    const party = candidates.party.find((candidate) =>
        candidate.gridX === tile.x &&
        candidate.gridY === tile.y
    );
    if (party) return { kind: 'party', party };

    const loot = candidates.loot.find((candidate) =>
        candidate.x === tile.x &&
        candidate.y === tile.y &&
        !candidate.opened
    );
    if (loot) return { kind: 'loot', loot };

    if (candidates.isGroundWalkable(tile.x, tile.y)) return { kind: 'ground', tile };
    return { kind: 'blocked', tile };
}
