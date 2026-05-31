import type { Character } from '../../character/Character';
import { getItemDef } from '../../data/ItemDB';
import { rollChestGem } from '../../data/SocketLoot';
import {
    BURGOS_BOSS_MONSTER_ID,
    BURGOS_GUARD_MONSTER_ID,
    GENERAL_MONSTER_IDS,
    MONSTER_ROW_BY_FACING,
    MONSTER_SPRITE_PATH,
    ZAMORA_FENRIS_BOSS_MONSTER_ID,
    ZAMORA_GUARD_MONSTER_ID,
    getMonsterDefinition,
    type MonsterId,
} from '../../data/MonsterCatalog';
import type { StoryScenarioDefinition } from '../../data/StoryScenarioData';
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
const PARTY_THREE_FRAME_WALK_ROW_BY_FACING: Record<'up' | 'down' | 'left' | 'right', number> = {
    up: 0,
    down: 1,
    left: 3,
    right: 2,
};

interface PartyWalkSpriteDefinition {
    src: string;
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    rowByFacing?: Record<'up' | 'down' | 'left' | 'right', number>;
}

const FIGHTER_WALK_SPRITE: PartyWalkSpriteDefinition = {
    src: '/assets/images/characters/animations/infantry_t1_walk.png',
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 4,
};

const PARTY_THREE_FRAME_WALK_SPRITES: Partial<Record<string, Record<number, string>>> = {
    infantry: { 2: 'infantry_t2_walk.png', 3: 'infantry_t3_walk.png', 4: 'infantry_t4_walk.png', 5: 'infantry_t5_walk.png', 6: 'infantry_t6_walk.png', 7: 'infantry_t7_walk.png' },
    cavalry: { 1: 'cavalry_t1_walk.png', 2: 'cavalry_t2_walk.png', 3: 'cavalry_t3_walk.png', 4: 'cavalry_t4_walk.png', 5: 'cavalry_t5_walk.png', 6: 'cavalry_t6_walk.png', 7: 'cavalry_t7_walk.png' },
    flying: { 2: 'flying_t2_walk.png', 3: 'flying_t3_walk.png', 4: 'flying_t4_walk.png', 5: 'flying_t5_walk.png', 6: 'flying_t6_walk.png', 7: 'flying_t7_walk.png' },
    naval: { 2: 'naval_t2_walk.png', 3: 'naval_t3_walk.png', 4: 'naval_t4_walk.png', 5: 'naval_t5_walk.png', 6: 'naval_t6_walk.png', 7: 'naval_t7_walk.png' },
    lancer: { 2: 'lancer_t2_walk.png', 3: 'lancer_t3_walk.png', 4: 'lancer_t4_walk.png', 5: 'lancer_t5_walk.png', 6: 'lancer_t6_walk.png', 7: 'lancer_t7_walk.png' },
    archer: { 2: 'archer_t2_walk.png', 3: 'archer_t3_walk.png', 4: 'archer_t4_walk.png', 5: 'archer_t5_walk.png', 6: 'archer_t6_walk.png', 7: 'archer_t7_walk.png' },
    cleric: { 1: 'cleric_t1_walk.png', 2: 'cleric_t2_walk.png', 3: 'cleric_t3_walk.png', 4: 'cleric_t4_walk.png', 5: 'cleric_t5_walk.png', 6: 'cleric_t6_walk.png', 7: 'cleric_t7_walk.png' },
    priest: { 2: 'priest_t2_walk.png', 3: 'priest_t3_walk.png', 4: 'priest_t4_walk.png', 5: 'priest_t5_walk.png', 6: 'priest_t6_walk.png', 7: 'priest_t7_walk.png' },
    mage: { 1: 'mage_t1_walk.png', 2: 'mage_t2_walk.png', 3: 'mage_t3_walk.png', 4: 'mage_t4_walk.png', 5: 'mage_t5_walk.png', 6: 'mage_t6_walk.png', 7: 'mage_t7_walk.png' },
    cultist: { 2: 'cultist_t2_walk.png', 3: 'cultist_t3_walk.png', 4: 'cultist_t4_walk.png', 5: 'cultist_t5_walk.png', 6: 'cultist_t6_walk.png', 7: 'cultist_t7_walk.png' },
};

function getPartyWalkSprite(classLineId: string, tier: number): PartyWalkSpriteDefinition | undefined {
    if (classLineId === 'infantry' && tier === 1) return FIGHTER_WALK_SPRITE;

    const fileName = PARTY_THREE_FRAME_WALK_SPRITES[classLineId]?.[tier];
    if (!fileName) return undefined;

    return {
        src: `/assets/images/characters/animations/${fileName}`,
        frameWidth: 32,
        frameHeight: 32,
        frameCount: 3,
        rowByFacing: PARTY_THREE_FRAME_WALK_ROW_BY_FACING,
    };
}

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
    private readonly random: () => number;

    constructor(movement: WorldMovementController, random: () => number = Math.random) {
        this.movement = movement;
        this.random = random;
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
            character.updatePortrait();
            if (character.portraitImage && character.portraitLoaded) {
                entity.image = character.portraitImage;
                entity.imageLoaded = true;
            } else {
                entity.setImage(character.getPortraitSrc());
            }
            const walkSprite = getPartyWalkSprite(character.classLineId, character.currentTier);
            if (walkSprite) {
                entity.setWalkSprite(
                    walkSprite.src,
                    walkSprite.frameWidth,
                    walkSprite.frameHeight,
                    walkSprite.frameCount,
                    8,
                    walkSprite.rowByFacing,
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
        const chestItems = [herb, rollChestGem(this.random, !!options.masterRealm)].filter((item): item is NonNullable<typeof item> => Boolean(item));
        const packItems = [sword].filter((item): item is NonNullable<typeof item> => Boolean(item));
        const lootSeeds = [
            { offset: { x: 3, y: 2 }, id: 'field_chest_1', label: '버려진 보급 상자', items: chestItems, kind: 'chest' as const },
            { offset: { x: -3, y: 4 }, id: 'field_pack_1', label: '전사자의 배낭', items: packItems, kind: 'corpse' as const },
        ];

        const loot = lootSeeds.flatMap((seed) => {
            if (seed.items.length === 0) return [];
            const tile = this.movement.findNearbyWalkableTile({
                x: anchor.gridX + seed.offset.x,
                y: anchor.gridY + seed.offset.y,
            }, seed.id);
            return [new LootObject(seed.id, tile.x, tile.y, seed.items, { sourceLabel: seed.label, kind: seed.kind })];
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

    public createZamoraFortressEncounter(anchor: TilePoint): StarterFieldContent {
        const seeds: CatalogEnemySeed[] = [
            { monsterId: ZAMORA_FENRIS_BOSS_MONSTER_ID, offset: { x: 0, y: 0 } },
            { monsterId: ZAMORA_GUARD_MONSTER_ID, offset: { x: -2, y: -2 } },
            { monsterId: ZAMORA_GUARD_MONSTER_ID, offset: { x: 2, y: -2 } },
            { monsterId: ZAMORA_GUARD_MONSTER_ID, offset: { x: 2, y: 2 } },
            { monsterId: ZAMORA_GUARD_MONSTER_ID, offset: { x: -2, y: 2 } },
        ];
        let guardIndex = 0;
        const enemies = seeds.map((seed) => {
            const id = seed.monsterId === ZAMORA_FENRIS_BOSS_MONSTER_ID ? 'zamora_fenris' : `zamora_guard_${guardIndex++}`;
            return this.createEnemy(seed, anchor, id);
        });
        return { enemies, loot: [] };
    }

    public createStoryScenarioEncounter(scenario: StoryScenarioDefinition, anchor: TilePoint): StarterFieldContent {
        const bossSeed: CustomEnemySeed = {
            offset: { x: 0, y: 0 },
            name: scenario.bossName ?? '나이아두',
            level: scenario.bossLevel,
            color: scenario.bossColor,
            role: 'boss',
            aggroRange: 9,
        };
        const guardRoles: EnemyRole[] = ['bruiser', 'tank', 'archer', 'support', 'healer', 'coward'];
        const guardNames = scenario.episode === 17 ? ['단그', '나이아두 변종'] : [
            `${scenario.dungeonNameKr} 수비병`,
            `${scenario.dungeonNameKr} 추격병`,
            `${scenario.dungeonNameKr} 사수`,
            `${scenario.dungeonNameKr} 주술사`,
            `${scenario.dungeonNameKr} 파수병`,
            `${scenario.dungeonNameKr} 정찰병`,
        ];
        const ringOffsets: TilePoint[] = [
            { x: -3, y: -2 },
            { x: 3, y: -2 },
            { x: -3, y: 2 },
            { x: 3, y: 2 },
            { x: 0, y: -4 },
            { x: 0, y: 4 },
            { x: -5, y: 0 },
            { x: 5, y: 0 },
            { x: -5, y: -4 },
            { x: 5, y: 4 },
        ];
        const guardSeeds: CustomEnemySeed[] = ringOffsets.slice(0, scenario.guardCount).map((offset, index) => ({
            offset,
            name: guardNames[index % guardNames.length],
            level: scenario.guardLevel + Math.floor(index / 4),
            color: shiftColor(scenario.bossColor, index),
            role: guardRoles[index % guardRoles.length],
            aggroRange: 6,
        }));
        const enemies = [bossSeed, ...guardSeeds].map((seed, index) => {
            const id = index === 0
                ? `${scenario.dungeonId}_objective`
                : `${scenario.dungeonId}_guard_${index}`;
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

function shiftColor(hex: string, index: number): string {
    const value = Number.parseInt(hex.replace('#', ''), 16);
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    const delta = (index % 3) * 18 - 18;
    const clamp = (v: number) => Math.max(32, Math.min(230, v + delta));
    return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

if (MORTAL_REALM_ENEMY_SEEDS.length !== GENERAL_MONSTER_IDS.length) {
    throw new Error('Mortal field monster seed count must match the general monster catalog.');
}
