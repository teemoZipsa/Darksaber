import type { Character } from '../../character/Character';
import { getItemDef } from '../../data/ItemDB';
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

interface EnemySeed {
    offset: TilePoint;
    name: string;
    level: number;
    color: string;
    role: EnemyRole;
    sprite?: string;
}

const MONSTER_SPRITE_PATH = '/Image/Monster';
const MONSTER_ROW_BY_FACING: Record<'up' | 'down' | 'left' | 'right', number> = {
    up: 0,
    down: 1,
    left: 2,
    right: 3,
};
const MONSTER_FRAME_SIZE = 32;
const MONSTER_FRAME_COUNT = 3;
const MONSTER_FPS = 8;
const MONSTER_RENDER_SCALE = 1.12;
const PARTY_WALK_RENDER_SCALE = 1.16;

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
                entity.setImage(character.portraitImage?.src || '/Image/Character/fighter.png');
            }
            if (character.classLineId === 'infantry' && character.currentTier === 1) {
                entity.setWalkSprite(
                    '/Image/Character/fighter_walk_4_compact.png',
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
        ] : [
            { offset: { x: 7, y: 3 }, name: '초원 늑대', level: 1, color: '#c57945', role: 'bruiser' as EnemyRole, sprite: '346R.png' },
            { offset: { x: 10, y: -2 }, name: '스켈레톤 궁수', level: 2, color: '#d4c4cc', role: 'archer' as EnemyRole, sprite: '302R.png' },
            { offset: { x: -6, y: 6 }, name: '미노타우로스', level: 1, color: '#c07717', role: 'tank' as EnemyRole, sprite: '317R.png' },
            { offset: { x: 12, y: 4 }, name: '하급 마족', level: 2, color: '#8f64c8', role: 'healer' as EnemyRole, sprite: '307R.png' },
            { offset: { x: -9, y: -4 }, name: '쥐인간 도적', level: 1, color: '#7080c8', role: 'coward' as EnemyRole, sprite: '304R.png' },
            { offset: { x: -11, y: 5 }, name: '동굴 박쥐', level: 2, color: '#7d6750', role: 'support' as EnemyRole, sprite: '409R.png' },
        ];

        const enemies = enemySeeds.map((seed, index) => {
            const tile = this.movement.findNearbyWalkableTile({
                x: anchor.gridX + seed.offset.x,
                y: anchor.gridY + seed.offset.y,
            }, `enemy_${index}`);
            const enemy = new Enemy(`field_enemy_${index}`, tile.x, tile.y, seed.name, seed.level, seed.color, seed.role);
            enemy.aggroRange = ENEMY_AGGRO_RANGE;
            if (seed.sprite) {
                enemy.setWalkSprite(
                    `${MONSTER_SPRITE_PATH}/${seed.sprite}`,
                    MONSTER_FRAME_SIZE,
                    MONSTER_FRAME_SIZE,
                    MONSTER_FRAME_COUNT,
                    MONSTER_FPS,
                    MONSTER_ROW_BY_FACING,
                    MONSTER_RENDER_SCALE
                );
            }
            return { enemy, home: tile, path: [] };
        });

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
}
