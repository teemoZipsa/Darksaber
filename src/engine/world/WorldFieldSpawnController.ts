import type { Character } from '../../character/Character';
import type { EntityFacing } from '../../entity/Entity';
import { Player } from '../../entity/Player';
import { ACTOR_COLORS, FORMATION_OFFSETS } from '../../field/FieldConfig';
import type { TilePoint } from '../../field/FieldPathing';
import type { FieldActor } from '../../field/FieldTypes';
import type { WorldMovementController } from './WorldMovementController';

const PARTY_WALK_RENDER_SCALE = 1.16;
const PARTY_THREE_FRAME_WALK_ROW_BY_FACING: Record<'up' | 'down' | 'left' | 'right', number> = {
    up: 0,
    down: 1,
    left: 3,
    right: 2,
};
const PARTY_ACTION_ROW_BY_FACING: Partial<Record<EntityFacing, number>> = {
    down: 4,
    up: 5,
};

interface PartyWalkSpriteDefinition {
    src: string;
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    rowByFacing?: Record<'up' | 'down' | 'left' | 'right', number>;
    actionRowByFacing?: Partial<Record<EntityFacing, number>>;
    actionFrameCount?: number;
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
    shrine: { 1: 'shrine_t1_walk.png', 5: 'shrine_t5_walk.png' },
    mage: { 1: 'mage_t1_walk.png', 2: 'mage_t2_walk.png', 3: 'mage_t3_walk.png', 4: 'mage_t4_walk.png', 5: 'mage_t5_walk.png', 6: 'mage_t6_walk.png', 7: 'mage_t7_walk.png' },
    alchemist: { 1: 'alchemist_t1_walk.png' },
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
        actionRowByFacing: PARTY_ACTION_ROW_BY_FACING,
        actionFrameCount: 2,
    };
}

export class WorldFieldSpawnController {
    private readonly movement: WorldMovementController;

    constructor(movement: WorldMovementController, _random: () => number = Math.random) {
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
                    PARTY_WALK_RENDER_SCALE,
                    walkSprite.actionRowByFacing,
                    walkSprite.actionFrameCount
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
}
