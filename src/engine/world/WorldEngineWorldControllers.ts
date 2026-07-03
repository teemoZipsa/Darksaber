import type { PartyManager } from '../../character/PartyManager';
import type { Player } from '../../entity/Player';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import type { TilePoint } from '../../field/FieldPathing';
import type { WorldMap } from '../../map/WorldMap';
import type { WorldRealmId } from '../../net/WorldProtocol';
import type { EffectManager } from '../../ui/EffectManager';
import type { FloatingTextManager } from '../../ui/FloatingTextManager';
import type { FusionTempleUI } from '../../ui/FusionTempleUI';
import { MinimapUI } from '../../ui/MinimapUI';
import type { Camera } from '../Camera';
import type { WorldPhase, WorldRaidSession } from './WorldRaidSession';
import { WorldCombatFeedbackController } from './WorldCombatFeedbackController';
import type { WorldEngineRuntimeState } from './WorldEngineRuntimeState';
import type { WorldEngineSharedControllerPorts } from './WorldEngineSharedControllerPorts';
import { WorldRestingController } from './WorldRestingController';
import { WorldTempleController } from './WorldTempleController';

export interface WorldEngineWorldControllerPorts {
    camera: Camera;
    party: PartyManager;
    raidSession: WorldRaidSession;
    fusionTempleUI: FusionTempleUI;
    floatingText: FloatingTextManager;
    effectManager: EffectManager;
    getWorldTime(): number;
    getWorldMap(): WorldMap;
    getPlayer(): Player;
    setPlayer(player: Player): void;
    getControlledActor(): FieldActor | null;
    getPartyActors(): FieldActor[];
    getFieldEnemies(): FieldEnemy[];
    setFieldEnemies(enemies: FieldEnemy[]): void;
    isNetworkRaid(): boolean;
    getPhase(): WorldPhase;
    setPhase(phase: WorldPhase): void;
    beginRaidFromCurrentHub(realm: WorldRealmId): void;
    closeFieldOverlays(): void;
    clearFieldTurnState(): void;
    placePartyNear(tile: TilePoint): void;
    clearWorldLoot(): void;
    selectActor(actorId: string | null): void;
    addCombatLog(message: string): void;
}

export interface WorldEngineWorldControllers {
    minimapUI: MinimapUI;
    combatFeedbackController: WorldCombatFeedbackController;
    templeController: WorldTempleController;
    restingController: WorldRestingController;
}

export interface WorldEngineWorldControllerSources {
    ports: WorldEngineSharedControllerPorts;
    getRuntimeState(): WorldEngineRuntimeState;
    beginRaidFromCurrentHub(realm: WorldRealmId): void;
}

export function createWorldEngineWorldControllersFromSources(
    sources: WorldEngineWorldControllerSources
): WorldEngineWorldControllers {
    return createWorldEngineWorldControllers({
        ...sources.ports,
        getWorldTime: () => sources.getRuntimeState().worldTime,
        getPhase: () => sources.getRuntimeState().currentPhase,
        setPhase: (phase) => sources.ports.setCurrentPhase(phase),
        beginRaidFromCurrentHub: (realm) => sources.beginRaidFromCurrentHub(realm),
        clearWorldLoot: () => { sources.ports.getWorldMap().loot = []; },
    });
}

export function createWorldEngineWorldControllers(
    ports: WorldEngineWorldControllerPorts
): WorldEngineWorldControllers {
    const minimapUI = new MinimapUI({
        getTile: (gx, gy) => ports.getWorldMap().getTileAt(gx, gy),
        getPlayerPos: () => {
            const player = ports.getPlayer();
            return { x: player.gridX, y: player.gridY };
        },
        getBounds: () => ports.getWorldMap().getBoundsTiles(),
        getLandmarks: () => ports.getWorldMap().getMapLandmarks(),
        getEnemies: () => ports.getFieldEnemies().map((entry) => entry.enemy),
        getExtractionZones: () => ports.getWorldMap().extractionZones,
        getLoot: () => ports.getWorldMap().loot,
    });

    const combatFeedbackController = new WorldCombatFeedbackController({
        getWorldTime: () => ports.getWorldTime(),
        shakeCamera: (amount, durationMs) => ports.camera.shake(amount, durationMs),
    });

    const templeController = new WorldTempleController({
        party: ports.party,
        raidSession: ports.raidSession,
        fusionTempleUI: ports.fusionTempleUI,
        getWorldMap: () => ports.getWorldMap(),
        getControlledActor: () => ports.getControlledActor(),
        getFieldEnemies: () => ports.getFieldEnemies(),
        isNetworkRaid: () => ports.isNetworkRaid(),
        getPhase: () => ports.getPhase(),
        setPhase: (phase) => ports.setPhase(phase),
        beginRaidFromCurrentHub: (realm) => ports.beginRaidFromCurrentHub(realm),
        closeFieldOverlays: () => ports.closeFieldOverlays(),
        clearFieldTurnState: () => ports.clearFieldTurnState(),
        placePartyNear: (tile) => ports.placePartyNear(tile),
        setPlayer: (player) => ports.setPlayer(player),
        setFieldEnemies: (enemies) => ports.setFieldEnemies(enemies),
        clearWorldLoot: () => ports.clearWorldLoot(),
        selectActor: (actorId) => ports.selectActor(actorId),
        log: (message) => ports.addCombatLog(message),
    });

    const restingController = new WorldRestingController({
        getPartyActors: () => ports.getPartyActors(),
        spawnHeal: (x, y, amount) => ports.floatingText.spawnHeal(x, y, amount),
        spawnStatus: (x, y, text) => ports.floatingText.spawnStatus(x, y, text),
        spawnHealEffect: (x, y) => ports.effectManager.spawnHealEffect(x, y),
        log: (message) => ports.addCombatLog(message),
    });

    return {
        minimapUI,
        combatFeedbackController,
        templeController,
        restingController,
    };
}
