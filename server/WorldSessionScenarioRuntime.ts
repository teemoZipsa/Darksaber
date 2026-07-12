import { getMonsterDefinition, type MonsterId } from '../src/data/MonsterCatalog';
import { getStoryQuestByDungeonId } from '../src/data/StoryQuestData';
import { getStoryScenarioByDungeonId, type StoryScenarioDefinition } from '../src/data/StoryScenarioData';
import { getStoryScenarioMonsterLayout } from '../src/data/StoryScenarioMonsterData';
import {
    getStoryScenarioEventSequence,
    type StoryScenarioEnemyDefeatEvent,
    type StoryScenarioEventStep,
} from '../src/data/StoryScenarioEventData';
import {
    getStoryScenarioFieldEventFlag,
    getStoryScenarioFieldEventScope,
    getStoryScenarioFieldEventTiles,
} from '../src/data/StoryScenarioFieldEventPlacement';
import {
    getStoryInteriorLayout,
    type StoryInteriorLayout,
} from '../src/data/StoryInteriorData';
import { Enemy } from '../src/entity/Enemy';
import { manhattan, type TilePoint } from '../src/field/FieldPathing';
import { INTERACT_ACTION_GAUGE_COST } from '../src/field/FieldActionEconomy';
import { WorldMap } from '../src/map/WorldMap';
import { getAmbientSiteOutcome } from '../src/raid/AmbientSiteRules';
import type {
    AmbientSiteResultMessage,
    ScenarioEnemyDefeatEventMessage,
    ScenarioFieldEventResultMessage,
    WorldClientMessage,
    WorldServerMessage,
} from '../src/net/WorldProtocol';
import { WorldSessionScenarioRewards } from './WorldSessionScenarioRewards';
import { formationOffset, hashInt, reject, storyScenarioGuardOffsets } from './WorldSessionHelpers';
import { hasNearbyAggroEnemy } from './WorldSessionSpatialQueries';
import type { WorldSessionSaveState } from './WorldSessionSaveState';
import type {
    ServerActor,
    ServerEnemy,
    ServerPlayer,
    ServerScenarioState,
    WorldSessionMessageResult,
} from './WorldSessionTypes';

export interface WorldSessionScenarioRuntimeContext {
    players: Map<string, ServerPlayer>;
    actors: Map<string, ServerActor>;
    enemies: Map<string, ServerEnemy>;
    scenarioStates: Map<string, ServerScenarioState>;
    sharedFieldEventFlags: Map<string, Set<string>>;
    worldMap: WorldMap;
    saveState: WorldSessionSaveState;
    rewards: WorldSessionScenarioRewards;
    allocateScenarioEnemyId: () => { id: string; seedOrdinal: number };
    findNearbyWalkableTile: (tile: TilePoint, actorId: string, ownerPlayerId?: string) => TilePoint;
    log: (message: string) => void;
    spendActorGauge: (actor: ServerActor, cost: number) => void;
    finishActorIfSpent: (actor: ServerActor) => void;
}

export interface WorldSessionScenarioEnemyKillResult {
    scenarioEnemyDefeatEvent?: ScenarioEnemyDefeatEventMessage;
    bossLootTile?: TilePoint;
}

export class WorldSessionScenarioRuntime {
    public constructor(private readonly context: WorldSessionScenarioRuntimeContext) {}

    public handleEnter(
        playerId: string,
        message: Extract<WorldClientMessage, { type: 'SCENARIO_ENTER' }>,
        now: number
    ): WorldSessionMessageResult {
        const player = this.context.players.get(playerId);
        const actor = this.context.actors.get(message.actorId);
        const validationError = this.validateScenarioActor(player, actor);
        if (validationError) return reject(message.intentId, validationError);

        const dungeonId = message.dungeonId.trim();
        const scenario = getStoryScenarioByDungeonId(dungeonId);
        const quest = getStoryQuestByDungeonId(dungeonId);
        if (!scenario || !quest) return reject(message.intentId, 'Scenario dungeon does not exist.');
        if (player!.activeDungeonId) return reject(message.intentId, 'A scenario is already active.');
        if (player!.completedDungeonIds.has(dungeonId)) return reject(message.intentId, 'Scenario objective is already complete in this raid.');
        if (quest.prerequisiteQuestId && !player!.completedQuestIds.has(quest.prerequisiteQuestId)) {
            return reject(message.intentId, 'Scenario prerequisite quest is not complete.');
        }

        const dungeon = this.context.worldMap.getDungeonAtTile(actor!.tile.x, actor!.tile.y);
        if (!dungeon || dungeon.id !== dungeonId) return reject(message.intentId, 'Actor is not at the requested scenario entrance.');
        if (hasNearbyAggroEnemy(this.context.enemies.values(), actor!.tile, 18, playerId)) {
            return reject(message.intentId, 'Nearby combat must be resolved before entering a scenario.');
        }

        const interiorLayout = getStoryInteriorLayout(dungeonId);
        const returnTile = interiorLayout ? { ...actor!.tile } : null;
        this.removePlayerRuntime(playerId);
        player!.enteredDungeonIds.add(dungeonId);
        player!.activeDungeonId = dungeonId;
        if (interiorLayout) this.placePlayerActorsInInterior(player!, interiorLayout);

        const state = this.spawnEncounter(player!, scenario, interiorLayout?.playerStart ?? actor!.tile, now, returnTile);
        this.context.scenarioStates.set(playerId, state);
        if (!state.objectiveEnemyId) this.completeObjective(player!, dungeonId, { clearEnemies: false });

        this.context.log(`scenario enter player=${playerId} dungeon=${dungeonId} enemies=${state.enemyIds.length}`);
        return { replies: [], broadcasts: [] };
    }

    public handleFieldEventInteract(
        playerId: string,
        message: Extract<WorldClientMessage, { type: 'SCENARIO_FIELD_EVENT_INTERACT' }>
    ): WorldSessionMessageResult {
        const player = this.context.players.get(playerId);
        const actor = this.context.actors.get(message.actorId);
        const validationError = this.validateScenarioActor(player, actor);
        if (validationError) return reject(message.intentId, validationError);

        const dungeonId = typeof message.dungeonId === 'string' ? message.dungeonId.trim() : '';
        const eventId = typeof message.eventId === 'string' ? message.eventId.trim() : '';
        if (!dungeonId || !eventId) return reject(message.intentId, 'Scenario field event request is malformed.');
        if (player!.activeDungeonId !== dungeonId) return reject(message.intentId, 'Scenario is not active for this player.');

        const sequence = getStoryScenarioEventSequence(dungeonId);
        const event = sequence?.fieldEvents.find((candidate) => candidate.id === eventId);
        if (!event) return reject(message.intentId, 'Scenario field event does not exist.');

        const flag = getStoryScenarioFieldEventFlag(event);
        const scope = getStoryScenarioFieldEventScope(event);
        if (this.isFieldEventFlagComplete(player!, dungeonId, flag, scope)) {
            return reject(message.intentId, 'Scenario field event is already complete.');
        }

        const triggerTiles = getStoryInteriorLayout(dungeonId)
            ? event.triggerTiles
            : getStoryScenarioFieldEventTiles(dungeonId, event, this.context.worldMap);
        if (!triggerTiles.some((tile) => manhattan(actor!.tile, tile) <= 1)) {
            return reject(message.intentId, 'Scenario field event is too far away.');
        }
        if (!this.context.rewards.canConsumeFieldEventUseItems(player!, event)) {
            return reject(message.intentId, 'Scenario field event requires a missing item.');
        }
        if (!this.context.rewards.rollFieldEventRandom(event)) {
            return reject(message.intentId, 'Scenario field event random condition failed.');
        }
        if (!this.context.rewards.canApplyRewards(player!, event.rewards)) {
            return reject(message.intentId, 'Scenario field event reward storage is full.');
        }

        this.markFieldEventFlagComplete(player!, dungeonId, flag, scope);
        this.context.rewards.consumeFieldEventUseItems(player!, event);
        const rewards = this.context.rewards.applyFieldEventRewards(player!, event);
        const trapDamage = this.context.rewards.applyFieldEventTrapMagic(actor!, event);
        if (event.completesObjective) this.completeObjective(player!, dungeonId, { clearEnemies: false });
        const result: ScenarioFieldEventResultMessage = {
            type: 'SCENARIO_FIELD_EVENT_RESULT',
            intentId: message.intentId,
            dungeonId,
            eventId: event.id,
            scope,
            flag,
            presentationSteps: event.steps.map((step) => ({ ...step })),
            rewards,
            ...(trapDamage ? { trapDamage } : {}),
        };
        const broadcasts: WorldServerMessage[] = scope === 'shared'
            ? [{
                type: 'SCENARIO_FIELD_EVENT_BROADCAST',
                dungeonId,
                eventId: event.id,
                scope: 'shared',
                flag,
                presentationSteps: event.steps.map((step) => ({ ...step })),
            }]
            : [];
        this.context.log(`scenario field event player=${playerId} dungeon=${dungeonId} event=${event.id} scope=${scope}`);
        return { replies: [result], broadcasts };
    }

    public handleAmbientSiteInteract(
        playerId: string,
        message: Extract<WorldClientMessage, { type: 'AMBIENT_SITE_INTERACT' }>
    ): WorldSessionMessageResult {
        const player = this.context.players.get(playerId);
        const actor = this.context.actors.get(message.actorId);
        const validationError = this.validateScenarioActor(player, actor);
        if (validationError) return reject(message.intentId, validationError);
        if (actor!.remainingAp < INTERACT_ACTION_GAUGE_COST) return reject(message.intentId, 'Actor action gauge is not ready.');
        if (player!.activeDungeonId) return reject(message.intentId, 'Ambient sites are unavailable inside a scenario.');

        const siteId = typeof message.siteId === 'string' ? message.siteId.trim() : '';
        const site = siteId ? this.context.worldMap.getAmbientSiteById(siteId) : null;
        if (!site) return reject(message.intentId, 'Ambient site does not exist.');
        if (player!.inspectedAmbientSiteIds.has(site.id)) return reject(message.intentId, 'Ambient site is already inspected.');
        if (manhattan(actor!.tile, site.anchorTile) > 1) return reject(message.intentId, 'Ambient site is too far away.');

        const outcome = getAmbientSiteOutcome(site.kind, site.id);
        if (!this.context.rewards.canApplyAmbientSiteRewards(player!, outcome.rewards)) {
            return reject(message.intentId, 'Ambient site reward storage is full.');
        }

        player!.inspectedAmbientSiteIds.add(site.id);
        const rewards = this.context.rewards.applyAmbientSiteRewards(player!, outcome.rewards);
        const trapDamage = this.context.rewards.applyAmbientSiteTrap(actor!, outcome.trapMaxHpRatio);
        this.context.spendActorGauge(actor!, INTERACT_ACTION_GAUGE_COST);
        this.context.finishActorIfSpent(actor!);
        const result: AmbientSiteResultMessage = {
            type: 'AMBIENT_SITE_RESULT',
            intentId: message.intentId,
            siteId: site.id,
            kind: site.kind,
            rewards,
            ...(trapDamage ? { trapDamage } : {}),
        };
        this.context.log(`ambient site player=${playerId} site=${site.id} kind=${site.kind}`);
        return { replies: [result], broadcasts: [] };
    }

    public completeEnemyKill(target: ServerEnemy, enemyId: string): WorldSessionScenarioEnemyKillResult {
        const scenarioEnemyDefeatEvent = this.createEnemyDefeatEventMessage(target);
        const scenarioState = target.scenarioPlayerId ? this.context.scenarioStates.get(target.scenarioPlayerId) : undefined;
        const bossLootTile = target.scenarioObjective && scenarioState?.returnTile
            ? { ...scenarioState.returnTile }
            : undefined;

        const playerId = target.scenarioPlayerId;
        const dungeonId = target.scenarioDungeonId;
        if (!playerId || !dungeonId) return { scenarioEnemyDefeatEvent, bossLootTile };

        const state = this.context.scenarioStates.get(playerId);
        if (state && state.dungeonId === dungeonId) {
            state.enemyIds = state.enemyIds.filter((id) => id !== enemyId);
        }

        if (!target.scenarioObjective) return { scenarioEnemyDefeatEvent, bossLootTile };
        const player = this.context.players.get(playerId);
        if (player) this.completeObjective(player, dungeonId, { clearEnemies: true });
        return { scenarioEnemyDefeatEvent, bossLootTile };
    }

    public removePlayerRuntime(playerId: string): void {
        const state = this.context.scenarioStates.get(playerId);
        if (!state) return;
        for (const enemyId of state.enemyIds) this.context.enemies.delete(enemyId);
        this.context.scenarioStates.delete(playerId);
    }

    private validateScenarioActor(player: ServerPlayer | undefined, actor: ServerActor | undefined): string | null {
        if (!player || !player.active) return 'Player is not in an active raid.';
        if (player.ghost) return 'Ghost players cannot enter scenarios.';
        if (!actor) return 'Actor does not exist.';
        if (actor.ownerPlayerId !== player.id) return 'Actor is not owned by this player.';
        if (actor.isDead || actor.stats.hp <= 0) return 'Actor is down.';
        return null;
    }

    private placePlayerActorsInInterior(player: ServerPlayer, layout: StoryInteriorLayout): void {
        player.actorIds.forEach((actorId, index) => {
            const actor = this.context.actors.get(actorId);
            if (!actor) return;
            const offset = formationOffset(index);
            const tile = this.context.findNearbyWalkableTile({
                x: layout.playerStart.x + offset.x,
                y: layout.playerStart.y + offset.y,
            }, actor.id, player.id);
            actor.tile = tile;
            actor.facing = 'right';
        });
    }

    private returnPlayerActorsFromInterior(player: ServerPlayer, returnTile: TilePoint): void {
        player.actorIds.forEach((actorId, index) => {
            const actor = this.context.actors.get(actorId);
            if (!actor) return;
            const offset = formationOffset(index);
            const tile = this.context.findNearbyWalkableTile({
                x: returnTile.x + offset.x,
                y: returnTile.y + offset.y,
            }, actor.id);
            actor.tile = tile;
            actor.facing = 'down';
        });
    }

    private spawnEncounter(
        player: ServerPlayer,
        scenario: StoryScenarioDefinition,
        anchor: TilePoint,
        now: number,
        returnTile: TilePoint | null = null
    ): ServerScenarioState {
        const state: ServerScenarioState = {
            playerId: player.id,
            dungeonId: scenario.dungeonId,
            missionKind: scenario.missionKind,
            returnTile: returnTile ? { ...returnTile } : null,
            enemyIds: [],
            objectiveEnemyId: null,
            completed: false,
        };
        const layout = getStoryScenarioMonsterLayout(scenario);
        const interiorLayout = getStoryInteriorLayout(scenario.dungeonId);
        const guardOffsets = layout.guardOffsets ?? storyScenarioGuardOffsets(scenario.guardCount, Boolean(scenario.bossName));

        for (let index = 0; index < scenario.guardCount; index++) {
            const monsterId = layout.guardMonsterIds[index % layout.guardMonsterIds.length];
            const definition = getMonsterDefinition(monsterId);
            const offset = guardOffsets[index] ?? { x: index % 2 === 0 ? 2 : -2, y: Math.floor(index / 2) + 1 };
            const tile = interiorLayout?.guardTiles[index] ?? { x: anchor.x + offset.x, y: anchor.y + offset.y };
            this.spawnEnemy({
                state,
                monsterId,
                name: definition.name,
                level: Math.max(scenario.guardLevel, definition.level),
                color: definition.color,
                role: definition.role,
                tile,
                isObjective: false,
                now,
            });
        }

        if (scenario.bossName) {
            const monsterId = layout.bossMonsterId;
            const definition = monsterId ? getMonsterDefinition(monsterId) : null;
            const objectiveEnemyId = this.spawnEnemy({
                state,
                monsterId,
                name: scenario.bossName,
                level: scenario.bossLevel,
                color: scenario.bossColor,
                role: 'boss',
                tile: interiorLayout?.bossTile ?? { x: anchor.x + (layout.bossOffset?.x ?? 4), y: anchor.y + (layout.bossOffset?.y ?? 0) },
                isObjective: true,
                now,
                aggroRange: Math.max(definition?.aggroRange ?? 0, 9),
            });
            state.objectiveEnemyId = objectiveEnemyId;
        }

        return state;
    }

    private spawnEnemy(input: {
        state: ServerScenarioState;
        monsterId?: MonsterId;
        name: string;
        level: number;
        color: string;
        role: Enemy['role'];
        tile: TilePoint;
        isObjective: boolean;
        now: number;
        aggroRange?: number;
    }): string {
        const allocated = this.context.allocateScenarioEnemyId();
        const tile = this.context.findNearbyWalkableTile(input.tile, allocated.id, input.state.playerId);
        const definition = input.monsterId ? getMonsterDefinition(input.monsterId) : null;
        const enemy = new Enemy(allocated.id, tile.x, tile.y, input.name, input.level, input.color, input.role, input.monsterId);
        enemy.aggroRange = input.aggroRange ?? definition?.aggroRange ?? enemy.aggroRange;
        enemy.isAggro = true;
        this.context.enemies.set(allocated.id, {
            enemy,
            monsterId: input.monsterId,
            scenarioPlayerId: input.state.playerId,
            scenarioDungeonId: input.state.dungeonId,
            scenarioObjective: input.isObjective,
            home: tile,
            wanderSeed: hashInt(input.now + allocated.seedOrdinal * 7919),
        });
        input.state.enemyIds.push(allocated.id);
        return allocated.id;
    }

    private createEnemyDefeatEventMessage(target: ServerEnemy): ScenarioEnemyDefeatEventMessage | undefined {
        if (target.scenarioObjective || !target.scenarioPlayerId || !target.scenarioDungeonId) return undefined;
        const event = this.getEnemyDefeatEvent(target);
        if (!event) return undefined;
        const focus = { x: target.enemy.gridX, y: target.enemy.gridY };
        return {
            type: 'SCENARIO_ENEMY_DEFEAT_EVENT',
            dungeonId: target.scenarioDungeonId,
            enemyId: target.enemy.id,
            eventId: event.id,
            presentationSteps: event.steps.map((step) => this.withEnemyDefeatFocus(step, focus)),
        };
    }

    private getEnemyDefeatEvent(target: ServerEnemy): StoryScenarioEnemyDefeatEvent | undefined {
        if (!target.scenarioPlayerId || !target.scenarioDungeonId) return undefined;
        const state = this.context.scenarioStates.get(target.scenarioPlayerId);
        if (!state || state.dungeonId !== target.scenarioDungeonId) return undefined;
        const scenarioEnemyIndex = state.enemyIds.indexOf(target.enemy.id);
        if (scenarioEnemyIndex < 0) return undefined;
        return getStoryScenarioEventSequence(target.scenarioDungeonId)?.enemyDefeatEvents
            ?.find((event) => event.scenarioEnemyIndex === scenarioEnemyIndex);
    }

    private withEnemyDefeatFocus(step: StoryScenarioEventStep, focus: TilePoint): StoryScenarioEventStep {
        if (step.kind === 'focus') return { ...step, target: { ...focus } };
        return { ...step, focus: { ...focus } };
    }

    private completeObjective(
        player: ServerPlayer,
        dungeonId: string,
        options: { clearEnemies?: boolean }
    ): void {
        const state = this.context.scenarioStates.get(player.id);
        if (player.activeDungeonId === dungeonId) player.activeDungeonId = null;
        player.completedDungeonIds.add(dungeonId);
        const quest = getStoryQuestByDungeonId(dungeonId);
        if (quest) player.completedQuestIds.add(quest.id);
        this.context.rewards.applyBossDefeatRewards(player, dungeonId);
        if (state?.returnTile) this.returnPlayerActorsFromInterior(player, state.returnTile);
        this.context.saveState.markDirty(player.id);

        if (state && state.dungeonId === dungeonId) {
            state.completed = true;
            if (options.clearEnemies ?? true) this.removePlayerRuntime(player.id);
        }
        this.context.log(`scenario complete player=${player.id} dungeon=${dungeonId}`);
    }

    private isFieldEventFlagComplete(
        player: ServerPlayer,
        dungeonId: string,
        flag: string,
        scope: 'player' | 'shared'
    ): boolean {
        const store = scope === 'shared' ? this.context.sharedFieldEventFlags : player.fieldEventFlagsByDungeonId;
        return store.get(dungeonId)?.has(flag) ?? false;
    }

    private markFieldEventFlagComplete(
        player: ServerPlayer,
        dungeonId: string,
        flag: string,
        scope: 'player' | 'shared'
    ): void {
        const store = scope === 'shared' ? this.context.sharedFieldEventFlags : player.fieldEventFlagsByDungeonId;
        let flags = store.get(dungeonId);
        if (!flags) {
            flags = new Set();
            store.set(dungeonId, flags);
        }
        flags.add(flag);
        this.context.saveState.markDirty(player.id);
    }
}
