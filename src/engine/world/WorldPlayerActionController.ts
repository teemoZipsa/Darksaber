import {
    applyStatus,
    createStatus,
    getEffectiveStatsForCharacter,
    hasStatus,
} from '../../combat/StatusEffects';
import type { Enemy } from '../../entity/Enemy';
import type { LootObject } from '../../entity/LootObject';
import type { FieldPassableQuery, TilePoint } from '../../field/FieldPathing';
import {
    findPathWithCost,
    findReachableTilesByCost,
    manhattan,
    tileKey,
    tilesInRange,
} from '../../field/FieldPathing';
import type { FieldActor, FieldEnemy, FieldIntent } from '../../field/FieldTypes';
import { getAttackFailureMessage, type AttackTargetFailure } from '../../field/FieldTargeting';
import {
    ATTACK_AP_COST,
    INTERACT_AP_COST,
    MAGIC_AP_COST,
    MOVE_AP_PER_TILE,
    hasExecutableFieldAction,
} from '../../field/FieldActionEconomy';
import { canAffordTerrainCost, terrainCostToApCost } from '../../field/TerrainRules';
import { getSelectableTiles, type AttackPatternProfile, type PatternContext } from '../../field/TargetPatterns';
import type { ActionType } from '../../ui/ActionMenuUI';
import type { resolveFieldHit } from '../../field/FieldInteraction';

type FieldHit = ReturnType<typeof resolveFieldHit>;

export interface WorldPlayerActionContext {
    getActivePartyTurnActor: () => FieldActor | null;
    getPartyActors: () => FieldActor[];
    getFieldEnemies: () => FieldEnemy[];
    getRemainingActionPoints: () => number;
    getReservedAction: () => FieldIntent | null;
    getActiveTurnActorId: () => string | null;
    getActorTerrainMovementBudget: (actor: FieldActor) => number;
    getActorTerrainStepCost: (actor: FieldActor, tile: TilePoint) => number;
    getActorAttackProfile: (actor: FieldActor) => AttackPatternProfile;
    getPatternContext: (actor: FieldActor) => PatternContext;
    getActorAttackTargetFailure: (actor: FieldActor, enemy: Enemy) => AttackTargetFailure | null;
    getEnemyById: (enemyId: string) => Enemy | null;
    getLootById: (lootId: string) => LootObject | null;
    getLoot: () => LootObject[];
    isActorAt: (actor: FieldActor, tile: TilePoint) => boolean;
    isEntityMoving: (entity: FieldActor['entity'] | Enemy) => boolean;
    isFieldPassable: (query: FieldPassableQuery) => boolean;
    spendAp: (cost: number) => boolean;
    tryActorAttack: (actor: FieldActor, enemy: Enemy) => boolean;
    openLoot: (loot: LootObject) => void;
    openMagic: (actor: FieldActor) => void;
    hasCastableFieldSkill: (actor: FieldActor) => boolean;
    reopenActionMenu: (actor: FieldActor) => void;
    closeActionMenu: () => void;
    closeTacticalMenu: () => void;
    resumeOrEndActiveTurn: (actor: FieldActor) => void;
    endActorTurn: (actor: FieldActor, reason: string, atbCarryover?: number) => void;
    clearActorIntent: (actor: FieldActor) => void;
    setReservedAction: (intent: FieldIntent | null) => void;
    selectEnemy: (enemyId: string) => void;
    selectLoot: (lootId: string) => void;
}

export interface WorldPlayerActionEventSink {
    log(message: string): void;
    spawnHeal(x: number, y: number, amount: number): void;
    spawnStatus(x: number, y: number, text: string): void;
    spawnHealEffect(x: number, y: number): void;
    spawnBuffEffect(x: number, y: number): void;
}

export class WorldPlayerActionController {
    private readonly context: WorldPlayerActionContext;
    private readonly sink: WorldPlayerActionEventSink;
    private actionMode: 'move' | 'attack' | 'interact' | null = null;
    private actionTiles: Set<string> = new Set();

    constructor(context: WorldPlayerActionContext, sink: WorldPlayerActionEventSink) {
        this.context = context;
        this.sink = sink;
    }

    public getMode(): 'move' | 'attack' | 'interact' | null {
        return this.actionMode;
    }

    public getTiles(): Set<string> {
        return this.actionTiles;
    }

    public clearTargeting(): void {
        this.actionMode = null;
        this.actionTiles.clear();
    }

    public execute(action: ActionType): void {
        const actor = this.context.getActivePartyTurnActor();
        if (!actor) return;

        if (actor.entity.actionGauge < 100 || this.context.getActiveTurnActorId() !== actor.id) {
            this.sink.log('행동 게이지가 차지 않았습니다.');
            this.context.closeActionMenu();
            return;
        }

        this.context.closeActionMenu();
        this.clearTargeting();

        switch (action) {
            case 'move':
                if (hasStatus(actor.character.statuses, 'immobilize')) {
                    this.sink.log('이동불가 상태입니다.');
                    this.context.reopenActionMenu(actor);
                    break;
                }
                if (this.context.getRemainingActionPoints() < MOVE_AP_PER_TILE || !this.hasExecutableMove(actor)) {
                    this.sink.log('이동할 행동력이 부족합니다.');
                    this.context.reopenActionMenu(actor);
                    break;
                }
                this.actionMode = 'move';
                this.actionTiles = this.computeWalkableTiles(actor);
                this.sink.log('이동할 타일을 클릭하세요.');
                break;
            case 'attack':
                if (this.context.getRemainingActionPoints() < ATTACK_AP_COST) {
                    this.sink.log('공격할 행동력이 부족합니다.');
                    this.context.reopenActionMenu(actor);
                    break;
                }
                this.actionMode = 'attack';
                this.actionTiles = this.computeAttackableTiles(actor);
                this.sink.log(this.hasExecutableAttack(actor) ? '공격할 적을 클릭하세요.' : '사거리 안의 적을 선택하세요.');
                break;
            case 'magic':
                this.context.closeTacticalMenu();
                this.context.openMagic(actor);
                break;
            case 'open':
                if (this.context.getRemainingActionPoints() < INTERACT_AP_COST || !this.hasExecutableInteract(actor)) {
                    this.sink.log('조사할 수 있는 대상이 없습니다.');
                    this.context.reopenActionMenu(actor);
                    break;
                }
                this.actionMode = 'interact';
                this.actionTiles = this.computeInteractTiles(actor);
                this.sink.log('조사할 상자나 전리품을 클릭하세요.');
                break;
            case 'rest':
                this.rest(actor);
                break;
            case 'defend':
                actor.character.statuses = applyStatus(actor.character.statuses, createStatus('guard'));
                this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'GUARD');
                this.sink.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
                this.sink.log('방어 태세: 다음 피격 피해 감소');
                this.context.endActorTurn(actor, '방어');
                break;
            case 'counter':
                actor.character.statuses = applyStatus(actor.character.statuses, createStatus('counterReady'));
                this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, 'COUNTER');
                this.sink.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
                this.sink.log('반격 태세: 다음 피격 시 반격 준비');
                this.context.endActorTurn(actor, '반격 태세');
                break;
            default:
                this.sink.log('아직 필드에서 사용할 수 없는 행동입니다.');
                break;
        }
    }

    public handleTargetClick(tile: TilePoint, hit: FieldHit): void {
        const actor = this.context.getActivePartyTurnActor();
        if (!actor) return;

        if (this.actionMode === 'attack') {
            this.handleAttackTarget(actor, hit);
            this.clearTargeting();
            return;
        }

        const selectedTileKey = tileKey(tile.x, tile.y);
        if (!this.actionTiles.has(selectedTileKey)) {
            this.sink.log('선택할 수 없는 위치입니다.');
            this.clearTargeting();
            return;
        }

        if (this.actionMode === 'move') {
            const queued = this.queueMoveIntent(actor, tile);
            if (queued) {
                this.sink.log(`이동 시작 (${tile.x}, ${tile.y})`);
            }
            this.clearTargeting();
            return;
        }

        if (this.actionMode === 'interact') {
            this.handleInteractTarget(actor, hit);
            this.clearTargeting();
        }
    }

    public processQueuedIntents(): void {
        for (const actor of this.context.getPartyActors()) {
            if (actor.character.isDead || actor.path.length > 0 || this.context.isEntityMoving(actor.entity) || !actor.queuedIntent) continue;

            if (actor.queuedIntent.kind === 'move') {
                actor.queuedIntent = null;
                const reserved = this.context.getReservedAction();
                if (reserved?.kind === 'move' && this.context.getActiveTurnActorId() === actor.id) {
                    this.context.setReservedAction(null);
                    this.context.resumeOrEndActiveTurn(actor);
                }
                continue;
            }

            if (actor.queuedIntent.kind === 'attack' && actor.queuedIntent.enemyId) {
                const enemy = this.context.getEnemyById(actor.queuedIntent.enemyId);
                if (enemy && enemy.stats.hp > 0) this.context.tryActorAttack(actor, enemy);
                else this.context.clearActorIntent(actor);
            }

            if (actor.queuedIntent.kind === 'interact' && actor.queuedIntent.lootId) {
                const loot = this.context.getLootById(actor.queuedIntent.lootId);
                if (loot && !loot.opened && manhattan(this.actorTile(actor), { x: loot.x, y: loot.y }) <= 1) {
                    this.context.openLoot(loot);
                }
                this.context.clearActorIntent(actor);
            }
        }
    }

    public getAvailableTurnActions(actor: FieldActor): ActionType[] {
        const available: ActionType[] = [];
        if (this.hasExecutableMove(actor)) available.push('move');
        if (this.hasExecutableAttack(actor)) available.push('attack');
        if (this.hasExecutableMagic(actor)) available.push('magic');
        if (this.hasExecutableInteract(actor)) available.push('open');
        available.push('defend', 'counter', 'rest');
        return available;
    }

    public hasExecutableAction(actor: FieldActor): boolean {
        return hasExecutableFieldAction({
            remainingAp: this.context.getRemainingActionPoints(),
            hasReachableMove: this.hasExecutableMove(actor),
            hasAttackTarget: this.hasExecutableAttack(actor),
            hasInteractTarget: this.hasExecutableInteract(actor),
            hasMagicAvailable: this.hasExecutableMagic(actor),
        });
    }

    public hasExecutableMove(actor: FieldActor): boolean {
        if (hasStatus(actor.character.statuses, 'immobilize')) return false;
        return this.context.getRemainingActionPoints() >= MOVE_AP_PER_TILE && this.computeWalkableTiles(actor).size > 0;
    }

    public hasExecutableAttack(actor: FieldActor): boolean {
        if (this.context.getRemainingActionPoints() < ATTACK_AP_COST) return false;
        return this.context.getFieldEnemies().some((entry) =>
            entry.enemy.stats.hp > 0 && this.context.getActorAttackTargetFailure(actor, entry.enemy) === null
        );
    }

    public hasExecutableInteract(actor: FieldActor): boolean {
        return this.context.getRemainingActionPoints() >= INTERACT_AP_COST && this.hasAdjacentLoot(actor);
    }

    public hasExecutableMagic(actor: FieldActor): boolean {
        if (hasStatus(actor.character.statuses, 'silence')) return false;
        return this.context.getRemainingActionPoints() >= MAGIC_AP_COST && this.context.hasCastableFieldSkill(actor);
    }

    private rest(actor: FieldActor): void {
        const effective = getEffectiveStatsForCharacter(actor.character);
        actor.character.stats.hp = Math.min(effective.maxHp, actor.character.stats.hp + 5);
        actor.character.stats.mp = Math.min(effective.maxMp, actor.character.stats.mp + 3);
        this.sink.spawnHeal(actor.entity.gridX, actor.entity.gridY, 5);
        this.sink.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);
        this.sink.log('휴식: HP +5, MP +3 회복. 다음 행동 게이지는 보존되지 않습니다.');
        this.context.endActorTurn(actor, '휴식');
    }

    private handleAttackTarget(actor: FieldActor, hit: FieldHit): void {
        if (hit.kind !== 'enemy') {
            this.sink.log('공격할 적이 없습니다.');
            return;
        }

        const enemy = this.context.getEnemyById(hit.enemy.id);
        if (!enemy) {
            this.sink.log('공격할 적이 없습니다.');
            return;
        }

        this.context.selectEnemy(enemy.id);
        const failure = this.context.getActorAttackTargetFailure(actor, enemy);
        if (failure) {
            this.sink.log(getAttackFailureMessage(failure));
            return;
        }
        if (this.context.spendAp(ATTACK_AP_COST) && this.context.tryActorAttack(actor, enemy)) {
            this.context.resumeOrEndActiveTurn(actor);
        }
    }

    private handleInteractTarget(actor: FieldActor, hit: FieldHit): void {
        if (hit.kind !== 'loot') {
            this.sink.log('조사할 대상이 없습니다.');
            return;
        }

        const loot = this.context.getLootById(hit.loot.id);
        if (!loot) {
            this.sink.log('조사할 대상이 없습니다.');
            return;
        }

        this.context.selectLoot(loot.id);
        if (!this.context.spendAp(INTERACT_AP_COST)) {
            this.sink.log('조사할 행동력이 부족합니다.');
            return;
        }
        this.context.openLoot(loot);
        this.context.resumeOrEndActiveTurn(actor);
    }

    private queueMoveIntent(actor: FieldActor, tile: TilePoint): boolean {
        const movementBudget = this.context.getActorTerrainMovementBudget(actor);
        const pathResult = findPathWithCost(this.actorTile(actor), tile, (query) => this.context.isFieldPassable(query), (step) => this.context.getActorTerrainStepCost(actor, step), {
            actorId: actor.id,
            intent: 'move',
            maxNodes: 8000,
            maxCost: movementBudget,
        });
        const path = pathResult.path;
        if (path.length === 0 && !this.context.isActorAt(actor, tile)) {
            this.context.clearActorIntent(actor);
            this.sink.log('이동 경로를 찾지 못했습니다.');
            return false;
        }

        const apCost = terrainCostToApCost(pathResult.cost);
        if (!this.context.spendAp(apCost)) {
            this.sink.log('이동할 행동력이 부족합니다.');
            return false;
        }

        actor.path = path;
        actor.queuedIntent = { kind: 'move', tile, path, apCost, pathCost: pathResult.cost };
        this.context.setReservedAction(actor.queuedIntent);
        this.context.closeActionMenu();
        return true;
    }

    private computeWalkableTiles(actor: FieldActor): Set<string> {
        const result = new Set<string>();
        const start = this.actorTile(actor);
        const movementBudget = this.context.getActorTerrainMovementBudget(actor);
        const maxCost = Math.min(
            movementBudget,
            this.context.getRemainingActionPoints() / MOVE_AP_PER_TILE
        );
        if (maxCost <= 0) return result;

        const reachable = findReachableTilesByCost(
            start,
            (query) => this.context.isFieldPassable(query),
            (tile) => this.context.getActorTerrainStepCost(actor, tile),
            maxCost,
            { actorId: actor.id, intent: 'move', maxNodes: 8000 }
        );

        for (const [key, reachableTile] of reachable) {
            if (
                reachableTile.cost <= movementBudget + 1e-9 &&
                canAffordTerrainCost(reachableTile.cost, this.context.getRemainingActionPoints())
            ) {
                result.add(key);
            }
        }

        return result;
    }

    private computeAttackableTiles(actor: FieldActor): Set<string> {
        const result = new Set<string>();
        const profile = this.context.getActorAttackProfile(actor);
        for (const tile of getSelectableTiles(profile, this.context.getPatternContext(actor))) {
            result.add(tileKey(tile.x, tile.y));
        }
        return result;
    }

    private computeInteractTiles(actor: FieldActor): Set<string> {
        const result = new Set<string>();
        const start = this.actorTile(actor);
        for (const tile of tilesInRange(start, 1)) {
            if (tile.x === start.x && tile.y === start.y) continue;
            result.add(tileKey(tile.x, tile.y));
        }
        return result;
    }

    private hasAdjacentLoot(actor: FieldActor): boolean {
        const actorTile = this.actorTile(actor);
        return this.context.getLoot().some((loot) =>
            !loot.opened && manhattan(actorTile, { x: loot.x, y: loot.y }) <= 1
        );
    }

    private actorTile(actor: FieldActor): TilePoint {
        return { x: actor.entity.gridX, y: actor.entity.gridY };
    }
}
