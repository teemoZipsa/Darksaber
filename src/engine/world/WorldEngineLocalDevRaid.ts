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
import { resolveBountyContract } from '../../data/BountyContractData';
import { getMonsterDefinition } from '../../data/MonsterCatalog';
import { Enemy } from '../../entity/Enemy';
import { applyBountyEliteBaseline } from '../../field/EliteAffixes';
import { applyMonsterSprite } from './NetworkSnapshotMapping';
import { formatMonsterName } from '../../i18n/DisplayNames';

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
    spawnLocalBountyTarget(ports);
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

function spawnLocalBountyTarget(ports: WorldEngineLocalDevRaidPorts): void {
    const contract = resolveBountyContract(ports.playerData.activeBountyContractId);
    const withoutOldBounties = ports.getFieldEnemies().filter((entry) => !entry.enemy.bountyContractId);
    if (!contract) {
        ports.setFieldEnemies(withoutOldBounties);
        return;
    }
    const definition = getMonsterDefinition(contract.monsterId);
    const anchor = ports.worldMap.getTownSpawnTile(ports.town);
    const occupied = new Set<string>([
        ...ports.getFieldActors().map((actor) => tileKey(actor.entity.gridX, actor.entity.gridY)),
        ...withoutOldBounties.map((entry) => tileKey(entry.enemy.gridX, entry.enemy.gridY)),
    ]);
    const tile = findLocalBountyTile(ports.worldMap, {
        x: anchor.x + 16,
        y: anchor.y + 9,
    }, occupied);
    if (!tile) {
        ports.setFieldEnemies(withoutOldBounties);
        return;
    }
    const enemy = new Enemy(
        `local_${contract.id}`,
        tile.x,
        tile.y,
        formatMonsterName(definition),
        contract.monsterLevel,
        definition.color,
        definition.role,
        definition.id,
    );
    enemy.stats = applyBountyEliteBaseline(enemy.stats);
    enemy.aggroRange = Math.max(8, definition.aggroRange);
    enemy.setEliteAffixes(contract.affixIds, contract.id);
    applyMonsterSprite(enemy, definition.id);
    ports.setFieldEnemies([...withoutOldBounties, {
        enemy,
        home: { ...tile },
        path: [],
    }]);
    ports.addCombatLog(formatT('bounty.targetAlive', {}));
}

function findLocalBountyTile(
    worldMap: WorldMap,
    target: { x: number; y: number },
    occupiedTiles: ReadonlySet<string>,
): { x: number; y: number } | null {
    for (let radius = 0; radius <= 16; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                const candidate = { x: target.x + dx, y: target.y + dy };
                if (
                    worldMap.isWalkable(candidate.x, candidate.y)
                    && !occupiedTiles.has(tileKey(candidate.x, candidate.y))
                ) {
                    return candidate;
                }
            }
        }
    }
    return null;
}

function tileKey(x: number, y: number): string {
    return `${x},${y}`;
}
