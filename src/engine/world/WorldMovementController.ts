import { getEffectiveStatsForCharacter, getEffectiveStatsForEnemy, hasStatus, removeActionStanceStatusesFromCarrier } from '../../combat/StatusEffects';
import type { Enemy } from '../../entity/Enemy';
import type { Player } from '../../entity/Player';
import { TILE_PROPERTIES, type TileType } from '../../map/Tile';
import { ENEMY_AGGRO_RANGE, ENEMY_EXIT_RANGE, ENEMY_LEASH_RANGE, FIELD_ATB_SCALE, FORMATION_OFFSETS, MOVEMENT_REPATH_INTERVAL } from '../../field/FieldConfig';
import { advanceAtb, resolveAggroState } from '../../field/FieldCombat';
import {
    type FieldPassableQuery,
    type TilePoint,
    findPathToAny,
    manhattan,
    tilesInRange,
} from '../../field/FieldPathing';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import { isTerrainPassable, type TerrainActorTraits } from '../../field/TerrainRules';

export interface WorldMovementContext {
    getPartyActors: () => FieldActor[];
    getFieldEnemies: () => FieldEnemy[];
    getTileAt: (x: number, y: number) => TileType;
    isGroundWalkable?: (x: number, y: number) => boolean;
    getTerrainTraitsForActorId: (actorId?: string) => TerrainActorTraits;
    getPartyCarryAtbMultiplier?: () => number;
}

export interface PartyMovementInput {
    dt: number;
    controlled: FieldActor | null;
    activeTurnActorId: string | null;
    followRepathTimer: number;
}

export interface PartyMovementResult {
    readyActorIds: string[];
    followRepathTimer: number;
}

export interface EnemyMovementInput {
    dt: number;
    activeTurnActorId: string | null;
}

export interface EnemyMovementResult {
    readyEnemyIds: string[];
}

export class WorldMovementController {
    private readonly context: WorldMovementContext;

    constructor(context: WorldMovementContext) {
        this.context = context;
    }

    public updatePartyActors(input: PartyMovementInput): PartyMovementResult {
        const readyActorIds: string[] = [];
        let followRepathTimer = input.followRepathTimer - input.dt;
        const carryAtbMultiplier = this.context.getPartyCarryAtbMultiplier?.() ?? 1;

        for (const actor of this.context.getPartyActors()) {
            if (actor.character.isDead) continue;
            if (actor.id !== input.activeTurnActorId) {
                actor.entity.actionGauge = advanceAtb(
                    actor.entity.actionGauge,
                    getEffectiveStatsForCharacter(actor.character).spd,
                    input.dt,
                    FIELD_ATB_SCALE * carryAtbMultiplier
                );
                if (actor.entity.actionGauge >= 100) {
                    actor.entity.actionGauge = 100;
                    readyActorIds.push(actor.id);
                }
            }
            this.stepActorAlongPath(actor);
            actor.entity.update(input.dt);
        }

        if (input.controlled && followRepathTimer <= 0) {
            followRepathTimer = MOVEMENT_REPATH_INTERVAL;
            this.updateFollowerPaths(input.controlled);
        }

        return { readyActorIds, followRepathTimer };
    }

    public updateEnemies(input: EnemyMovementInput): EnemyMovementResult {
        const readyEnemyIds: string[] = [];
        const aliveActors = this.context.getPartyActors().filter((actor) => !actor.character.isDead);

        for (const entry of this.context.getFieldEnemies()) {
            const enemy = entry.enemy;
            if (enemy.stats.hp <= 0) continue;
            enemy.update(input.dt);

            const closest = this.findClosestActor(this.enemyTile(enemy), aliveActors);
            if (!closest) continue;

            const enemyTile = this.enemyTile(enemy);
            const distanceToTarget = manhattan(enemyTile, this.actorTile(closest));
            const leashExceeded = manhattan(enemyTile, entry.home) > ENEMY_LEASH_RANGE;
            enemy.isAggro = resolveAggroState(enemy.isAggro, distanceToTarget, ENEMY_AGGRO_RANGE, ENEMY_EXIT_RANGE, leashExceeded);
            if (!enemy.isAggro && this.hasAggroAllyNear(entry, enemy.aiProfile.assistRange)) enemy.isAggro = true;
            if (!enemy.isAggro) {
                enemy.actionGauge = 0;
                continue;
            }

            if (enemy.id !== input.activeTurnActorId) {
                enemy.actionGauge = advanceAtb(enemy.actionGauge, getEffectiveStatsForEnemy(enemy).spd, input.dt, FIELD_ATB_SCALE * 0.7);
                if (enemy.actionGauge >= 100) {
                    enemy.actionGauge = 100;
                    readyEnemyIds.push(enemy.id);
                }
            }
        }

        return { readyEnemyIds };
    }

    public updateFollowerPaths(controlled: FieldActor): void {
        const partyActors = this.context.getPartyActors();
        for (let i = 0; i < partyActors.length; i++) {
            const actor = partyActors[i];
            if (actor === controlled || actor.character.isDead || actor.queuedIntent?.kind === 'attack') continue;
            if (hasStatus(actor.character.statuses, 'immobilize')) continue;
            if (actor.path.length > 0) continue;

            const offset = FORMATION_OFFSETS[i % FORMATION_OFFSETS.length];
            const preferred = { x: controlled.entity.gridX + offset.x, y: controlled.entity.gridY + offset.y };
            if (manhattan(this.actorTile(actor), preferred) <= 1) continue;

            const goals = [preferred, ...tilesInRange(preferred, 1)]
                .filter((tile) => this.isFieldPassable({
                    ...tile,
                    actorId: actor.id,
                    intent: 'follow',
                    goal: preferred,
                }));
            const path = findPathToAny(this.actorTile(actor), goals, (query) => this.isFieldPassable(query), {
                actorId: actor.id,
                intent: 'follow',
                maxNodes: 2000,
            });
            if (path.length > 0) {
                actor.path = path;
                actor.queuedIntent = { kind: 'move', tile: path[path.length - 1] };
            }
        }
    }

    public stepActorAlongPath(actor: FieldActor): void {
        if (hasStatus(actor.character.statuses, 'immobilize')) return;
        if (isEntityMoving(actor.entity) || actor.path.length === 0) return;

        const next = actor.path[0];
        if (!this.isFieldPassable({
            ...next,
            actorId: actor.id,
            intent: actor.queuedIntent?.kind === 'attack' ? 'attack' : actor.queuedIntent?.kind === 'interact' ? 'interact' : 'move',
            goal: actor.queuedIntent?.tile,
        })) {
            actor.path = [];
            return;
        }

        actor.path.shift();
        removeActionStanceStatusesFromCarrier(actor.character);
        actor.entity.facing = directionFromTo(this.actorTile(actor), next);
        actor.entity.gridX = next.x;
        actor.entity.gridY = next.y;
    }

    public enemyStepToward(entry: FieldEnemy, actor: FieldActor, desiredRange: number = 1): void {
        const enemy = entry.enemy;
        if (hasStatus(enemy.statuses, 'immobilize')) return;
        const targetTile = this.actorTile(actor);
        if (manhattan(this.enemyTile(enemy), targetTile) <= desiredRange) return;

        const goals = tilesInRange(targetTile, desiredRange)
            .filter((tile) => manhattan(tile, targetTile) === desiredRange)
            .filter((tile) => this.isFieldPassable({
                ...tile,
                actorId: enemy.id,
                intent: 'enemy',
                goal: targetTile,
            }));
        const path = findPathToAny(this.enemyTile(enemy), goals, (query) => this.isFieldPassable(query), {
            actorId: enemy.id,
            intent: 'enemy',
            maxNodes: 2500,
        });
        if (path.length === 0) return;

        const next = path[0];
        enemy.facing = directionFromTo(this.enemyTile(enemy), next);
        enemy.gridX = next.x;
        enemy.gridY = next.y;
    }

    public enemyStepAway(entry: FieldEnemy, actor: FieldActor): boolean {
        const enemy = entry.enemy;
        if (hasStatus(enemy.statuses, 'immobilize')) return false;
        const start = this.enemyTile(enemy);
        const target = this.actorTile(actor);
        const startDistance = manhattan(start, target);
        const candidates = tilesInRange(start, 1)
            .filter((tile) => manhattan(tile, start) === 1)
            .filter((tile) => this.isFieldPassable({
                ...tile,
                actorId: enemy.id,
                intent: 'enemy',
            }))
            .sort((a, b) => manhattan(b, target) - manhattan(a, target));
        const next = candidates.find((tile) => manhattan(tile, target) > startDistance);
        if (!next) return false;

        enemy.facing = directionFromTo(start, next);
        enemy.gridX = next.x;
        enemy.gridY = next.y;
        return true;
    }

    public isFieldPassable(query: FieldPassableQuery): boolean {
        const tile = this.context.getTileAt(query.x, query.y);
        if (!isTerrainPassable(tile, this.context.getTerrainTraitsForActorId(query.actorId))) return false;
        if (this.context.isGroundWalkable && TILE_PROPERTIES[tile]?.walkable && !this.context.isGroundWalkable(query.x, query.y)) return false;

        const enemyAtTile = this.context.getFieldEnemies().some((entry) =>
            entry.enemy.id !== query.actorId &&
            entry.enemy.stats.hp > 0 &&
            entry.enemy.gridX === query.x &&
            entry.enemy.gridY === query.y
        );
        if (enemyAtTile) return false;

        if (query.intent === 'enemy') {
            return !this.context.getPartyActors().some((actor) =>
                !actor.character.isDead &&
                actor.id !== query.actorId &&
                actor.entity.gridX === query.x &&
                actor.entity.gridY === query.y
            );
        }

        return true;
    }

    public findNearbyWalkableTile(tile: TilePoint, actorId: string): TilePoint {
        if (this.isFieldPassable({ ...tile, actorId, intent: 'move' })) return tile;

        for (let radius = 1; radius <= 8; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                    const candidate = { x: tile.x + dx, y: tile.y + dy };
                    if (this.isFieldPassable({ ...candidate, actorId, intent: 'move' })) return candidate;
                }
            }
        }
        return tile;
    }

    public findClosestActor(point: TilePoint, actors: FieldActor[]): FieldActor | null {
        let best: FieldActor | null = null;
        let bestDistance = Infinity;
        for (const actor of actors) {
            if (actor.character.isDead) continue;
            const distance = manhattan(point, this.actorTile(actor));
            if (distance < bestDistance) {
                best = actor;
                bestDistance = distance;
            }
        }
        return best;
    }

    public hasAggroAllyNear(entry: FieldEnemy, range: number): boolean {
        const selfTile = this.enemyTile(entry.enemy);
        return this.context.getFieldEnemies().some((candidate) =>
            candidate !== entry &&
            candidate.enemy.stats.hp > 0 &&
            candidate.enemy.isAggro &&
            manhattan(selfTile, this.enemyTile(candidate.enemy)) <= range
        );
    }

    private actorTile(actor: FieldActor): TilePoint {
        return { x: actor.entity.gridX, y: actor.entity.gridY };
    }

    private enemyTile(enemy: Enemy): TilePoint {
        return { x: enemy.gridX, y: enemy.gridY };
    }
}

export function isEntityMoving(entity: Player | Enemy): boolean {
    return Math.abs(entity.pixelX - entity.gridX) > 0.01 || Math.abs(entity.pixelY - entity.gridY) > 0.01;
}

export function directionFromTo(from: TilePoint, to: TilePoint): 'up' | 'down' | 'left' | 'right' {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
}
