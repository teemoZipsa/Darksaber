import { Character } from '../../character/Character';
import { getCharacterExpToNext } from '../../character/CharacterProgression';
import type { PartyManager } from '../../character/PartyManager';
import { getItemDef } from '../../data/ItemDB';
import type { GameManager } from '../GameManager';
import { Enemy } from '../../entity/Enemy';
import { LootObject } from '../../entity/LootObject';
import { Player } from '../../entity/Player';
import { MIN_FIELD_ACTION_GAUGE_COST } from '../../field/FieldActionEconomy';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import type { TilePoint } from '../../field/FieldPathing';
import { GridInventory, type PlacedItem } from '../../inventory/GridInventory';
import { formatT, i18n, t } from '../../i18n/LanguageManager';
import { getLootSourceLabelForDisplay } from '../../loot/LootLabels';
import type { WorldMap } from '../../map/WorldMap';
import type {
    ActionRejectedMessage,
    ActorSnapshot,
    AutoLootCell,
    AutoLootGrantMessage,
    CombatEventMessage,
    GridSnapshot,
    InventoryConsumedMessage,
    LootGrantMessage,
    LootSnapshot,
    WorldSnapshot,
} from '../../net/WorldProtocol';
import type { CombatFeedbackKind } from './CombatFeedback';
import type { WorldStoryScenarioController } from './WorldStoryScenarioController';
import { classifyNetworkActorSnapshots } from './NetworkSnapshotOwnership';

interface PendingNetworkMoveReopen {
    intentId: string;
    actorId: string;
    tile: TilePoint;
}

function displayItemName(item: { name: string; nameKr: string }): string {
    return i18n.lang === 'ko' ? item.nameKr : item.name;
}

interface NetworkMovePathPreview {
    actorId: string;
    target: TilePoint;
    path: TilePoint[];
}

interface PendingLootPick {
    placed: PlacedItem;
    source: { gridX: number; gridY: number };
    at: number;
    timedOut?: boolean;
}

export interface WorldNetworkSyncClient {
    sendAutoLootResolve(lootId: string, acceptedCells: AutoLootCell[]): void;
}

export interface WorldNetworkSyncContext {
    party: PartyManager;
    gameManager: GameManager;
    storyScenarioController: WorldStoryScenarioController;
    getNetworkPlayerId(): string | null;
    getNetworkRaidClient(): WorldNetworkSyncClient | null;
    getWorldMap(): WorldMap;
    getPartyActors(): FieldActor[];
    setPartyActors(actors: FieldActor[]): void;
    getRemotePartyActors(): Map<string, FieldActor>;
    getFieldEnemies(): FieldEnemy[];
    setFieldEnemies(enemies: FieldEnemy[]): void;
    getControlledActor(): FieldActor | null;
    setPlayer(player: Player): void;
    getActiveTurnActorId(): string | null;
    setActiveTurnActorId(actorId: string | null): void;
    getRemainingActionPoints(): number;
    setRemainingActionPoints(points: number): void;
    setMajorActionUsedThisTurn(used: boolean): void;
    hasSelection(): boolean;
    selectActor(actorId: string): void;
    selectLoot(lootId: string): void;
    getActionMenuIsOpen(): boolean;
    getPlayerActionMode(): unknown;
    hasExecutableAction(actor: FieldActor): boolean;
    reopenActionMenu(actor: FieldActor): void;
    getEnemyById(enemyId: string): Enemy | null;
    actorTile(actor: FieldActor): TilePoint;
    enemyTile(enemy: Enemy): TilePoint;
    applyMonsterSprite(enemy: Enemy, monsterId: string): void;
    isEntityMoving(entity: Player | Enemy): boolean;
    beginCombatFeedbackGroup(): string;
    registerCombatFeedback(kind: CombatFeedbackKind, feedbackGroupId?: string): void;
    flushCombatFeedbackGroup(feedbackGroupId: string): void;
    spawnAttackCue(from: TilePoint, to: TilePoint, color: string, label?: string): void;
    spawnKillEffect(enemy: Enemy, feedbackGroupId?: string, actor?: FieldActor, expOverride?: number): void;
    spawnDebuffEffect(x: number, y: number): void;
    spawnHitEffect(x: number, y: number): void;
    spawnHealEffect(x: number, y: number): void;
    spawnDamage(x: number, y: number, amount: number, isCrit: boolean, isMiss: boolean): void;
    spawnHeal(x: number, y: number, amount: number): void;
    spawnStatus(x: number, y: number, text: string): void;
    recordCharacterDown(characterId: string): void;
    log(message: string): void;
}

export class WorldNetworkSyncController {
    private readonly context: WorldNetworkSyncContext;
    private pendingMoveReopen: PendingNetworkMoveReopen | null = null;
    private movePathPreview: NetworkMovePathPreview | null = null;
    private readonly pendingLootPicks = new Map<string, PendingLootPick>();

    constructor(context: WorldNetworkSyncContext) {
        this.context = context;
    }

    public trackPendingMove(intentId: string, actorId: string, tile: TilePoint, path: TilePoint[]): void {
        this.pendingMoveReopen = { intentId, actorId, tile: { ...tile } };
        this.movePathPreview = {
            actorId,
            target: { ...tile },
            path: path.map((step) => ({ ...step })),
        };
    }

    public addPendingLootPick(intentId: string, placed: PlacedItem, source: { gridX: number; gridY: number }, at: number = Date.now()): void {
        this.pendingLootPicks.set(intentId, { placed, source, at });
    }

    public clearPendingState(): void {
        this.pendingMoveReopen = null;
        this.movePathPreview = null;
        this.pendingLootPicks.clear();
    }

    public getPathPreviewTiles(actor: FieldActor | null): TilePoint[] | null {
        if (!actor) return null;
        if (this.movePathPreview?.actorId === actor.id) return this.movePathPreview.path;
        return null;
    }

    public refreshMovePathPreview(): void {
        const preview = this.movePathPreview;
        if (!preview) return;

        const actor = this.context.getPartyActors().find((candidate) => candidate.id === preview.actorId);
        if (!actor) {
            this.movePathPreview = null;
            return;
        }

        while (preview.path.length > 0 && this.hasEntityReachedPreviewTile(actor, preview.path[0])) {
            preview.path.shift();
        }
        if (preview.path.length === 0) {
            this.movePathPreview = null;
            return;
        }

        const pendingMatches = this.pendingMoveReopen?.actorId === preview.actorId
            && this.pendingMoveReopen.tile.x === preview.target.x
            && this.pendingMoveReopen.tile.y === preview.target.y;
        const atTarget = actor.entity.gridX === preview.target.x && actor.entity.gridY === preview.target.y;

        if (atTarget && !this.context.isEntityMoving(actor.entity)) {
            this.movePathPreview = null;
            return;
        }
        if (!pendingMatches && !atTarget) this.movePathPreview = null;
    }

    public applySnapshot(snapshot: WorldSnapshot): void {
        const partyActors = this.context.getPartyActors();
        const remotePartyActors = this.context.getRemotePartyActors();
        const worldMap = this.context.getWorldMap();
        const localCharacters = this.context.party.getCharacters();
        const localCharacterIds = new Set(localCharacters.map((character) => character.id));
        const { ownSnapshots, remoteSnapshots } = classifyNetworkActorSnapshots({
            playerId: this.context.getNetworkPlayerId(),
            localCharacterIds,
            snapshot,
        });
        const ownByLocalId = new Map(ownSnapshots.map((actor) => [actor.localActorId ?? actor.id, actor]));
        const claimedOwnSnapshots = new Set<ActorSnapshot>();
        const nextLocalActors: FieldActor[] = [];

        for (const character of localCharacters) {
            const existing = partyActors.find((actor) => actor.character === character);
            const actorSnapshot = this.takeOwnSnapshotForCharacter(
                character,
                existing,
                ownSnapshots,
                ownByLocalId,
                claimedOwnSnapshots,
                localCharacters.length
            );
            if (!actorSnapshot) continue;
            const actor = existing ?? {
                id: actorSnapshot.id,
                character,
                entity: new Player(actorSnapshot.tile.x, actorSnapshot.tile.y),
                path: [],
                queuedIntent: null,
            };
            if (!character.isDead && actorSnapshot.isDead) {
                this.context.recordCharacterDown(character.id);
            }
            this.applyActorSnapshot(actor, actorSnapshot);
            nextLocalActors.push(actor);
        }

        const nextRemoteActors: FieldActor[] = [];
        const seenRemoteIds = new Set<string>();
        for (const actorSnapshot of remoteSnapshots) {
            seenRemoteIds.add(actorSnapshot.id);
            let actor = remotePartyActors.get(actorSnapshot.id);
            if (!actor) {
                const character = new Character(
                    actorSnapshot.localActorId ?? actorSnapshot.id,
                    actorSnapshot.name,
                    actorSnapshot.classLineId
                );
                actor = {
                    id: actorSnapshot.id,
                    character,
                    entity: new Player(actorSnapshot.tile.x, actorSnapshot.tile.y),
                    path: [],
                    queuedIntent: null,
                };
                remotePartyActors.set(actorSnapshot.id, actor);
            }
            this.applyActorSnapshot(actor, actorSnapshot);
            nextRemoteActors.push(actor);
        }
        for (const actorId of [...remotePartyActors.keys()]) {
            if (!seenRemoteIds.has(actorId)) remotePartyActors.delete(actorId);
        }

        this.context.setPartyActors([...nextLocalActors, ...nextRemoteActors]);
        this.context.setFieldEnemies(snapshot.enemies.map((enemySnapshot) => {
            const existing = this.context.getFieldEnemies().find((entry) => entry.enemy.id === enemySnapshot.id)?.enemy;
            const enemy = existing ?? new Enemy(
                enemySnapshot.id,
                enemySnapshot.tile.x,
                enemySnapshot.tile.y,
                enemySnapshot.name,
                enemySnapshot.level,
                enemySnapshot.color,
                enemySnapshot.role
            );
            enemy.gridX = enemySnapshot.tile.x;
            enemy.gridY = enemySnapshot.tile.y;
            enemy.stats = { ...enemySnapshot.stats };
            enemy.statuses = enemySnapshot.statuses.map((status) => ({ ...status }));
            enemy.actionGauge = enemySnapshot.actionGauge;
            enemy.facing = enemySnapshot.facing;
            enemy.isAggro = enemySnapshot.isAggro;
            enemy.isBoss = enemySnapshot.isBoss;
            enemy.color = enemySnapshot.color;
            enemy.name = enemySnapshot.name;
            if (enemySnapshot.monsterId && !enemy.walkSprite) this.context.applyMonsterSprite(enemy, enemySnapshot.monsterId);
            return {
                enemy,
                home: { ...enemySnapshot.home },
                path: [],
            };
        }));
        worldMap.loot = snapshot.loot.map((lootSnapshot) => this.createLootFromSnapshot(lootSnapshot));

        const controlled = this.context.getControlledActor();
        const ownReady = snapshot.readyActors.filter((actorId) => ownSnapshots.some((actor) => actor.id === actorId));
        const activeTurnActorId = controlled && ownReady.includes(controlled.id)
            ? controlled.id
            : ownReady[0] ?? null;
        this.context.setActiveTurnActorId(activeTurnActorId);
        const activeTurnSnapshot = activeTurnActorId
            ? ownSnapshots.find((actor) => actor.id === activeTurnActorId)
            : undefined;
        this.context.setRemainingActionPoints(activeTurnActorId
            ? this.resolveSnapshotRemainingGauge(
                activeTurnSnapshot?.remainingAp ?? snapshot.remainingApByActor[activeTurnActorId] ?? 0,
                activeTurnSnapshot?.actionGauge ?? 0
            )
            : 0);
        this.context.setMajorActionUsedThisTurn(activeTurnActorId
            ? Boolean(ownSnapshots.find((actor) => actor.id === activeTurnActorId)?.majorActionUsed)
            : false);
        if (controlled) {
            this.context.setPlayer(controlled.entity);
            if (!this.context.hasSelection()) this.context.selectActor(controlled.id);
        }
        this.reopenPendingMoveMenu(ownSnapshots);
        this.context.storyScenarioController.applyNetworkScenarioSnapshot(snapshot.scenario);
    }

    private takeOwnSnapshotForCharacter(
        character: Character,
        existing: FieldActor | undefined,
        ownSnapshots: readonly ActorSnapshot[],
        ownByLocalId: ReadonlyMap<string, ActorSnapshot>,
        claimedOwnSnapshots: Set<ActorSnapshot>,
        localCharacterCount: number
    ): ActorSnapshot | undefined {
        const claim = (snapshot: ActorSnapshot | undefined): ActorSnapshot | undefined => {
            if (!snapshot || claimedOwnSnapshots.has(snapshot)) return undefined;
            claimedOwnSnapshots.add(snapshot);
            return snapshot;
        };

        const exact = claim(ownByLocalId.get(character.id));
        if (exact) return exact;

        const existingMatch = claim(existing
            ? ownSnapshots.find((snapshot) => snapshot.id === existing.id && !claimedOwnSnapshots.has(snapshot))
            : undefined);
        if (existingMatch) return existingMatch;

        const identityMatches = ownSnapshots.filter((snapshot) =>
            !claimedOwnSnapshots.has(snapshot)
            && snapshot.name === character.name
            && snapshot.classLineId === character.classLineId
        );
        if (identityMatches.length === 1) return claim(identityMatches[0]);

        // Legacy restored sessions can carry an obsolete localActorId for a solo character.
        if (localCharacterCount === 1 && ownSnapshots.length === 1) return claim(ownSnapshots[0]);

        return undefined;
    }

    public openLoot(grant: LootGrantMessage): void {
        const grid = this.gridFromSnapshot(grant.gridSnapshot);
        const loot = this.context.getWorldMap().loot.find((entry) => entry.id === grant.lootId);
        this.context.gameManager.inventoryUI.setExternalGrid(
            grid,
            formatT('mp.lootGridTitle', { source: getLootSourceLabelForDisplay(loot) }),
            { isRaidLoot: true },
        );
        if (!this.context.gameManager.inventoryUI.isVisible()) this.context.gameManager.inventoryUI.toggle();
        this.context.selectLoot(grant.lootId);
    }

    public handleAutoLootGrant(grant: AutoLootGrantMessage): void {
        const grid = this.gridFromSnapshot(grant.gridSnapshot);
        const bag = this.context.gameManager.inventoryUI.getBag();
        const acceptedCells: AutoLootCell[] = [];
        const acquiredNames: string[] = [];
        let blocked = false;

        for (const placed of [...grid.items]) {
            const source = { gridX: placed.gridX, gridY: placed.gridY };
            grid.remove(placed);
            if (bag.autoPlaceExisting(placed)) {
                placed.acquiredInRaid = true;
                acceptedCells.push(source);
                acquiredNames.push(displayItemName(placed.item));
            } else {
                grid.placeExisting(placed, source.gridX, source.gridY);
                blocked = true;
            }
        }

        this.context.getNetworkRaidClient()?.sendAutoLootResolve(grant.lootId, acceptedCells);
        if (acquiredNames.length > 0) {
            this.context.log(`${grant.sourceName} ${t('raid.autoLoot')}: ${acquiredNames.join(', ')}`);
        }
        if (blocked) this.context.log(`${grant.sourceName}: ${t('raid.autoLootFull')}`);
    }

    public handleInventoryConsumed(message: InventoryConsumedMessage): void {
        let remaining = Math.max(0, Math.floor(message.quantity));
        if (remaining <= 0) return;
        for (const placed of [...this.context.gameManager.inventory.items]) {
            if (placed.item.id !== message.itemId || placed.quantity <= 0) continue;
            const consumed = Math.min(remaining, placed.quantity);
            placed.quantity -= consumed;
            remaining -= consumed;
            if (placed.quantity <= 0) this.context.gameManager.inventory.remove(placed);
            if (remaining <= 0) break;
        }
    }

    public handleActionRejected(rejection: ActionRejectedMessage): void {
        const rejectedMoveActorId = this.pendingMoveReopen?.intentId === rejection.intentId
            ? this.pendingMoveReopen.actorId
            : null;
        if (this.pendingMoveReopen?.intentId === rejection.intentId) {
            this.pendingMoveReopen = null;
            this.clearMovePathPreview(rejectedMoveActorId);
        }
        if (this.context.storyScenarioController.handleNetworkActionRejected(rejection.intentId, rejection.reason)) {
            return;
        }
        const pending = this.pendingLootPicks.get(rejection.intentId);
        if (pending) {
            this.pendingLootPicks.delete(rejection.intentId);
            this.context.gameManager.inventoryUI.revertRaidLoot(pending.placed, pending.source);
            this.context.log(formatT('mp.lootRejected', { reason: rejection.reason }));
            return;
        }
        this.context.log(formatT('mp.actionRejected', { reason: rejection.reason }));
        if (!rejectedMoveActorId) return;
        const actor = this.context.getPartyActors().find((entry) => entry.id === rejectedMoveActorId);
        if (!actor || actor.id !== this.context.getActiveTurnActorId()) return;
        if (this.context.getRemainingActionPoints() < MIN_FIELD_ACTION_GAUGE_COST) return;
        if (this.context.getActionMenuIsOpen()) return;
        if (this.context.getPlayerActionMode() !== null) return;
        if (this.context.hasExecutableAction(actor)) this.context.reopenActionMenu(actor);
    }

    public purgeStaleLootPicks(): void {
        const now = Date.now();
        for (const pick of this.pendingLootPicks.values()) {
            if (now - pick.at > 10_000 && !pick.timedOut) {
                pick.timedOut = true;
                this.context.log(t('mp.lootPending'));
            }
        }
    }

    public handleCombatEvent(event: CombatEventMessage): void {
        const targetEnemy = this.context.getEnemyById(event.targetId);
        const targetActor = this.context.getPartyActors().find((actor) => actor.id === event.targetId);
        const sourceActor = this.context.getPartyActors().find((actor) => actor.id === event.sourceId);
        const sourceEnemy = this.context.getEnemyById(event.sourceId);
        const feedbackGroupId = this.context.beginCombatFeedbackGroup();

        if (targetEnemy) {
            if (event.kind === 'kill') {
                this.context.spawnKillEffect(targetEnemy, feedbackGroupId, sourceActor, event.expAward);
                this.context.registerCombatFeedback('kill', feedbackGroupId);
            } else if (event.kind === 'status') {
                this.context.spawnStatus(targetEnemy.gridX, targetEnemy.gridY, 'WEAK');
                this.context.spawnDebuffEffect(targetEnemy.gridX, targetEnemy.gridY);
                this.context.registerCombatFeedback('status', feedbackGroupId);
            } else {
                this.context.spawnDamage(targetEnemy.gridX, targetEnemy.gridY, event.value ?? 0, false, event.kind === 'miss');
                if (event.kind !== 'miss' && (event.value ?? 0) > 0) {
                    this.context.spawnHitEffect(targetEnemy.gridX, targetEnemy.gridY);
                    this.context.registerCombatFeedback('normal', feedbackGroupId);
                }
            }
        }
        if (targetActor) {
            if (event.kind === 'heal') {
                this.context.spawnHeal(targetActor.entity.gridX, targetActor.entity.gridY, event.value ?? 0);
                this.context.spawnHealEffect(targetActor.entity.gridX, targetActor.entity.gridY);
                this.context.registerCombatFeedback('normal', feedbackGroupId);
            } else if (event.kind === 'status') {
                this.context.spawnStatus(targetActor.entity.gridX, targetActor.entity.gridY, 'BUFF');
            } else {
                this.context.spawnDamage(targetActor.entity.gridX, targetActor.entity.gridY, event.value ?? 0, false, event.kind === 'miss');
            }
            if (event.kind !== 'miss' && event.kind !== 'heal' && (event.value ?? 0) > 0) {
                this.context.spawnHitEffect(targetActor.entity.gridX, targetActor.entity.gridY);
                this.context.registerCombatFeedback(event.kind === 'down' ? 'kill' : 'normal', feedbackGroupId);
            }
            if (event.kind === 'down') {
                this.context.spawnStatus(targetActor.entity.gridX, targetActor.entity.gridY, 'DOWN');
                if (this.context.party.getCharacters().includes(targetActor.character)) {
                    this.context.recordCharacterDown(targetActor.character.id);
                }
            }
        }
        if (sourceActor && targetEnemy) this.context.spawnAttackCue(this.context.actorTile(sourceActor), this.context.enemyTile(targetEnemy), '#72e8ff');
        if (sourceEnemy && targetActor) this.context.spawnAttackCue(this.context.enemyTile(sourceEnemy), this.context.actorTile(targetActor), '#ff8a55');
        this.context.flushCombatFeedbackGroup(feedbackGroupId);
        this.context.log(this.formatCombatEvent(event));
    }

    public resolveSnapshotRemainingGauge(remainingGauge: number, actionGauge: number): number {
        if (remainingGauge > 0) return remainingGauge;
        return actionGauge >= MIN_FIELD_ACTION_GAUGE_COST ? Math.floor(actionGauge) : 0;
    }

    public reopenPendingMoveMenu(ownSnapshots: ActorSnapshot[]): void {
        const pending = this.pendingMoveReopen;
        if (!pending) return;

        const actorSnapshot = ownSnapshots.find((actor) => actor.id === pending.actorId);
        if (!actorSnapshot) {
            this.pendingMoveReopen = null;
            return;
        }
        if (actorSnapshot.tile.x !== pending.tile.x || actorSnapshot.tile.y !== pending.tile.y) return;

        this.pendingMoveReopen = null;
        const actor = this.context.getPartyActors().find((entry) => entry.id === pending.actorId);
        if (!actor || actor.id !== this.context.getActiveTurnActorId()) return;
        if (this.context.getRemainingActionPoints() < MIN_FIELD_ACTION_GAUGE_COST) return;
        if (this.context.getActionMenuIsOpen()) return;
        if (this.context.getPlayerActionMode() !== null) return;
        if (this.context.hasExecutableAction(actor)) this.context.reopenActionMenu(actor);
    }

    private applyActorSnapshot(actor: FieldActor, snapshot: ActorSnapshot): void {
        const tierChanged = actor.character.currentTier !== snapshot.currentTier;
        actor.id = snapshot.id;
        actor.character.stats = { ...snapshot.stats };
        actor.character.statuses = snapshot.statuses.map((status) => ({ ...status }));
        actor.character.isDead = snapshot.isDead;
        actor.character.currentTier = snapshot.currentTier;
        actor.character.level = snapshot.level;
        if (snapshot.exp !== undefined) actor.character.exp = snapshot.exp;
        if (snapshot.hasEmblem !== undefined) actor.character.hasEmblem = snapshot.hasEmblem;
        actor.character.expToNext = getCharacterExpToNext(snapshot.classLineId, snapshot.currentTier, snapshot.level);
        if (tierChanged) actor.character.updatePortrait();
        actor.entity.gridX = snapshot.tile.x;
        actor.entity.gridY = snapshot.tile.y;
        actor.entity.actionGauge = snapshot.actionGauge;
        actor.entity.facing = snapshot.facing;
        actor.entity.label = snapshot.name;
        actor.path = [];
        actor.queuedIntent = null;
    }

    private createLootFromSnapshot(snapshot: LootSnapshot): LootObject {
        const loot = new LootObject(snapshot.id, snapshot.tile.x, snapshot.tile.y, [], {
            sourceLabel: snapshot.sourceLabel,
            kind: snapshot.kind,
            containerType: snapshot.containerType,
            gridW: snapshot.gridSnapshot.width,
            gridH: snapshot.gridSnapshot.height,
        });
        loot.inventory = this.gridFromSnapshot(snapshot.gridSnapshot);
        loot.opened = snapshot.opened;
        loot.unlocked = snapshot.unlocked ?? false;
        return loot;
    }

    public gridFromSnapshot(snapshot: GridSnapshot): GridInventory {
        const grid = new GridInventory(snapshot.width, snapshot.height);
        for (const itemSnapshot of snapshot.items) {
            const item = getItemDef(itemSnapshot.itemId);
            if (!item) continue;
            const placed = grid.place(item, itemSnapshot.gridX, itemSnapshot.gridY);
            if (!placed) continue;
            placed.durability = itemSnapshot.durability;
            placed.quantity = itemSnapshot.quantity;
            placed.acquiredInRaid = itemSnapshot.acquiredInRaid;
            placed.sockets = (itemSnapshot.sockets ?? []).flatMap((itemId) => {
                const socket = getItemDef(itemId);
                return socket ? [socket] : [];
            });
        }
        return grid;
    }

    private clearMovePathPreview(actorId: string | null): void {
        if (!actorId || this.movePathPreview?.actorId === actorId) this.movePathPreview = null;
    }

    private hasEntityReachedPreviewTile(actor: FieldActor, tile: TilePoint): boolean {
        return Math.abs(actor.entity.pixelX - tile.x) < 0.03 && Math.abs(actor.entity.pixelY - tile.y) < 0.03;
    }

    private formatCombatEvent(event: CombatEventMessage): string {
        const sourceName = event.sourceName ?? this.getNetworkEntityName(event.sourceId);
        const targetName = event.targetName ?? this.getNetworkEntityName(event.targetId);
        const vars = { source: sourceName, target: targetName, value: event.value ?? 0 };
        if (event.kind === 'miss') return formatT('field.log.combat.miss', vars);
        if (event.kind === 'kill') return formatT('field.log.combat.kill', vars);
        if (event.kind === 'heal') return formatT('field.log.combat.heal', vars);
        if (event.kind === 'down') return formatT('field.log.combat.down', vars);
        if (event.kind === 'status') return formatT('field.log.combat.status', vars);
        if (event.kind === 'curse') return formatT('field.log.combat.curse', vars);
        return formatT('field.log.combat.damage', vars);
    }

    private getNetworkEntityName(entityId: string): string {
        const actor = this.context.getPartyActors().find((candidate) => candidate.id === entityId);
        if (actor) return actor.character.name || actor.entity.label || entityId;
        const enemy = this.context.getEnemyById(entityId);
        if (enemy) return enemy.name || enemy.label || entityId;
        return entityId;
    }
}
