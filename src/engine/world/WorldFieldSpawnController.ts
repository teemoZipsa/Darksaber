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
                entity.setWalkSprite('/Image/Character/fighter_walk_4_compact.png', 128, 128, 4, 8);
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
        const enemySeeds = options.masterRealm ? [
            { offset: { x: 7, y: 3 }, name: '성역 파수꾼', level: 8, color: '#8ae6ff', role: 'tank' as EnemyRole },
            { offset: { x: 10, y: -2 }, name: '별빛 궁수', level: 8, color: '#c6a0ff', role: 'archer' as EnemyRole },
            { offset: { x: -6, y: 6 }, name: '홍염 기사', level: 9, color: '#ff5e4a', role: 'bruiser' as EnemyRole },
            { offset: { x: 12, y: 4 }, name: '성좌 사제', level: 9, color: '#8cffb8', role: 'healer' as EnemyRole },
            { offset: { x: -9, y: -4 }, name: '균열 추적자', level: 8, color: '#ffd166', role: 'coward' as EnemyRole },
            { offset: { x: -11, y: 5 }, name: '마스터 쉐이드', level: 10, color: '#9a7cff', role: 'support' as EnemyRole },
        ] : [
            { offset: { x: 7, y: 3 }, name: '늑대인간', level: 1, color: '#d95763', role: 'bruiser' as EnemyRole },
            { offset: { x: 10, y: -2 }, name: '에우리티온', level: 2, color: '#ff8a4a', role: 'archer' as EnemyRole },
            { offset: { x: -6, y: 6 }, name: '미노타우로스', level: 1, color: '#b86cff', role: 'tank' as EnemyRole },
            { offset: { x: 12, y: 4 }, name: '나이아드', level: 2, color: '#6fdc8c', role: 'healer' as EnemyRole },
            { offset: { x: -9, y: -4 }, name: '만드라고라', level: 1, color: '#8fb6ff', role: 'coward' as EnemyRole },
            { offset: { x: -11, y: 5 }, name: '마도사 마기', level: 2, color: '#9a7cff', role: 'support' as EnemyRole },
        ];

        const enemies = enemySeeds.map((seed, index) => {
            const tile = this.movement.findNearbyWalkableTile({
                x: anchor.gridX + seed.offset.x,
                y: anchor.gridY + seed.offset.y,
            }, `enemy_${index}`);
            const enemy = new Enemy(`field_enemy_${index}`, tile.x, tile.y, seed.name, seed.level, seed.color, seed.role);
            enemy.aggroRange = ENEMY_AGGRO_RANGE;
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
