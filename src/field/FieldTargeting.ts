import type { SkillTerrainContext } from '../combat/SkillEffectResolver';
import { t } from '../i18n/LanguageManager';
import type { TileType } from '../map/Tile';
import type { TilePoint } from './FieldPathing';
import { tileKey } from './FieldPathing';
import {
    type AttackPatternProfile,
    type PatternContext,
    getEffectTiles,
    getSelectDistance,
    isSelectableTile,
} from './TargetPatterns';

export type AttackTargetFailure = 'tooClose' | 'blocked' | 'outOfRange';

export interface FieldTargetEnemy {
    id: string;
    gridX: number;
    gridY: number;
    stats: { hp: number };
}

export interface ActorAttackTargetFailureInput {
    profile: AttackPatternProfile;
    context: PatternContext;
    selectedContext: PatternContext;
    target: TilePoint;
}

export interface SkillTerrainContextInput<TEnemy extends FieldTargetEnemy> {
    casterTile: TilePoint;
    targetEnemies: TEnemy[];
    targetEnemy?: TEnemy;
    getTileAt: (tile: TilePoint) => TileType;
}

export function getActorAttackTargetFailure(input: ActorAttackTargetFailureInput): AttackTargetFailure | null {
    const { profile, context, selectedContext, target } = input;
    if (isSelectableTile(profile, context, target)) {
        const effectTileKeys = new Set(
            getEffectTiles(profile, selectedContext).map((tile) => tileKey(tile.x, tile.y))
        );
        return effectTileKeys.has(tileKey(target.x, target.y)) ? null : 'blocked';
    }
    if (isAttackTargetTooClose(profile, context.casterTile, target)) return 'tooClose';
    if (isSelectableTile(profile, context, target, { ignoreLineOfSight: true })) return 'blocked';
    return 'outOfRange';
}

export function getAttackFailureMessage(failure: AttackTargetFailure): string {
    switch (failure) {
        case 'tooClose': return t('field.attackFailure.tooClose');
        case 'blocked': return t('field.attackFailure.blocked');
        case 'outOfRange': return t('field.attackFailure.outOfRange');
    }
}

export function isAttackTargetTooClose(profile: AttackPatternProfile, from: TilePoint, to: TilePoint): boolean {
    const minRange = profile.select.minRange ?? 1;
    if (minRange <= 1) return false;
    if (profile.select.kind === 'orthogonalLine' && from.x !== to.x && from.y !== to.y) return false;
    const distance = getSelectDistance(profile.select, from, to);
    return distance > 0 && distance < minRange;
}

export function getSkillCandidateEnemies<TEnemy extends FieldTargetEnemy>(
    aliveEnemies: TEnemy[],
    profile: AttackPatternProfile,
    context: PatternContext,
    targetEnemy?: TEnemy
): TEnemy[] {
    if (!targetEnemy) return aliveEnemies;

    const effectTileKeys = new Set(
        getEffectTiles(profile, context).map((tile) => tileKey(tile.x, tile.y))
    );
    return aliveEnemies.filter((enemy) => effectTileKeys.has(tileKey(enemy.gridX, enemy.gridY)));
}

export function buildSkillTerrainContext<TEnemy extends FieldTargetEnemy>(
    input: SkillTerrainContextInput<TEnemy>
): SkillTerrainContext {
    const targetTiles: Record<string, TileType> = {};
    for (const enemy of input.targetEnemies) {
        targetTiles[enemy.id] = input.getTileAt({ x: enemy.gridX, y: enemy.gridY });
    }
    return {
        casterTile: input.getTileAt(input.casterTile),
        impactTile: input.targetEnemy ? input.getTileAt({ x: input.targetEnemy.gridX, y: input.targetEnemy.gridY }) : undefined,
        targetTiles,
    };
}
