import type { Character } from '../../character/Character';
import { getItemDef } from '../../data/ItemDB';
import {
    BURGOS_BOSS_MONSTER_ID,
    BURGOS_GUARD_MONSTER_ID,
    GENERAL_MONSTER_IDS,
    MONSTER_ROW_BY_FACING,
    MONSTER_SPRITE_PATH,
    getMonsterDefinition,
    type MonsterId,
} from '../../data/MonsterCatalog';
import { Enemy } from '../../entity/Enemy';
import { LootObject } from '../../entity/LootObject';
import { Player } from '../../entity/Player';
import { ACTOR_COLORS, ENEMY_AGGRO_RANGE, FORMATION_OFFSETS } from '../../field/FieldConfig';
import type { TilePoint } from '../../field/FieldPathing';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import type { EnemyRole } from '../../field/EnemyAI';
import type { WorldMovementController } from './WorldMovementController';

export interface StarterFieldContent {
    enemies: FieldEnemy[];
    loot: LootObject[];
}

export interface StarterFieldContentOptions {
    masterRealm?: boolean;
}

interface CustomEnemySeed {
    offset: TilePoint;
    name: string;
    level: number;
    color: string;
    role: EnemyRole;
    aggroRange?: number;
}

interface CatalogEnemySeed {
    offset: TilePoint;
    monsterId: MonsterId;
}

type EnemySeed = CustomEnemySeed | CatalogEnemySeed;

const PARTY_WALK_RENDER_SCALE = 1.16;

const MORTAL_REALM_ENEMY_SEEDS: CatalogEnemySeed[] = [
    { monsterId: '346R', offset: { x: 7, y: 3 } },
    { monsterId: '302R', offset: { x: 10, y: -2 } },
    { monsterId: '317R', offset: { x: -6, y: 6 } },
    { monsterId: '307R', offset: { x: 12, y: 4 } },
    { monsterId: '304R', offset: { x: -9, y: -4 } },
    { monsterId: '409R', offset: { x: -11, y: 5 } },
    { monsterId: '434R', offset: { x: 15, y: -5 } },
    { monsterId: '303R', offset: { x: 17, y: 6 } },
    { monsterId: '305R', offset: { x: 6, y: -9 } },
    { monsterId: '308R', offset: { x: -13, y: -7 } },
    { monsterId: '309R', offset: { x: 19, y: 0 } },
    { monsterId: '311R', offset: { x: -16, y: 2 } },
    { monsterId: '313R', offset: { x: 3, y: 12 } },
    { monsterId: '314R', offset: { x: -5, y: 13 } },
    { monsterId: '315R', offset: { x: 14, y: 11 } },
    { monsterId: '435R', offset: { x: -18, y: -3 } },
];

export class WorldFieldSpawnController {
    private readonly movement: WorldMovementController;

    constructor(movement: WorldMovementController) {
        this.movement = movement;
    }

    public createPartyActors(anchorTile: TilePoint, members: Character[]): FieldActor[] {
        return members.map((character, index) => {
            const tile = this.movement.findNearbyWalkableTile({
                x: anchorTile.x + (FORMATION_OFFSETS[index]?.x ?? 0),
                y: anchorTile.y + (FORMATION_OFFSETS[index]?.y ?? 0),
            }, `party_${index}`);
            const entity = new Player(tile.x, tile.y);
            entity.color = ACTOR_COLORS[index % ACTOR_COLORS.length];
            entity.label = character.name;
            if (character.portraitImage && character.portraitLoaded) {
                entity.image = character.portraitImage;
                entity.imageLoaded = true;
            } else {
                entity.setImage(character.portraitImage?.src || '/assets/images/characters/darksaber/infantry_t1.png');
            }
            if (character.classLineId === 'infantry' && character.currentTier === 1) {
                entity.setWalkSprite(
                    '/assets/images/characters/animations/fighter_walk_4_compact.png',
                    128,
                    128,
                    4,
                    8,
                    undefined,
                    PARTY_WALK_RENDER_SCALE
                );
            }
            return {
                id: character.id,
                character,
                entity,
                path: [],
                queuedIntent: null,
            };
        });
    }

    public createStarterFieldContent(anchor: Player, options: StarterFieldContentOptions = {}): StarterFieldContent {
        const enemySeeds: EnemySeed[] = options.masterRealm ? [
            { offset: { x: 7, y: 3 }, name: '성역 파수꾼', level: 8, color: '#8ae6ff', role: 'tank' as EnemyRole },
            { offset: { x: 10, y: -2 }, name: '별빛 궁수', level: 8, color: '#c6a0ff', role: 'archer' as EnemyRole },
            { offset: { x: -6, y: 6 }, name: '홍염 기사', level: 9, color: '#ff5e4a', role: 'bruiser' as EnemyRole },
            { offset: { x: 12, y: 4 }, name: '성좌 사제', level: 9, color: '#8cffb8', role: 'healer' as EnemyRole },
            { offset: { x: -9, y: -4 }, name: '균열 추적자', level: 8, color: '#ffd166', role: 'coward' as EnemyRole },
            { offset: { x: -11, y: 5 }, name: '마스터 쉐이드', level: 10, color: '#9a7cff', role: 'support' as EnemyRole },
        ] : MORTAL_REALM_ENEMY_SEEDS;

        const enemies = enemySeeds.map((seed, index) => this.createEnemy(seed, anchor, `field_enemy_${index}`));

        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        const sword = getItemDef('short_sword');
        const lootSeeds = [
            { offset: { x: 3, y: 2 }, id: 'field_chest_1', label: '버려진 보급 상자', item: herb, kind: 'chest' as const },
            { offset: { x: -3, y: 4 }, id: 'field_pack_1', label: '전사자의 배낭', item: sword, kind: 'corpse' as const },
        ];

        const loot = lootSeeds.flatMap((seed) => {
            if (!seed.item) return [];
            const tile = this.movement.findNearbyWalkableTile({
                x: anchor.gridX + seed.offset.x,
                y: anchor.gridY + seed.offset.y,
            }, seed.id);
            return [new LootObject(seed.id, tile.x, tile.y, [seed.item], { sourceLabel: seed.label, kind: seed.kind })];
        });

        return { enemies, loot };
    }

    public createBurgosCastleEncounter(anchor: TilePoint): StarterFieldContent {
        const seeds: CatalogEnemySeed[] = [
            { monsterId: BURGOS_BOSS_MONSTER_ID, offset: { x: 0, y: 0 } },
            { monsterId: BURGOS_GUARD_MONSTER_ID, offset: { x: -2, y: -2 } },
            { monsterId: BURGOS_GUARD_MONSTER_ID, offset: { x: 2, y: -2 } },
            { monsterId: BURGOS_GUARD_MONSTER_ID, offset: { x: 2, y: 2 } },
            { monsterId: BURGOS_GUARD_MONSTER_ID, offset: { x: -2, y: 2 } },
        ];
        let guardIndex = 0;
        const enemies = seeds.map((seed) => {
            const id = seed.monsterId === BURGOS_BOSS_MONSTER_ID ? 'burgos_boss' : `burgos_guard_${guardIndex++}`;
            return this.createEnemy(seed, anchor, id);
        });
        return { enemies, loot: [] };
    }

    private createEnemy(seed: EnemySeed, anchor: TilePoint | Player, id: string): FieldEnemy {
        const anchorTile = 'gridX' in anchor
            ? { x: anchor.gridX, y: anchor.gridY }
            : anchor;
        const tile = this.movement.findNearbyWalkableTile({
            x: anchorTile.x + seed.offset.x,
            y: anchorTile.y + seed.offset.y,
        }, id);
        const enemy = 'monsterId' in seed
            ? this.createCatalogEnemy(seed.monsterId, id, tile)
            : new Enemy(id, tile.x, tile.y, seed.name, seed.level, seed.color, seed.role);
        if (!('monsterId' in seed)) enemy.aggroRange = seed.aggroRange ?? ENEMY_AGGRO_RANGE;
        return { enemy, home: tile, path: [] };
    }

    private createCatalogEnemy(monsterId: MonsterId, id: string, tile: TilePoint): Enemy {
        const definition = getMonsterDefinition(monsterId);
        const enemy = new Enemy(id, tile.x, tile.y, definition.name, definition.level, definition.color, definition.role);
        enemy.aggroRange = definition.aggroRange;
        enemy.setWalkSprite(
            `${MONSTER_SPRITE_PATH}/${definition.sprite}`,
            definition.frameSize,
            definition.frameSize,
            definition.frameCount,
            definition.framesPerSecond,
            MONSTER_ROW_BY_FACING,
            definition.renderScale
        );
        return enemy;
    }
}

if (MORTAL_REALM_ENEMY_SEEDS.length !== GENERAL_MONSTER_IDS.length) {
    throw new Error('Mortal field monster seed count must match the general monster catalog.');
}
