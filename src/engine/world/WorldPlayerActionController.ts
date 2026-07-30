import {
    createStatus,
    hasStatus,
    replaceActionStanceStatuses,
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
import type { FieldActor, FieldEnemy, FieldIntent, FieldTurnEndReason } from '../../field/FieldTypes';
import { getAttackFailureMessage, type AttackTargetFailure } from '../../field/FieldTargeting';
import {
    ATTACK_ACTION_GAUGE_COST,
    DEFEND_ACTION_GAUGE_COST,
    INTERACT_ACTION_GAUGE_COST,
    MAGIC_ACTION_GAUGE_COST,
    MIN_FIELD_ACTION_GAUGE_COST,
    MOVE_ACTION_GAUGE_COST,
    REST_ACTION_GAUGE_COST,
    TOOL_ACTION_GAUGE_COST,
    getActionApCost,
    hasExecutableFieldAction,
    type FieldApAction,
} from '../../field/FieldActionEconomy';
import { getSelectableTiles, type AttackPatternProfile, type PatternContext } from '../../field/TargetPatterns';
import { formatT, t } from '../../i18n/LanguageManager';
import { normalizeLegacyActionType, type ActionMenuSlotState, type ActionType } from '../../ui/ActionMenuUI';
import type { resolveFieldHit } from '../../field/FieldInteraction';

type FieldHit = ReturnType<typeof resolveFieldHit>;

export interface CombatToolAvailability {
    hasRecoveryConsumable: boolean;
    hasEffectiveRecovery: boolean;
}

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
    getBlockedMoveMessage?: (tile: TilePoint, actor: FieldActor) => string | null;
    spendAp: (cost: number) => boolean;
    restoreAp?: (actor: FieldActor, points: number) => void;
    isMajorActionUsed: () => boolean;
    markMajorActionUsed: () => void;
    getFanfareLeaderId?: () => string | null;
    setFanfareLeaderId?: (actorId: string | null) => void;
    getFanfareFollowerCount?: (actor: FieldActor) => number;
    isNetworkRaid?: () => boolean;
    canSubmitMoveIntent?: () => boolean;
    submitMoveIntent?: (actor: FieldActor, tile: TilePoint, path: TilePoint[], apCost: number, pathCost: number) => boolean;
    submitActionIntent?: (actor: FieldActor, action: 'defend' | 'rest') => boolean;
    tryActorAttack: (actor: FieldActor, enemy: Enemy) => boolean;
    openLoot: (loot: LootObject) => void;
    openMagic: (actor: FieldActor) => void;
    openTool: (actor: FieldActor) => void;
    hasCastableFieldSkill: (actor: FieldActor) => boolean;
    hasUsableCombatTool: (actor: FieldActor) => boolean;
    getCombatToolAvailability: (actor: FieldActor) => CombatToolAvailability;
    reopenActionMenu: (actor: FieldActor) => void;
    closeActionMenu: () => void;
    closeTacticalMenu: () => void;
    resumeOrEndActiveTurn: (actor: FieldActor) => void;
    endActorTurn: (actor: FieldActor, reason: FieldTurnEndReason, atbCarryover?: number) => void;
    clearActorIntent: (actor: FieldActor) => void;
    setReservedAction: (intent: FieldIntent | null) => void;
    selectEnemy: (enemyId: string) => void;
    selectLoot: (lootId: string) => void;
    filterActionTiles?: (action: 'move' | 'attack' | 'interact', actor: FieldActor, tiles: Set<string>) => Set<string>;
    getAdditionalInteractTiles?: (actor: FieldActor) => Set<string>;
    interactAtTile?: (actor: FieldActor, tile: TilePoint) => boolean;
    onActionCompleted?: (action: FieldApAction) => void;
}

export interface WorldPlayerActionEventSink {
    log(message: string): void;
    spawnHeal(x: number, y: number, amount: number): void;
    spawnStatus(x: number, y: number, text: string): void;
    spawnHealEffect(x: number, y: number): void;
    spawnBuffEffect(x: number, y: number): void;
}

export interface MoveTargetPreview {
    path: TilePoint[];
    pathCost: number;
    movementBudget: number;
}

export class WorldPlayerActionController {
    private readonly context: WorldPlayerActionContext;
    private readonly sink: WorldPlayerActionEventSink;
    private actionMode: 'move' | 'attack' | 'interact' | null = null;
    private actionTiles: Set<string> = new Set();
    private moveTargetPreviewCache: {
        key: string;
        preview: MoveTargetPreview;
    } | null = null;

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

    public getMoveTargetPreview(tile: TilePoint): MoveTargetPreview | null {
        if (this.actionMode !== 'move') return null;

        const actor = this.context.getActivePartyTurnActor();
        if (!actor || this.context.getActiveTurnActorId() !== actor.id) return null;
        if (!this.actionTiles.has(tileKey(tile.x, tile.y))) return null;

        const start = this.actorTile(actor);
        const movementBudget = this.context.getActorTerrainMovementBudget(actor);
        const cacheKey = [
            actor.id,
            start.x,
            start.y,
            tile.x,
            tile.y,
            movementBudget,
        ].join(':');
        if (this.moveTargetPreviewCache?.key === cacheKey) {
            return this.moveTargetPreviewCache.preview;
        }

        const pathResult = this.findMovePath(actor, tile, movementBudget);
        if (pathResult.path.length === 0) return null;

        const preview = {
            path: pathResult.path,
            pathCost: pathResult.cost,
            movementBudget,
        };
        this.moveTargetPreviewCache = { key: cacheKey, preview };
        return preview;
    }

    public clearTargeting(): void {
        this.actionMode = null;
        this.actionTiles.clear();
        this.moveTargetPreviewCache = null;
    }

    public execute(action: ActionType | string): void {
        const normalizedAction = normalizeLegacyActionType(action);
        if (!normalizedAction) {
            this.sink.log(t('field.action.unavailable'));
            return;
        }

        const actor = this.context.getActivePartyTurnActor();
        if (!actor) return;

        if (this.context.getActiveTurnActorId() !== actor.id) {
            this.sink.log(t('field.action.turnNotReady'));
            this.context.closeActionMenu();
            return;
        }

        const actionState = this.getActionState(actor, normalizedAction);
        if (!actionState.enabled) {
            this.sink.log(actionState.disabledReason ?? t('field.action.useBlocked'));
            this.context.reopenActionMenu(actor);
            return;
        }

        this.context.closeActionMenu();
        this.clearTargeting();

        switch (normalizedAction) {
            case 'move':
                if (hasStatus(actor.character.statuses, 'immobilize')) {
                    this.sink.log(t('field.action.moveImmobilizedLog'));
                    this.context.reopenActionMenu(actor);
                    break;
                }
                if (!this.hasActionGauge(MOVE_ACTION_GAUGE_COST) || !this.hasExecutableMove(actor)) {
                    this.sink.log(t('field.action.moveNoAp'));
                    this.context.reopenActionMenu(actor);
                    break;
                }
                this.actionMode = 'move';
                this.actionTiles = this.getFilteredActionTiles('move', actor, this.computeWalkableTiles(actor));
                this.sink.log(t('field.action.movePrompt'));
                break;
            case 'attack':
                this.actionMode = 'attack';
                this.actionTiles = this.getFilteredActionTiles('attack', actor, this.computeAttackableTiles(actor));
                this.sink.log(formatT('field.log.attackPrompt', { cost: this.costLabel(ATTACK_ACTION_GAUGE_COST) }));
                break;
            case 'magic':
                this.context.closeTacticalMenu();
                this.context.openMagic(actor);
                break;
            case 'tool':
                this.context.closeTacticalMenu();
                this.context.openTool(actor);
                break;
            case 'open':
                if (!this.hasActionGauge(INTERACT_ACTION_GAUGE_COST) || !this.hasExecutableInteract(actor)) {
                    this.sink.log(t('field.action.interactNoTarget'));
                    this.context.reopenActionMenu(actor);
                    break;
                }
                this.actionMode = 'interact';
                this.actionTiles = this.getFilteredActionTiles('interact', actor, this.computeInteractTiles(actor));
                this.sink.log(t('field.action.interactPrompt'));
                break;
            case 'rest':
                this.rest(actor);
                break;
            case 'defend':
                if (!this.spendActionCost(DEFEND_ACTION_GAUGE_COST)) {
                    this.sink.log(t('field.action.defendNoAp'));
                    this.context.reopenActionMenu(actor);
                    break;
                }
                this.context.submitActionIntent?.(actor, 'defend');
                actor.character.statuses = replaceActionStanceStatuses(actor.character.statuses, [
                    createStatus('guard', { durationTurns: undefined, sourceType: 'action' }),
                    createStatus('counterReady', { durationTurns: undefined, sourceType: 'action' }),
                ]);
                this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, t('field.action.defendStatus'));
                this.sink.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
                this.sink.log(t('field.action.defendLog'));
                this.context.resumeOrEndActiveTurn(actor);
                break;
            case 'fanfare':
                this.toggleFanfare(actor);
                break;
            default:
                this.sink.log(t('field.action.unavailable'));
                break;
        }
    }

    public handleTargetClick(tile: TilePoint, hit: FieldHit): void {
        const actor = this.context.getActivePartyTurnActor();
        if (!actor) return;

        if (this.actionMode === 'attack') {
            if (this.handleAttackTarget(actor, hit)) this.clearTargeting();
            return;
        }

        const selectedTileKey = tileKey(tile.x, tile.y);
        if (!this.actionTiles.has(selectedTileKey)) {
            const blockedMessage = this.actionMode === 'move'
                ? this.context.getBlockedMoveMessage?.(tile, actor)
                : null;
            this.sink.log(blockedMessage ?? t('field.action.moveInvalid'));
            return;
        }

        if (this.actionMode === 'move') {
            const queued = this.queueMoveIntent(actor, tile);
            if (queued) {
                this.sink.log(formatT('field.action.moveStarted', { x: tile.x, y: tile.y }));
                this.clearTargeting();
            }
            return;
        }

        if (this.actionMode === 'interact') {
            if (this.handleInteractTarget(actor, tile, hit)) this.clearTargeting();
        }
    }

    public processQueuedIntents(): void {
        for (const actor of this.context.getPartyActors()) {
            if (actor.character.isDead || actor.path.length > 0 || this.context.isEntityMoving(actor.entity) || !actor.queuedIntent) continue;

            if (actor.queuedIntent.kind === 'move') {
                actor.queuedIntent = null;
                this.context.onActionCompleted?.('move');
                const reserved = this.context.getReservedAction();
                if (reserved?.kind === 'move' && this.context.getActiveTurnActorId() === actor.id) {
                    this.context.setReservedAction(null);
                    this.context.resumeOrEndActiveTurn(actor);
                }
                continue;
            }

            if (actor.queuedIntent.kind === 'attack' && actor.queuedIntent.enemyId) {
                const enemy = this.context.getEnemyById(actor.queuedIntent.enemyId);
                if (enemy && enemy.stats.hp > 0) {
                    actor.entity.faceToward(enemy.gridX, enemy.gridY);
                    const attacked = this.context.tryActorAttack(actor, enemy);
                    if (attacked) actor.entity.playActionMotion('attack');
                }
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
        return this.getTurnActionStates(actor)
            .filter((state) => state.enabled)
            .map((state) => state.type);
    }

    public getTurnActionStates(actor: FieldActor): ActionMenuSlotState[] {
        return [
            this.getActionState(actor, 'attack'),
            this.getActionState(actor, 'magic'),
            this.getActionState(actor, 'tool'),
            this.getActionState(actor, 'open'),
            this.getActionState(actor, 'rest'),
            this.getActionState(actor, 'fanfare'),
            this.getActionState(actor, 'defend'),
            this.getActionState(actor, 'move'),
        ];
    }

    public hasExecutableAction(actor: FieldActor): boolean {
        return hasExecutableFieldAction({
            remainingAp: this.context.getRemainingActionPoints(),
            hasReachableMove: this.hasExecutableMove(actor),
            hasAttackTarget: this.hasExecutableAttack(actor),
            hasInteractTarget: this.hasExecutableInteract(actor),
            hasMagicAvailable: this.hasExecutableMagic(actor),
            hasToolAvailable: this.hasExecutableTool(actor),
        });
    }

    public hasExecutableMove(actor: FieldActor): boolean {
        if (hasStatus(actor.character.statuses, 'immobilize')) return false;
        return this.hasActionGauge(MOVE_ACTION_GAUGE_COST) && this.computeWalkableTiles(actor).size > 0;
    }

    public hasExecutableAttack(actor: FieldActor): boolean {
        if (!this.hasActionGauge(ATTACK_ACTION_GAUGE_COST)) return false;
        return this.context.getFieldEnemies().some((entry) =>
            entry.enemy.stats.hp > 0 && this.context.getActorAttackTargetFailure(actor, entry.enemy) === null
        );
    }

    public hasExecutableInteract(actor: FieldActor): boolean {
        return this.hasActionGauge(INTERACT_ACTION_GAUGE_COST)
            && (this.hasAdjacentLoot(actor) || this.hasAdditionalInteractTarget(actor));
    }

    public hasExecutableMagic(actor: FieldActor): boolean {
        if (hasStatus(actor.character.statuses, 'silence')) return false;
        return this.hasActionGauge(MAGIC_ACTION_GAUGE_COST) && this.context.hasCastableFieldSkill(actor);
    }

    public hasExecutableTool(actor: FieldActor): boolean {
        return this.hasActionGauge(TOOL_ACTION_GAUGE_COST) && this.context.hasUsableCombatTool(actor);
    }

    private getActionState(actor: FieldActor, type: ActionType): ActionMenuSlotState {
        const remainingAp = this.context.getRemainingActionPoints();
        switch (type) {
            case 'attack': {
                const targetAvailable = this.context.getFieldEnemies().some((entry) =>
                    entry.enemy.stats.hp > 0 && this.context.getActorAttackTargetFailure(actor, entry.enemy) === null
                );
                return this.buildState(type, remainingAp >= ATTACK_ACTION_GAUGE_COST && targetAvailable,
                    remainingAp < ATTACK_ACTION_GAUGE_COST ? t('ui.actionGaugeLow') : t('field.action.attackNone'),
                    this.costLabel(ATTACK_ACTION_GAUGE_COST));
            }
            case 'magic':
                return this.buildState(type, !hasStatus(actor.character.statuses, 'silence') && remainingAp >= MAGIC_ACTION_GAUGE_COST && this.context.hasCastableFieldSkill(actor),
                    hasStatus(actor.character.statuses, 'silence') ? t('field.action.magicSilenced')
                        : remainingAp < MAGIC_ACTION_GAUGE_COST ? t('ui.actionGaugeLow')
                            : t('field.action.magicNone'),
                    this.costLabel(MAGIC_ACTION_GAUGE_COST));
            case 'tool': {
                const tool = this.context.getCombatToolAvailability(actor);
                return this.buildState(type, remainingAp >= TOOL_ACTION_GAUGE_COST && tool.hasEffectiveRecovery,
                    remainingAp < TOOL_ACTION_GAUGE_COST ? t('ui.actionGaugeLow')
                        : !tool.hasRecoveryConsumable ? t('field.action.toolNone')
                            : t('field.action.toolNoEffect'),
                    this.costLabel(TOOL_ACTION_GAUGE_COST));
            }
            case 'move':
                return this.buildState(type, this.hasExecutableMove(actor),
                    hasStatus(actor.character.statuses, 'immobilize') ? t('field.action.moveImmobilized')
                        : remainingAp < MOVE_ACTION_GAUGE_COST ? t('ui.actionGaugeLow')
                            : t('field.action.moveNone'),
                    this.costLabel(MOVE_ACTION_GAUGE_COST));
            case 'open':
                return this.buildState(type, this.hasExecutableInteract(actor),
                    remainingAp < INTERACT_ACTION_GAUGE_COST ? t('ui.actionGaugeLow') : t('field.action.interactNone'),
                    this.costLabel(INTERACT_ACTION_GAUGE_COST));
            case 'defend':
                return this.buildState(type, remainingAp >= DEFEND_ACTION_GAUGE_COST, t('ui.actionGaugeLow'), this.costLabel(DEFEND_ACTION_GAUGE_COST));
            case 'rest':
                return this.buildState(type, remainingAp >= REST_ACTION_GAUGE_COST, t('ui.actionGaugeLow'), this.costLabel(REST_ACTION_GAUGE_COST));
            case 'fanfare': {
                const followerCount = this.context.getFanfareFollowerCount?.(actor) ?? Math.max(0, this.context.getPartyActors().filter((entry) => entry !== actor && !entry.character.isDead).length);
                const isActiveLeader = this.context.getFanfareLeaderId?.() === actor.id;
                return {
                    type,
                    enabled: followerCount > 0,
                    costLabel: t('field.action.free'),
                    disabledReason: followerCount > 0 ? undefined : t('field.action.fanfareNoFollowers'),
                    highlighted: isActiveLeader,
                    emphasisLabel: isActiveLeader ? t('field.action.fanfareActive') : undefined,
                };
            }
        }
    }

    private buildState(type: ActionType, enabled: boolean, disabledReason: string, costLabel: string): ActionMenuSlotState {
        return {
            type,
            enabled,
            costLabel,
            disabledReason: enabled ? undefined : disabledReason,
        };
    }

    private rest(actor: FieldActor): void {
        if (!this.spendActionCost(REST_ACTION_GAUGE_COST)) {
            this.sink.log(t('field.action.restNoAp'));
            this.context.reopenActionMenu(actor);
            return;
        }
        this.context.submitActionIntent?.(actor, 'rest');
        actor.character.statuses = replaceActionStanceStatuses(actor.character.statuses, [
            createStatus('resting', { sourceType: 'action' }),
        ]);
        this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, t('field.action.restStatus'));
        this.sink.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);
        this.sink.log(t('field.action.restLog'));
        this.context.onActionCompleted?.('rest');
        this.context.resumeOrEndActiveTurn(actor);
    }

    private toggleFanfare(actor: FieldActor): void {
        const followerCount = this.context.getFanfareFollowerCount?.(actor) ?? Math.max(0, this.context.getPartyActors().filter((entry) => entry !== actor && !entry.character.isDead).length);
        if (followerCount <= 0) {
            this.sink.log(t('field.action.fanfareNoFollowers'));
            this.context.reopenActionMenu(actor);
            return;
        }

        const isActiveLeader = this.context.getFanfareLeaderId?.() === actor.id;
        this.context.setFanfareLeaderId?.(isActiveLeader ? null : actor.id);
        this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, t('field.action.fanfareStatus'));
        this.sink.spawnBuffEffect(actor.entity.gridX, actor.entity.gridY);
        this.sink.log(isActiveLeader
            ? t('field.action.fanfareOff')
            : formatT('field.action.fanfareOn', { name: actor.character.name })
        );
        this.context.reopenActionMenu(actor);
    }

    private handleAttackTarget(actor: FieldActor, hit: FieldHit): boolean {
        if (hit.kind !== 'enemy') {
            this.sink.log(t('field.action.attackNone'));
            return false;
        }

        const enemy = this.context.getEnemyById(hit.enemy.id);
        if (!enemy) {
            this.sink.log(t('field.action.attackNone'));
            return false;
        }

        this.context.selectEnemy(enemy.id);
        const failure = this.context.getActorAttackTargetFailure(actor, enemy);
        if (failure) {
            this.sink.log(getAttackFailureMessage(failure));
            return false;
        }
        actor.entity.faceToward(enemy.gridX, enemy.gridY);
        if (!this.spendActionCost(ATTACK_ACTION_GAUGE_COST)) return false;

        if (this.context.tryActorAttack(actor, enemy)) {
            actor.entity.playActionMotion('attack');
            this.context.onActionCompleted?.('attack');
            this.context.resumeOrEndActiveTurn(actor);
        }
        return true;
    }

    private handleInteractTarget(actor: FieldActor, tile: TilePoint, hit: FieldHit): boolean {
        if (hit.kind !== 'loot') {
            if (this.tryAdditionalInteract(actor, tile)) return true;
            this.sink.log(t('field.action.interactNoTarget'));
            return false;
        }

        const loot = this.context.getLootById(hit.loot.id);
        if (!loot) {
            if (this.tryAdditionalInteract(actor, tile)) return true;
            this.sink.log(t('field.action.interactNoTarget'));
            return false;
        }

        this.context.selectLoot(loot.id);
        if (!this.spendActionCost(INTERACT_ACTION_GAUGE_COST)) {
            this.sink.log(t('field.action.interactNoAp'));
            return false;
        }
        this.context.openLoot(loot);
        this.context.resumeOrEndActiveTurn(actor);
        return true;
    }

    private tryAdditionalInteract(actor: FieldActor, tile: TilePoint): boolean {
        const additionalTiles = this.context.getAdditionalInteractTiles?.(actor);
        if (!additionalTiles?.has(tileKey(tile.x, tile.y))) return false;
        if (!this.spendActionCost(INTERACT_ACTION_GAUGE_COST)) {
            this.sink.log(t('field.action.interactNoAp'));
            return true;
        }
        const handled = this.context.interactAtTile?.(actor, tile) ?? false;
        if (!handled) {
            this.sink.log(t('field.action.interactNoTarget'));
            return true;
        }
        this.context.onActionCompleted?.('interact');
        this.context.resumeOrEndActiveTurn(actor);
        return true;
    }

    private queueMoveIntent(actor: FieldActor, tile: TilePoint): boolean {
        const movementBudget = this.context.getActorTerrainMovementBudget(actor);
        const pathResult = this.findMovePath(actor, tile, movementBudget);
        const path = pathResult.path;
        if (path.length === 0 && !this.context.isActorAt(actor, tile)) {
            this.context.clearActorIntent(actor);
            this.sink.log(this.context.getBlockedMoveMessage?.(tile, actor) ?? t('field.action.movePathMissing'));
            return false;
        }

        const apCost = getActionApCost('move');
        const networkRaid = this.context.isNetworkRaid?.() ?? false;
        if (networkRaid && !(this.context.canSubmitMoveIntent?.() ?? false)) {
            this.sink.log(t('mp.error.socketNotOpen'));
            return false;
        }
        const remainingActionPointsBeforeMove = this.context.getRemainingActionPoints();
        if (!this.spendActionCost(MOVE_ACTION_GAUGE_COST)) {
            this.sink.log(t('field.action.moveNoAp'));
            return false;
        }

        if (this.context.submitMoveIntent?.(actor, tile, path, apCost, pathResult.cost)) {
            this.context.closeActionMenu();
            return true;
        }
        if (networkRaid) {
            this.context.restoreAp?.(actor, remainingActionPointsBeforeMove);
            this.sink.log(t('mp.error.socketNotOpen'));
            return false;
        }

        actor.path = path;
        actor.queuedIntent = { kind: 'move', tile, path, apCost, pathCost: pathResult.cost };
        this.context.setReservedAction(actor.queuedIntent);
        this.context.closeActionMenu();
        return true;
    }

    private findMovePath(actor: FieldActor, tile: TilePoint, movementBudget: number) {
        return findPathWithCost(
            this.actorTile(actor),
            tile,
            (query) => this.context.isFieldPassable(query),
            (step) => this.context.getActorTerrainStepCost(actor, step),
            {
                actorId: actor.id,
                intent: 'move',
                maxNodes: 8000,
                maxCost: movementBudget,
            }
        );
    }

    private computeWalkableTiles(actor: FieldActor): Set<string> {
        const result = new Set<string>();
        const start = this.actorTile(actor);
        const movementBudget = this.context.getActorTerrainMovementBudget(actor);
        const maxCost = this.hasActionGauge(MOVE_ACTION_GAUGE_COST) ? movementBudget : 0;
        if (maxCost <= 0) return result;

        const reachable = findReachableTilesByCost(
            start,
            (query) => this.context.isFieldPassable(query),
            (tile) => this.context.getActorTerrainStepCost(actor, tile),
            maxCost,
            { actorId: actor.id, intent: 'move', maxNodes: 8000 }
        );

        for (const [key, reachableTile] of reachable) {
            if (reachableTile.cost <= movementBudget + 1e-9) {
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
        for (const tile of this.context.getAdditionalInteractTiles?.(actor) ?? []) result.add(tile);
        return result;
    }

    private hasAdjacentLoot(actor: FieldActor): boolean {
        const actorTile = this.actorTile(actor);
        return this.context.getLoot().some((loot) =>
            !loot.opened && manhattan(actorTile, { x: loot.x, y: loot.y }) <= 1
        );
    }

    private hasAdditionalInteractTarget(actor: FieldActor): boolean {
        return (this.context.getAdditionalInteractTiles?.(actor).size ?? 0) > 0;
    }

    private getFilteredActionTiles(action: 'move' | 'attack' | 'interact', actor: FieldActor, tiles: Set<string>): Set<string> {
        return this.context.filterActionTiles?.(action, actor, tiles) ?? tiles;
    }

    private hasActionGauge(cost: number = MIN_FIELD_ACTION_GAUGE_COST): boolean {
        return this.context.getRemainingActionPoints() >= cost;
    }

    private spendActionCost(cost: number): boolean {
        return this.context.spendAp(cost);
    }

    private costLabel(cost: number): string {
        return formatT('ui.actionGaugeCost', { cost });
    }

    private actorTile(actor: FieldActor): TilePoint {
        return { x: actor.entity.gridX, y: actor.entity.gridY };
    }
}
