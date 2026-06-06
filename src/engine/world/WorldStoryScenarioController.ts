import type { PlayerData } from '../../data/PlayerData';
import { getStoryQuestByDungeonId, isStoryQuestAvailable, type StoryQuestDefinition } from '../../data/StoryQuestData';
import { getStoryScenarioByDungeonId } from '../../data/StoryScenarioData';
import { getStoryScenarioEventSequence, type StoryScenarioEventStep } from '../../data/StoryScenarioEventData';
import { getStoryScenarioMonsterLayout } from '../../data/StoryScenarioMonsterData';
import { getMonsterDefinition } from '../../data/MonsterCatalog';
import { getStoryInteriorLayout, isStoryInteriorDungeon, type StoryInteriorLayout } from '../../data/StoryInteriorData';
import { formatT, t } from '../../i18n/LanguageManager';
import { Enemy } from '../../entity/Enemy';
import type { Player } from '../../entity/Player';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import type { TilePoint } from '../../field/FieldPathing';
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
    log(message: string): void;
}

export class WorldStoryScenarioController {
    private readonly context: WorldStoryScenarioContext;
    private activeInterior: WorldStoryInteriorState | null = null;
    private dismissedDungeonVisitKey: string | null = null;
    private pendingNetworkScenarioEnter: WorldStoryScenarioPendingEnter | null = null;
    private readonly networkScenarioEnteredDungeonIds: Set<string> = new Set();

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
        if (this.activeInterior?.dungeonId === dungeonId) return layout;

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
        return layout;
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

    public completeStoryDungeonObjective(
        dungeonId: string,
        storyQuest: StoryQuestDefinition,
        options: { clearEnemies?: boolean } = {}
    ): void {
        this.context.raidSession.completeDungeonEncounter(dungeonId);
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
