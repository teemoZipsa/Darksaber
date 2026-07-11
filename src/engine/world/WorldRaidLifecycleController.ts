import type { Character } from '../../character/Character';
import type { PartyManager } from '../../character/PartyManager';
import { getPartyCarriedWeight } from '../../inventory/CarryWeight';
import type { PlayerData } from '../../data/PlayerData';
import { normalizeLoadout } from '../../magic/MagicLoadout';
import { formatT, i18n, t } from '../../i18n/LanguageManager';
import type { TownInfo } from '../../map/BiomeMask';
import type { WorldMap } from '../../map/WorldMap';
import { resolveTownArrival } from '../../raid/RaidRules';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import { AudioManager } from '../AudioManager';
import type { GameManager, HubFlushResult } from '../GameManager';
import type { Player } from '../../entity/Player';
import { AuthApiError } from '../../net/AuthClient';
import { NetworkRaidClient, WorldServerError, type NetworkRaidStatus } from '../../net/NetworkRaidClient';
import {
    DEFAULT_WORLD_SERVER_URL,
    type ActionRejectedMessage,
    type ActorSnapshot,
    type AutoLootGrantMessage,
    type CombatEventMessage,
    type InventoryConsumedMessage,
    type InventoryItemCountSnapshot,
    type LootGrantMessage,
    type RaidResultMessage,
    type WorldRealmId,
    type WorldSnapshot,
} from '../../net/WorldProtocol';
import {
    formatNetworkDeployFailure,
    formatNetworkStatusLog,
    formatReconnectRestoredLog,
    formatWorldServerErrorLog,
    getWorldServerErrorMessage,
} from '../../net/NetworkRaidMessages';
import type { WorldRaidOutcomeController } from './WorldRaidOutcomeController';
import type { WorldRaidSession, WorldPhase } from './WorldRaidSession';
import type { WorldTownSession } from './WorldTownSession';
import type { WorldStoryScenarioController } from './WorldStoryScenarioController';
import type { WorldNetworkSyncController } from './WorldNetworkSyncController';
import { formatRaidModifierLog } from '../../raid/RaidModifierMessages';

function displayTownName(town: TownInfo): string {
    return i18n.lang === 'ko' ? town.nameKr : town.name;
}

export interface WorldRaidLifecycleContext {
    party: PartyManager;
    playerData: PlayerData;
    gameManager: GameManager;
    raidSession: WorldRaidSession;
    townSession: WorldTownSession;
    raidOutcomeController: WorldRaidOutcomeController;
    storyScenarioController: WorldStoryScenarioController;
    networkSyncController: WorldNetworkSyncController;
    getWorldMap(): WorldMap;
    getTownById(townId: string): TownInfo | null;
    getCurrentHubTown(): TownInfo;
    getNetworkRaidClient(): NetworkRaidClient | null;
    setNetworkRaidClient(client: NetworkRaidClient | null): void;
    isNetworkRaid(): boolean;
    setIsNetworkRaid(isNetworkRaid: boolean): void;
    isNetworkRaidConnecting(): boolean;
    setIsNetworkRaidConnecting(isConnecting: boolean): void;
    isNetworkWasReconnecting(): boolean;
    setNetworkWasReconnecting(wasReconnecting: boolean): void;
    getNetworkPlayerId(): string | null;
    setNetworkPlayerId(playerId: string | null): void;
    closeFieldOverlays(): void;
    clearFieldTurnState(): void;
    clearIntroTutorialStateForNetworkRaid(): void;
    clearRemotePartyActors(): void;
    placePartyNear(tile: { x: number; y: number }): void;
    getControlledActor(): FieldActor | null;
    setPlayer(player: Player): void;
    setPartyActors(actors: FieldActor[]): void;
    setFieldEnemies(enemies: FieldEnemy[]): void;
    clearWorldLoot(): void;
    selectActor(actorId: string | null): void;
    syncCharacterMovementToClass(character: Character): void;
    isTurnCombatActive(): boolean;
    setPhase(phase: WorldPhase): void;
    applyNetworkSnapshot(snapshot: WorldSnapshot): void;
    handleNetworkCombatEvent(event: CombatEventMessage): void;
    openNetworkLoot(grant: LootGrantMessage): void;
    handleNetworkAutoLootGrant(grant: AutoLootGrantMessage): void;
    handleNetworkInventoryConsumed(message: InventoryConsumedMessage): void;
    handleNetworkActionRejected(rejection: ActionRejectedMessage): void;
    log(message: string): void;
}

export class WorldRaidLifecycleController {
    private readonly context: WorldRaidLifecycleContext;

    constructor(context: WorldRaidLifecycleContext) {
        this.context = context;
    }

    public openTown(town: TownInfo): void {
        if (this.context.isNetworkRaid()) {
            // Reaching town while still flagged as a network raid means the player is
            // abandoning the run client-side, so tell the server instead of going silent.
            this.closeNetworkRaidClient(true);
            this.context.setIsNetworkRaid(false);
            this.context.setNetworkPlayerId(null);
        }
        this.context.closeFieldOverlays();
        AudioManager.stopBgm(600);
        this.context.setPhase('town');
        this.context.raidSession.enterTown(town.id);
        this.context.townSession.show(town);
    }

    public async beginRaidFromCurrentHub(requestedRealm?: WorldRealmId): Promise<void> {
        if (this.context.isNetworkRaidConnecting()) return;
        this.context.clearIntroTutorialStateForNetworkRaid();
        const worldMap = this.context.getWorldMap();
        const targetRealm = requestedRealm ?? worldMap.getRealm();
        if (worldMap.getRealm() !== targetRealm) worldMap.setRealm(targetRealm);
        const town = this.context.getCurrentHubTown();
        const authContext = this.context.gameManager.getNetworkAuthContext();
        if (!authContext) {
            this.context.log(t('mp.deployNoAuth'));
            this.context.setPhase('town');
            this.context.townSession.show(town);
            return;
        }
        this.context.setIsNetworkRaidConnecting(true);
        this.context.log(t('mp.deployConnecting'));
        const isResumeJoin = NetworkRaidClient.hasStoredResumeToken(authContext.characterId);

        try {
            let joinAuthContext = await this.refreshNetworkAuthContext(authContext) ?? authContext;
            if (!isResumeJoin) {
                let flushResult = await this.context.gameManager.flushHubSaveToServer();
                if (!flushResult.ok && this.isAuthExpiredHubFlush(flushResult)) {
                    const refreshed = await this.refreshNetworkAuthContext(joinAuthContext, true);
                    if (refreshed && refreshed.accessToken !== joinAuthContext.accessToken) {
                        joinAuthContext = refreshed;
                        flushResult = await this.context.gameManager.flushHubSaveToServer();
                    }
                }
                if (!flushResult.ok && this.shouldReloadDevAutoStartAuthFromHubFlush(flushResult)) {
                    this.reloadDevAutoStartAuth(town);
                    return;
                }
                if (!flushResult.ok) {
                    this.context.log(t('mp.deployUnavailable'));
                    this.context.setPhase('town');
                    this.context.townSession.show(town);
                    this.context.townSession.setDeployError(
                        formatT('mp.hubSaveFailed', { message: flushResult.message ?? flushResult.code ?? 'unknown' })
                    );
                    return;
                }
            }

            let welcome;
            try {
                welcome = await this.connectNetworkRaid(town, targetRealm, joinAuthContext);
            } catch (error) {
                if (!(error instanceof WorldServerError) || error.code !== 'AUTH_FAILED') throw error;
                const refreshed = await this.refreshNetworkAuthContext(authContext, true);
                if (!refreshed || refreshed.accessToken === joinAuthContext.accessToken) throw error;
                this.context.log(t('mp.deployRetryAuth'));
                joinAuthContext = refreshed;
                welcome = await this.connectNetworkRaid(town, targetRealm, joinAuthContext);
            }

            this.applyServerCompletedQuestIds(welcome.completedQuestIds);
            this.context.townSession.hide();
            this.context.closeFieldOverlays();
            this.context.setNetworkPlayerId(welcome.playerId);
            this.context.setIsNetworkRaid(true);
            this.context.gameManager.setHubFlushEnabled(false);
            this.context.setPhase('raid');
            this.context.raidSession.beginRaidFromTown(town.id);
            if (welcome.raidModifier !== undefined) this.context.raidSession.setRaidModifier(welcome.raidModifier);
            this.context.storyScenarioController.resetVisitState();
            if (!isResumeJoin) {
                this.context.party.resetForNewRaid();
                this.context.townSession.applyPendingRestForRaidStart();
            }
            this.context.clearRemotePartyActors();
            this.context.storyScenarioController.resetNetworkState();
            this.context.setPartyActors([]);
            this.context.placePartyNear(welcome.spawnTile);
            const controlled = this.context.getControlledActor();
            if (controlled) this.context.setPlayer(controlled.entity);
            this.context.selectActor(controlled?.id ?? null);
            this.context.setFieldEnemies([]);
            this.context.clearWorldLoot();
            this.context.clearFieldTurnState();
            this.context.log(isResumeJoin
                ? formatT('mp.deployResumed', { world: worldMap.getDisplayName() })
                : formatT('mp.deployStarted', { town: displayTownName(town), world: worldMap.getDisplayName() }));
            if (this.context.raidSession.raidModifier) this.context.log(formatRaidModifierLog(this.context.raidSession.raidModifier));
        } catch (error) {
            if (this.shouldReloadDevAutoStartAuth(error)) {
                this.reloadDevAutoStartAuth(town);
                return;
            }
            this.context.setIsNetworkRaid(false);
            this.context.setNetworkPlayerId(null);
            this.closeNetworkRaidClient(false);
            const errorMessage = getWorldServerErrorMessage(error);
            console.error('[Darksaber] World deploy failed', error);
            this.context.log(formatNetworkDeployFailure(error));
            this.context.log(t('mp.deployUnavailable'));
            this.context.setPhase('town');
            this.context.townSession.show(town);
            this.context.townSession.setDeployError(formatT('mp.deployFailed', { message: errorMessage }));
        } finally {
            this.context.setIsNetworkRaidConnecting(false);
        }
    }

    private isAuthExpiredHubFlush(result: HubFlushResult): boolean {
        return result.code === 'access_invalid' || result.code === 'access_missing';
    }

    private shouldReloadDevAutoStartAuthFromHubFlush(result: HubFlushResult): boolean {
        return this.isAuthExpiredHubFlush(result) && this.isDevAutoStart();
    }

    public updateRaidTimer(dt: number): void {
        const result = this.context.raidSession.advanceTimer(dt, {
            townVisible: this.context.townSession.isVisible(),
            resultVisible: this.context.raidOutcomeController.isVisible(),
            turnCombatActive: this.context.isTurnCombatActive(),
        });
        if (result.advanced) this.context.townSession.advancePartyTimedRestStatuses(dt);
        if (result.expired) {
            this.context.raidOutcomeController.completeFailure('MIA');
        }
    }

    public checkRaidEndConditions(): void {
        if (!this.context.raidSession.active || this.context.raidOutcomeController.isVisible()) return;
        if (this.context.party.isSquadWiped()) {
            this.context.raidOutcomeController.completeFailure('DEAD');
            return;
        }
        this.checkTownArrival();
    }

    public handleNetworkRaidResult(result: RaidResultMessage): void {
        if (result.playerId !== this.context.getNetworkPlayerId()) return;
        this.closeNetworkRaidClient(false);
        this.context.setIsNetworkRaid(false);
        this.context.setNetworkPlayerId(null);
        this.context.raidSession.elapsedSeconds = result.elapsedSeconds;
        this.context.raidSession.kills = result.kills;
        this.context.storyScenarioController.applyNetworkScenarioResult(result.completedDungeonIds);
        void this.finishNetworkRaidResult(result);
    }

    private async finishNetworkRaidResult(result: RaidResultMessage): Promise<void> {
        const goldBeforeSync = this.context.playerData.gold;
        const syncResult = await this.context.gameManager.syncHubSaveFromServer();
        this.context.gameManager.setHubFlushEnabled(true);
        if (!syncResult.ok) {
            this.context.log(formatT('mp.hubSaveSyncFailed', { message: syncResult.message ?? syncResult.code ?? 'unknown' }));
        }
        if (result.result === 'SURVIVED') {
            const town = this.context.getTownById(result.extractionTownId) ?? this.context.getCurrentHubTown();
            const displayGoldReward = syncResult.ok
                ? Math.max(0, this.context.playerData.gold - goldBeforeSync)
                : undefined;
            this.context.raidOutcomeController.completeSuccess(town, {
                serverAuthoritativeRewards: true,
                displayGoldReward,
                firstSurvivalBonus: result.firstSurvivalBonusGranted === true,
            });
        } else if (result.result === 'DEAD' || result.result === 'MIA') {
            this.context.raidOutcomeController.completeFailure(result.result);
        } else {
            this.context.raidSession.failBackToTown(this.context.raidSession.currentHubTownId);
            this.openTown(this.context.getCurrentHubTown());
        }
    }

    public handleNetworkGraceExpired(): void {
        if (!this.context.isNetworkRaid() || !this.context.raidSession.active) return;
        this.context.log(t('mp.graceExpired'));
        this.closeNetworkRaidClient(false);
        this.context.setIsNetworkRaid(false);
        this.context.setNetworkPlayerId(null);
        void this.finishGraceExpiredRaid();
    }

    private async finishGraceExpiredRaid(): Promise<void> {
        const syncResult = await this.context.gameManager.syncHubSaveFromServer();
        this.context.gameManager.setHubFlushEnabled(true);
        if (!syncResult.ok) {
            this.context.log(formatT('mp.hubSaveSyncFailed', { message: syncResult.message ?? syncResult.code ?? 'unknown' }));
        }
        this.context.raidOutcomeController.completeFailure('MIA');
    }

    public closeNetworkRaidClient(sendLeave: boolean, reason: 'town' | 'wipe' | 'manual' = 'manual'): void {
        this.context.networkSyncController.clearPendingState();
        this.context.storyScenarioController.resetNetworkState();
        this.context.clearRemotePartyActors();
        const client = this.context.getNetworkRaidClient();
        if (!client) return;
        if (sendLeave) client.leave(reason);
        else client.close();
        this.context.setNetworkRaidClient(null);
    }

    private checkTownArrival(): void {
        const actor = this.context.getControlledActor();
        const worldMap = this.context.getWorldMap();
        if (!actor || !worldMap.isWalkable(actor.entity.gridX, actor.entity.gridY)) return;

        const town = worldMap.getTownAtTile(actor.entity.gridX, actor.entity.gridY);
        const arrival = resolveTownArrival(town?.id, this.context.raidSession.departureTownId, this.context.raidSession.active);
        if (arrival.kind === 'none') {
            this.context.raidSession.clearDepartureBlock();
            return;
        }
        if (arrival.kind === 'departureBlocked') {
            if (this.context.raidSession.shouldReportDepartureBlock(arrival.townId)) {
                this.context.log(t('field.log.departureTownBlocked'));
            }
            return;
        }

        const destination = town ?? this.context.getTownById(arrival.townId ?? '') ?? this.context.getCurrentHubTown();
        this.context.raidOutcomeController.completeSuccess(destination);
    }

    private shouldReloadDevAutoStartAuth(error: unknown): boolean {
        if (!(error instanceof WorldServerError) || error.code !== 'AUTH_FAILED') return false;
        return this.isDevAutoStart();
    }

    private isDevAutoStart(): boolean {
        if (import.meta.env?.DEV !== true || typeof window === 'undefined') return false;
        const devStart = new URLSearchParams(window.location.search).get('devStart');
        return devStart === '1' || devStart === 'town' || devStart === 'raid';
    }

    private reloadDevAutoStartAuth(town: TownInfo): void {
        console.warn('[Darksaber] Dev auth expired after server restart; reloading to issue a fresh dev session.');
        this.context.log(t('mp.devAuthReload'));
        this.context.setPhase('town');
        this.context.townSession.show(town);
        this.context.townSession.setDeployError(t('mp.devAuthRefreshing'));
        NetworkRaidClient.clearStoredResumeTokens();
        window.setTimeout(() => window.location.reload(), 250);
    }

    private async connectNetworkRaid(
        town: TownInfo,
        requestedRealm: WorldRealmId,
        authContext: { accessToken: string; characterId: string }
    ) {
        this.closeNetworkRaidClient(false);
        const client = this.createNetworkRaidClient();
        this.context.setNetworkRaidClient(client);
        return client.connectAndJoin({
            accessToken: authContext.accessToken,
            characterId: authContext.characterId,
            originHubId: town.id,
            partyComposition: this.createPartyCompositionSnapshot(town),
            carriedWeight: getPartyCarriedWeight(this.context.gameManager.inventory.items, this.context.party.getCharacters()),
            carriedItems: this.createCarriedItemCounts(),
            completedQuestIds: Array.from(this.context.playerData.clearedStages),
            requestedRealm,
        });
    }

    private async refreshNetworkAuthContext(
        authContext: { accessToken: string; characterId: string },
        logFailure = false
    ): Promise<{ accessToken: string; characterId: string } | null> {
        try {
            const refreshed = await this.context.gameManager.refreshNetworkAuthContext();
            if (!refreshed || refreshed.characterId !== authContext.characterId) return null;
            return refreshed;
        } catch (error) {
            if (logFailure) {
                if (error instanceof AuthApiError) {
                    this.context.log(formatT('mp.authRefreshFailedHttp', { status: error.status }));
                } else {
                    this.context.log(formatT('mp.authRefreshFailed', {
                        message: error instanceof Error ? error.message : t('mp.error.unknown'),
                    }));
                }
            }
            return null;
        }
    }

    private createNetworkRaidClient(): NetworkRaidClient {
        return new NetworkRaidClient({
            url: DEFAULT_WORLD_SERVER_URL,
            onSnapshot: (snapshot) => this.context.applyNetworkSnapshot(snapshot),
            onCombatEvent: (event) => this.context.handleNetworkCombatEvent(event),
            onLootGrant: (grant) => this.context.openNetworkLoot(grant),
            onAutoLootGrant: (grant) => this.context.handleNetworkAutoLootGrant(grant),
            onInventoryConsumed: (message) => this.context.handleNetworkInventoryConsumed(message),
            onScenarioFieldEventResult: (message) => this.context.storyScenarioController.applyNetworkScenarioFieldEventResult(message),
            onScenarioFieldEventBroadcast: (message) => this.context.storyScenarioController.applyNetworkScenarioFieldEventBroadcast(message),
            onScenarioEnemyDefeatEvent: (message) => this.context.storyScenarioController.applyNetworkScenarioEnemyDefeatEvent(message),
            onRaidResult: (result) => this.handleNetworkRaidResult(result),
            onActionRejected: (rejection) => this.context.handleNetworkActionRejected(rejection),
            onErrorMessage: (error) => this.context.log(formatWorldServerErrorLog(error)),
            onStatusChange: (status) => this.handleNetworkStatusChange(status),
            onGraceExpired: () => this.handleNetworkGraceExpired(),
        });
    }

    private handleNetworkStatusChange(status: NetworkRaidStatus): void {
        switch (status) {
            case 'connecting':
                this.context.log(formatNetworkStatusLog(status));
                break;
            case 'connected':
                this.context.log(this.context.isNetworkWasReconnecting()
                    ? formatReconnectRestoredLog()
                    : formatNetworkStatusLog(status));
                this.context.setNetworkWasReconnecting(false);
                break;
            case 'reconnecting':
                this.context.setNetworkWasReconnecting(true);
                this.context.log(formatNetworkStatusLog(status));
                break;
            case 'disconnected':
                this.context.log(formatNetworkStatusLog(status));
                this.context.setNetworkWasReconnecting(false);
                break;
            case 'idle':
                break;
        }
    }

    private createPartyCompositionSnapshot(town: TownInfo): ActorSnapshot[] {
        const exit = this.context.getWorldMap().getTownExitTile(town);
        return this.context.party.getCharacters().slice(0, this.context.party.MAX_ACTIVE_PARTY_SIZE).map((character, index) => {
            this.context.syncCharacterMovementToClass(character);
            return {
                id: character.id,
                localActorId: character.id,
                name: character.name,
                classLineId: character.classLineId,
                currentTier: character.currentTier,
                level: character.level,
                tile: {
                    x: exit.x + (index === 2 ? 1 : 0),
                    y: exit.y + (index === 1 ? 1 : 0),
                },
                stats: { ...character.stats },
                statuses: character.statuses.map((status) => ({ ...status })),
                actionGauge: 0,
                remainingAp: 0,
                majorActionUsed: false,
                facing: 'down',
                isDead: character.isDead,
                magicLoadout: normalizeLoadout(character.magicLoadout, character),
                skillUpgradeLevels: { ...character.skillUpgradeLevels },
            };
        });
    }

    private createCarriedItemCounts(): InventoryItemCountSnapshot[] {
        const counts = new Map<string, number>();
        for (const placed of this.context.gameManager.inventory.items) {
            const quantity = Math.max(1, Math.floor(placed.quantity));
            counts.set(placed.item.id, (counts.get(placed.item.id) ?? 0) + quantity);
        }
        return [...counts.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
    }

    private applyServerCompletedQuestIds(completedQuestIds: readonly string[] | undefined): void {
        if (!completedQuestIds) return;
        this.context.playerData.clearedStages = new Set(completedQuestIds);
    }
}
