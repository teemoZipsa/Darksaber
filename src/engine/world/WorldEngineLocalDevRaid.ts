import type { PartyManager } from '../../character/PartyManager';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import { formatT, i18n } from '../../i18n/LanguageManager';
import type { TownInfo } from '../../map/BiomeMask';
import type { WorldMap } from '../../map/WorldMap';
import type { WorldEngineActionControllers } from './WorldEngineActionControllers';
import type { WorldEngineNetworkState } from './WorldEngineNetworkState';
import type { WorldEngineRuntimeState } from './WorldEngineRuntimeState';
import type { WorldEngineScenarioNetworkControllers } from './WorldEngineScenarioNetworkControllers';
import type { WorldRaidSession } from './WorldRaidSession';
import type { WorldTownSession } from './WorldTownSession';
import type { PlayerData } from '../../data/PlayerData';
import { getKaosiaHuntingGrounds, huntingEnemyPrefix } from '../../field/KaosiaHuntingGrounds';
import { getMonsterDefinition } from '../../data/MonsterCatalog';
import { Enemy } from '../../entity/Enemy';
import { applyMonsterSprite } from './NetworkSnapshotMapping';

export interface WorldEngineLocalDevRaidPorts {
    actionControllers: WorldEngineActionControllers;
    networkState: WorldEngineNetworkState;
    party: PartyManager;
    playerData: PlayerData;
    raidSession: WorldRaidSession;
    runtimeState: WorldEngineRuntimeState;
    scenarioNetworkControllers: WorldEngineScenarioNetworkControllers;
    town: TownInfo;
    townSession: WorldTownSession;
    worldMap: WorldMap;
    addCombatLog(message: string): void;
    clearFieldTurnState(): void;
    closeFieldOverlays(): void;
    getControlledActor(): FieldActor | null;
    getFieldActors(): FieldActor[];
    getFieldEnemies(): FieldEnemy[];
    setFieldEnemies(enemies: FieldEnemy[]): void;
    placePartyNearTown(town: TownInfo): void;
    syncControlledPlayer(): void;
}

export function beginWorldEngineLocalDevRaidFromCurrentHub(ports: WorldEngineLocalDevRaidPorts): boolean {
    if (!import.meta.env.DEV) return false;
    const {
        actionControllers,
        networkState,
        party,
        raidSession,
        runtimeState,
        scenarioNetworkControllers,
        town,
        townSession,
        worldMap,
    } = ports;
    ports.closeFieldOverlays();
    townSession.hide();
    networkState.isRaid = false;
    networkState.isConnecting = false;
    networkState.playerId = null;
    runtimeState.currentPhase = 'raid';
    raidSession.beginRaidFromTown(town.id);
    party.resetForNewRaid();
    townSession.applyPendingRestForRaidStart();
    scenarioNetworkControllers.storyScenarioController.resetVisitState();
    scenarioNetworkControllers.storyScenarioController.resetNetworkState();
    ports.placePartyNearTown(town);
    ports.setFieldEnemies(getKaosiaHuntingGrounds(worldMap).flatMap((ground) => ground.members.map((member, index) => {
        const definition = getMonsterDefinition(member.monsterId);
        const enemy = new Enemy(`${huntingEnemyPrefix(ground.id)}${index}`, member.tile.x, member.tile.y,
            definition.name, ground.level, definition.color, definition.role, definition.id);
        enemy.aggroRange = definition.aggroRange;
        enemy.setLocalizedNames(definition.name, definition.nameEn);
        applyMonsterSprite(enemy, definition.id);
        return { enemy, home: { ...member.tile }, path: [] };
    })));
    scenarioNetworkControllers.storyScenarioController.beginLocalBountyHunt();
    const controlled = ports.getControlledActor();
    ports.syncControlledPlayer();
    actionControllers.selectionController.selectActor(controlled?.id ?? null);
    ports.clearFieldTurnState();
    ports.addCombatLog(formatT('mp.deployStarted', {
        town: i18n.lang === 'ko' ? town.nameKr : town.name,
        world: worldMap.getDisplayName(),
    }));
    return true;
}
