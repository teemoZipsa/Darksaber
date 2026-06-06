import type { PlayerData } from '../../data/PlayerData';
import { getItemDef } from '../../data/ItemDB';
import { getStoryQuestByDungeonId, isStoryQuestAvailable, type StoryQuestDefinition } from '../../data/StoryQuestData';
import { getStoryScenarioByDungeonId } from '../../data/StoryScenarioData';
import {
    getStoryScenarioEventSequence,
    type StoryScenarioEventStep,
    type StoryScenarioFieldEvent,
} from '../../data/StoryScenarioEventData';
import { getStoryScenarioMonsterLayout } from '../../data/StoryScenarioMonsterData';
import { getMonsterDefinition } from '../../data/MonsterCatalog';
import { getStoryInteriorLayout, isStoryInteriorDungeon, type StoryInteriorLayout } from '../../data/StoryInteriorData';
import { formatT, t } from '../../i18n/LanguageManager';
import { Enemy } from '../../entity/Enemy';
import type { Player } from '../../entity/Player';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import { manhattan, type TilePoint } from '../../field/FieldPathing';
import { StoryInteriorMap } from '../../map/StoryInteriorMap';
import type { WorldDungeonInfo, WorldMap } from '../../map/WorldMap';
import type { WorldRaidSession } from './WorldRaidSession';

export interface WorldStoryInteriorState {
    dungeonId: string;
    layout: StoryInteriorLayout;
    previousWorldMap: WorldMap;
    returnTile: TilePoint;
}

export interface WorldStoryScenarioNetworkClient {
    sendScenarioEnter(actorId: string, dungeonId: string): string;
}

export interface WorldStoryScenarioPendingEnter {
    intentId: string;
    dungeonId: string;
    visitKey: string | null;
}

export interface WorldStoryScenarioContext {
    playerData: PlayerData;
    raidSession: WorldRaidSession;
    getWorldMap(): WorldMap;
    setWorldMap(worldMap: WorldMap): void;
    getPlayer(): Player;
    setPlayer(player: Player): void;
    getFieldEnemies(): FieldEnemy[];
    setFieldEnemies(enemies: FieldEnemy[]): void;
    getControlledActor(): FieldActor | null;
    actorTile(actor: FieldActor): TilePoint;
    placePartyNear(tile: TilePoint): void;
    clearFieldTurnState(): void;
    closeFieldOverlays(): void;
    selectActor(actorId: string | null): void;
    clearSelection(): void;
    applyMonsterSprite(enemy: Enemy, monsterId: string): void;
    isEntityMoving(entity: Player): boolean;
    isNetworkRaid(): boolean;
    getNetworkRaidClient(): WorldStoryScenarioNetworkClient | null;
    isRaidOutcomeVisible(): boolean;
    isTownVisible(): boolean;
    isFusionTempleVisible(): boolean;
    followCameraToPlayer(): void;
    autoPlaceRewardItem(itemId: string): boolean;
    log(message: string): void;
}

export class WorldStoryScenarioController {
    private readonly context: WorldStoryScenarioContext;
    private activeInterior: WorldStoryInteriorState | null = null;
    private dismissedDungeonVisitKey: string | null = null;
    private pendingNetworkScenarioEnter: WorldStoryScenarioPendingEnter | null = null;
    private readonly networkScenarioEnteredDungeonIds: Set<string> = new Set();
    private readonly completedFieldEventKeys: Set<string> = new Set();

    constructor(context: WorldStoryScenarioContext) {
        this.context = context;
    }

    public getActiveInterior(): WorldStoryInteriorState | null {
        return this.activeInterior;
    }

    public resetVisitState(): void {
        this.dismissedDungeonVisitKey = null;
    }

    public resetNetworkState(): void {
        this.pendingNetworkScenarioEnter = null;
        this.networkScenarioEnteredDungeonIds.clear();
    }

    public enterInteriorMap(dungeonId: string, returnTile: TilePoint): StoryInteriorLayout | null {
        const layout = getStoryInteriorLayout(dungeonId);
        if (!layout) return null;
        if (this.activeInterior?.dungeonId === dungeonId) {
            this.syncActiveInteriorDoorLocks();
            this.syncActiveInteriorInspectMarkers();
            return layout;
        }

        const previousWorldMap = this.activeInterior?.previousWorldMap ?? this.context.getWorldMap();
        this.context.setWorldMap(new StoryInteriorMap(layout));
        this.activeInterior = {
            dungeonId,
            layout,
            previousWorldMap,
            returnTile: { ...returnTile },
        };
        this.context.getWorldMap().loot = [];
        this.dismissedDungeonVisitKey = null;
        this.syncActiveInteriorDoorLocks();
        this.syncActiveInteriorInspectMarkers();
        return layout;
    }

    public getInspectableFieldEventTiles(actor: FieldActor | null): Set<string> {
        const active = this.activeInterior;
        const result = new Set<string>();
        if (!active || !actor || this.context.isNetworkRaid()) return result;

        const sequence = getStoryScenarioEventSequence(active.dungeonId);
        if (!sequence) return result;

        const actorTile = this.context.actorTile(actor);
        for (const event of sequence.fieldEvents) {
            if (this.isFieldEventCompleted(active.dungeonId, event)) continue;
            for (const tile of event.triggerTiles) {
                if (manhattan(actorTile, tile) <= 1) result.add(`${tile.x},${tile.y}`);
            }
        }
        return result;
    }

    public playFieldEvent(dungeonId: string, eventId: string): boolean {
        const sequence = getStoryScenarioEventSequence(dungeonId);
        const event = sequence?.fieldEvents.find((candidate) => candidate.id === eventId);
        if (!event) return false;
        const key = this.fieldEventKey(dungeonId, event.id);
        if (this.isFieldEventCompleted(dungeonId, event)) return false;
        this.completedFieldEventKeys.add(key);
        if (event.runtimeFlag) this.context.raidSession.setScenarioFlag(dungeonId, event.runtimeFlag);
        this.syncActiveInteriorDoorLocks();
        this.syncActiveInteriorInspectMarkers();
        for (const step of event.steps) this.playStoryScenarioEventStep(step);
        this.applyFieldEventRewards(event);
        return true;
    }

    public getLockedDoorMessage(tile: TilePoint): string | null {
        const door = this.getLockedDoorAt(tile);
        if (!door) return null;
        return t(door.lockedLogKey ?? 'story.interior.lockedDoor');
    }

    public playFieldEventAt(tile: TilePoint, actor: FieldActor | null = this.context.getControlledActor()): boolean {
        const active = this.activeInterior;
        if (!active || !actor || this.context.isNetworkRaid()) return false;

        const sequence = getStoryScenarioEventSequence(active.dungeonId);
        if (!sequence || manhattan(this.context.actorTile(actor), tile) > 1) return false;

        const event = sequence.fieldEvents.find((candidate) =>
            !this.isFieldEventCompleted(active.dungeonId, candidate)
            && candidate.triggerTiles.some((triggerTile) => triggerTile.x === tile.x && triggerTile.y === tile.y)
        );
        if (!event) return false;
        return this.playFieldEvent(active.dungeonId, event.id);
    }

    public exitActiveInterior(options: { placePartyAtReturn?: boolean } = {}): void {
        const active = this.activeInterior;
        if (!active) return;

        this.context.setWorldMap(active.previousWorldMap);
        this.activeInterior = null;
        if (options.placePartyAtReturn) {
            this.context.placePartyNear(active.returnTile);
            this.context.setPlayer(this.context.getControlledActor()?.entity ?? this.context.getPlayer());
            this.context.selectActor(this.context.getControlledActor()?.id ?? null);
        }
    }

    public checkDungeonArrival(): void {
        if (
            !this.context.raidSession.active
            || this.context.isRaidOutcomeVisible()
            || this.context.isTownVisible()
            || this.context.isFusionTempleVisible()
        ) {
            return;
        }

        const actor = this.context.getControlledActor();
        if (!actor) return;

        const worldMap = this.context.getWorldMap();
        const dungeon = worldMap.getDungeonAtTile(actor.entity.gridX, actor.entity.gridY);
        if (!dungeon) {
            this.dismissedDungeonVisitKey = null;
            return;
        }
        const storyQuest = getStoryQuestByDungeonId(dungeon.id);
        if (!storyQuest) return;

        const key = this.getCurrentDungeonVisitKey(dungeon);
        if (!key || this.dismissedDungeonVisitKey === key) return;
        if (!isStoryQuestAvailable(storyQuest, this.context.playerData)) {
            const lockedLogKey = dungeon.id === 'sicilio_island'
                ? 'story.sicilioRouteLockedLog'
                : 'story.dungeonLockedLog';
            this.context.log(t(lockedLogKey));
            this.dismissedDungeonVisitKey = key;
            return;
        }
        if (this.context.raidSession.activeDungeonId) {
            this.dismissedDungeonVisitKey = key;
            return;
        }
        if (this.context.raidSession.isDungeonCleared(dungeon.id)) {
            this.dismissedDungeonVisitKey = key;
            return;
        }
        if (this.context.isEntityMoving(actor.entity)) return;

        const hostileActive = this.context.getFieldEnemies().some((entry) => entry.enemy.stats.hp > 0 && entry.enemy.isAggro);
        if (hostileActive) {
            this.context.log(`${dungeon.nameKr}에 들어가려면 주변 전투를 정리해야 합니다.`);
            this.dismissedDungeonVisitKey = key;
            return;
        }

        if (this.context.isNetworkRaid()) {
            this.enterNetworkStoryDungeon(dungeon);
            return;
        }

        this.enterStoryDungeon(dungeon);
    }

    public enterNetworkStoryDungeon(dungeon: WorldDungeonInfo): void {
        const actor = this.context.getControlledActor();
        const networkRaidClient = this.context.getNetworkRaidClient();
        if (!actor || !networkRaidClient) return;

        const visitKey = this.getCurrentDungeonVisitKey(dungeon);
        this.dismissedDungeonVisitKey = visitKey;
        const intentId = networkRaidClient.sendScenarioEnter(actor.id, dungeon.id);
        this.pendingNetworkScenarioEnter = { intentId, dungeonId: dungeon.id, visitKey };
        this.context.log(`${dungeon.nameKr} 서버 시나리오 진입 요청.`);
    }

    public enterStoryDungeon(dungeon: WorldDungeonInfo): void {
        const storyQuest = getStoryQuestByDungeonId(dungeon.id);
        if (!storyQuest) return;

        this.dismissedDungeonVisitKey = this.getCurrentDungeonVisitKey(dungeon);
        if (isStoryInteriorDungeon(dungeon.id)) {
            this.startLocalStoryInteriorDungeon(dungeon, storyQuest);
            return;
        }

        this.context.log(`${dungeon.nameKr} 시나리오는 서버 세션 이관 후 진입할 수 있습니다.`);
    }

    public startLocalStoryInteriorDungeon(dungeon: WorldDungeonInfo, storyQuest: StoryQuestDefinition): void {
        const actor = this.context.getControlledActor();
        if (!actor) return;

        const scenario = getStoryScenarioByDungeonId(dungeon.id);
        const layout = this.enterInteriorMap(dungeon.id, this.context.actorTile(actor));
        if (!scenario || !layout) return;

        this.context.raidSession.startDungeonEncounter(dungeon.id);
        this.clearFieldEventState(dungeon.id);
        this.context.closeFieldOverlays();
        this.context.setFieldEnemies([]);
        this.context.getWorldMap().loot = [];
        this.context.placePartyNear(layout.playerStart);
        this.context.setPlayer(this.context.getControlledActor()?.entity ?? this.context.getPlayer());
        this.context.selectActor(this.context.getControlledActor()?.id ?? null);
        this.context.clearFieldTurnState();

        const monsterLayout = getStoryScenarioMonsterLayout(scenario);
        const enemies: FieldEnemy[] = [];
        for (let index = 0; index < scenario.guardCount; index++) {
            const monsterId = monsterLayout.guardMonsterIds[index % monsterLayout.guardMonsterIds.length];
            const guardDefinition = getMonsterDefinition(monsterId);
            const tile = layout.guardTiles[index] ?? layout.guardTiles[layout.guardTiles.length - 1] ?? layout.playerStart;
            const enemy = new Enemy(
                `story_${dungeon.id}_guard_${index}`,
                tile.x,
                tile.y,
                guardDefinition.name,
                Math.max(scenario.guardLevel, guardDefinition.level),
                guardDefinition.color,
                guardDefinition.role,
                monsterId
            );
            enemy.aggroRange = Math.max(guardDefinition.aggroRange, 8);
            enemy.isAggro = true;
            this.context.applyMonsterSprite(enemy, monsterId);
            enemies.push({ enemy, home: { ...tile }, path: [] });
        }

        if (scenario.bossName) {
            const monsterId = monsterLayout.bossMonsterId;
            const bossDefinition = monsterId ? getMonsterDefinition(monsterId) : null;
            const boss = new Enemy(
                `story_${dungeon.id}_boss`,
                layout.bossTile.x,
                layout.bossTile.y,
                scenario.bossName,
                scenario.bossLevel,
                scenario.bossColor,
                'boss',
                monsterId
            );
            boss.aggroRange = Math.max(bossDefinition?.aggroRange ?? 0, 10);
            boss.isAggro = true;
            boss.isBoss = true;
            if (monsterId) this.context.applyMonsterSprite(boss, monsterId);
            enemies.push({ enemy: boss, home: { ...layout.bossTile }, path: [] });
        }
        this.context.setFieldEnemies(enemies);

        this.context.followCameraToPlayer();
        this.playStoryScenarioSequence(dungeon.id, 'entry');
        this.context.log(formatT('story.interior.enterLog', { dungeon: dungeon.nameKr }));
        this.context.log(t(storyQuest.enterLogKey));
    }

    public completeDungeonIfBossDefeated(enemy: Enemy): void {
        const dungeonId = this.context.raidSession.activeDungeonId;
        const storyQuest = dungeonId ? getStoryQuestByDungeonId(dungeonId) : null;
        if (!enemy.isBoss || !dungeonId || !storyQuest) return;
        this.completeStoryDungeonObjective(dungeonId, storyQuest);
    }

    public playEnemyDefeatEvent(enemy: Enemy): boolean {
        const dungeonId = this.context.raidSession.activeDungeonId;
        if (!dungeonId || this.context.isNetworkRaid()) return false;
        const sequence = getStoryScenarioEventSequence(dungeonId);
        const event = sequence?.enemyDefeatEvents?.find((candidate) => candidate.enemyId === enemy.id);
        if (!event) return false;

        const key = this.fieldEventKey(dungeonId, event.id);
        if (this.completedFieldEventKeys.has(key)) return false;
        this.completedFieldEventKeys.add(key);
        for (const step of event.steps) this.playStoryScenarioEventStep(step);
        return true;
    }

    public completeStoryDungeonObjective(
        dungeonId: string,
        storyQuest: StoryQuestDefinition,
        options: { clearEnemies?: boolean } = {}
    ): void {
        this.context.raidSession.completeDungeonEncounter(dungeonId);
        const eventSequence = getStoryScenarioEventSequence(dungeonId);
        if (eventSequence?.objectiveRuntimeFlag) {
            this.context.raidSession.setScenarioFlag(dungeonId, eventSequence.objectiveRuntimeFlag);
        }
        if (options.clearEnemies ?? true) this.context.setFieldEnemies([]);
        const completedInterior = this.activeInterior?.dungeonId === dungeonId ? this.activeInterior : null;
        if (this.activeInterior?.dungeonId === dungeonId) {
            this.exitActiveInterior({ placePartyAtReturn: !this.context.isNetworkRaid() });
        }
        this.context.clearSelection();
        this.context.clearFieldTurnState();
        const scenario = getStoryScenarioByDungeonId(dungeonId);
        this.playStoryScenarioSequence(dungeonId, 'bossDefeat');
        if (completedInterior && scenario) {
            this.context.log(formatT('story.interior.returnLog', { dungeon: scenario.dungeonNameKr }));
        }
        this.context.log(t(storyQuest.objectiveCompleteLogKey));
    }

    public applyNetworkScenarioSnapshot(scenarioSnapshot: {
        activeDungeonId?: string | null;
        enteredDungeonIds?: readonly string[];
        completedDungeonIds?: readonly string[];
    } | undefined): void {
        if (!scenarioSnapshot) return;

        const enteredDungeonIds = scenarioSnapshot.enteredDungeonIds ?? [];
        const completedDungeonIds = scenarioSnapshot.completedDungeonIds ?? [];
        const completedSet = new Set(completedDungeonIds);

        for (const dungeonId of enteredDungeonIds) {
            if (this.networkScenarioEnteredDungeonIds.has(dungeonId)) continue;
            this.networkScenarioEnteredDungeonIds.add(dungeonId);
            const storyQuest = getStoryQuestByDungeonId(dungeonId);
            if (storyQuest) this.context.log(t(storyQuest.enterLogKey));
            this.playStoryScenarioSequence(dungeonId, 'entry');
            const scenario = getStoryScenarioByDungeonId(dungeonId);
            if (scenario && isStoryInteriorDungeon(dungeonId)) {
                this.context.log(formatT('story.interior.enterLog', { dungeon: scenario.dungeonNameKr }));
            }
        }

        if (scenarioSnapshot.activeDungeonId) {
            if (this.context.raidSession.activeDungeonId !== scenarioSnapshot.activeDungeonId) {
                this.context.raidSession.startDungeonEncounter(scenarioSnapshot.activeDungeonId);
                this.context.clearSelection();
                this.context.clearFieldTurnState();
            }
            const controlled = this.context.getControlledActor();
            if (controlled) this.enterInteriorMap(scenarioSnapshot.activeDungeonId, this.context.actorTile(controlled));
        } else if (
            !scenarioSnapshot.activeDungeonId
            && this.context.raidSession.activeDungeonId
            && !completedSet.has(this.context.raidSession.activeDungeonId)
        ) {
            this.exitActiveInterior();
            this.context.raidSession.activeDungeonId = null;
            this.context.clearSelection();
            this.context.clearFieldTurnState();
        }

        for (const dungeonId of completedDungeonIds) {
            if (this.context.raidSession.isDungeonCleared(dungeonId)) continue;
            const storyQuest = getStoryQuestByDungeonId(dungeonId);
            if (storyQuest) this.completeStoryDungeonObjective(dungeonId, storyQuest, { clearEnemies: false });
            else this.context.raidSession.completeDungeonEncounter(dungeonId);
        }

        if (
            this.pendingNetworkScenarioEnter
            && (
                enteredDungeonIds.includes(this.pendingNetworkScenarioEnter.dungeonId)
                || completedSet.has(this.pendingNetworkScenarioEnter.dungeonId)
                || scenarioSnapshot.activeDungeonId === this.pendingNetworkScenarioEnter.dungeonId
            )
        ) {
            this.pendingNetworkScenarioEnter = null;
        }
    }

    public applyNetworkScenarioResult(completedDungeonIds: readonly string[] | undefined): void {
        for (const dungeonId of completedDungeonIds ?? []) {
            if (this.context.raidSession.isDungeonCleared(dungeonId)) continue;
            const storyQuest = getStoryQuestByDungeonId(dungeonId);
            if (storyQuest) this.completeStoryDungeonObjective(dungeonId, storyQuest, { clearEnemies: false });
            else this.context.raidSession.completeDungeonEncounter(dungeonId);
        }
    }

    public handleNetworkActionRejected(intentId: string, reason: string): boolean {
        if (this.pendingNetworkScenarioEnter?.intentId !== intentId) return false;
        const visitKey = this.pendingNetworkScenarioEnter.visitKey;
        this.pendingNetworkScenarioEnter = null;
        this.dismissedDungeonVisitKey = visitKey;
        this.context.log(`시나리오 진입 실패: ${reason}`);
        return true;
    }

    private getCurrentDungeonVisitKey(dungeon: WorldDungeonInfo): string | null {
        const actor = this.context.getControlledActor();
        if (!actor) return null;
        return `${this.context.getWorldMap().getRealm()}:${dungeon.id}:${actor.entity.gridX},${actor.entity.gridY}`;
    }

    private playStoryScenarioSequence(dungeonId: string, phase: 'entry' | 'bossDefeat'): void {
        const sequence = getStoryScenarioEventSequence(dungeonId);
        if (!sequence) return;
        for (const step of sequence[phase]) this.playStoryScenarioEventStep(step);
    }

    private fieldEventKey(dungeonId: string, eventId: string): string {
        return `${dungeonId}:${eventId}`;
    }

    private syncActiveInteriorDoorLocks(): void {
        const active = this.activeInterior;
        const worldMap = this.context.getWorldMap();
        if (!active || !(worldMap instanceof StoryInteriorMap)) return;
        if (this.context.isNetworkRaid()) {
            worldMap.setLockedTiles([]);
            return;
        }
        worldMap.setLockedTiles((active.layout.doors ?? [])
            .filter((door) => this.isDoorLocked(active.dungeonId, door))
            .map((door) => door.tile));
    }

    private syncActiveInteriorInspectMarkers(): void {
        const active = this.activeInterior;
        const worldMap = this.context.getWorldMap();
        if (!active || !(worldMap instanceof StoryInteriorMap)) return;
        if (this.context.isNetworkRaid()) {
            worldMap.setInspectMarkers([]);
            return;
        }

        const sequence = getStoryScenarioEventSequence(active.dungeonId);
        if (!sequence) {
            worldMap.setInspectMarkers([]);
            return;
        }

        const fieldEventMarkers = sequence.fieldEvents
            .filter((event) => !this.isFieldEventCompleted(active.dungeonId, event))
            .flatMap((event) => event.triggerTiles.map((tile) => ({
                id: `${event.id}:${tile.x},${tile.y}`,
                tile,
                labelKey: event.markerLabelKey,
                kind: event.markerKind,
            })));
        const scenarioMarkers = (sequence.markers ?? [])
            .filter((marker) => !marker.hideWhenRuntimeFlag || !this.context.raidSession.hasScenarioFlag(active.dungeonId, marker.hideWhenRuntimeFlag))
            .map((marker) => ({
                id: `${marker.id}:${marker.tile.x},${marker.tile.y}`,
                tile: marker.tile,
                labelKey: marker.markerLabelKey,
                kind: marker.markerKind,
            }));
        worldMap.setInspectMarkers([...fieldEventMarkers, ...scenarioMarkers]);
    }

    private applyFieldEventRewards(event: StoryScenarioFieldEvent): void {
        for (const reward of event.rewards ?? []) {
            if (reward.type === 'gold') {
                this.context.playerData.addGold(reward.amount);
                this.context.log(formatT('story.event.reward.gold', { amount: reward.amount }));
                continue;
            }

            const item = getItemDef(reward.itemId);
            const label = item?.nameKr ?? reward.itemId;
            if (item && this.context.autoPlaceRewardItem(reward.itemId)) {
                this.context.log(formatT('story.event.reward.item', { item: label }));
            } else {
                this.context.log(formatT('story.event.reward.itemFull', { item: label }));
            }
        }
    }

    private getLockedDoorAt(tile: TilePoint): NonNullable<StoryInteriorLayout['doors']>[number] | null {
        const active = this.activeInterior;
        if (!active || this.context.isNetworkRaid()) return null;
        return (active.layout.doors ?? []).find((door) =>
            door.tile.x === tile.x
            && door.tile.y === tile.y
            && this.isDoorLocked(active.dungeonId, door)
        ) ?? null;
    }

    private isDoorLocked(dungeonId: string, door: NonNullable<StoryInteriorLayout['doors']>[number]): boolean {
        if (!door.sealed || (!door.requiredRuntimeFlag && !door.requiredQuestItemId)) return false;
        if (door.requiredRuntimeFlag && this.context.raidSession.hasScenarioFlag(dungeonId, door.requiredRuntimeFlag)) return false;
        if (door.requiredQuestItemId && this.context.playerData.hasQuestItem(door.requiredQuestItemId)) return false;
        return true;
    }

    private isFieldEventCompleted(dungeonId: string, event: StoryScenarioFieldEvent): boolean {
        if (this.completedFieldEventKeys.has(this.fieldEventKey(dungeonId, event.id))) return true;
        if (event.questItemId && this.context.playerData.hasQuestItem(event.questItemId)) return true;
        return event.runtimeFlag ? this.context.raidSession.hasScenarioFlag(dungeonId, event.runtimeFlag) : false;
    }

    private clearFieldEventState(dungeonId: string): void {
        for (const key of [...this.completedFieldEventKeys]) {
            if (key.startsWith(`${dungeonId}:`)) this.completedFieldEventKeys.delete(key);
        }
    }

    private playStoryScenarioEventStep(step: StoryScenarioEventStep): void {
        switch (step.kind) {
            case 'focus':
                this.context.log(formatT('story.event.focusLog', { target: t(step.labelKey) }));
                break;
            case 'dialogue':
                this.context.log(formatT('story.event.dialogueLog', {
                    speaker: t(step.speakerNameKey),
                    line: t(step.textKey),
                }));
                break;
            case 'combatStart':
            case 'objective':
                this.context.log(t(step.labelKey));
                break;
        }
    }
}
