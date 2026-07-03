import { Player } from '../../entity/Player';
import type { Camera } from '../Camera';
import type { FieldActor } from '../../field/FieldTypes';
import { t } from '../../i18n/LanguageManager';
import { NetworkRaidClient } from '../../net/NetworkRaidClient';
import type { WorldEngineActionControllers } from './WorldEngineActionControllers';
import type { WorldEngineSharedControllerPorts } from './WorldEngineSharedControllerPorts';

export interface WorldEngineStartupFlowOptions {
    startIntroTutorial?: boolean;
}

export interface WorldEngineStartupFlowContext {
    camera: Camera;
    options: WorldEngineStartupFlowOptions;
    spawnPartyAtCurrentHub: () => void;
    getControlledActor: () => FieldActor | null;
    setPlayer: (player: Player) => void;
    getPlayer: () => Player;
    selectActor: (actorId: string | null) => void;
    startIntroTutorial: () => void;
    hasStoredNetworkResumeToken: () => boolean;
    beginRaidFromCurrentHub: () => void;
    openCurrentHubTown: () => void;
    addCombatLog: (message: string) => void;
}

export interface WorldEngineStartupFlowSources {
    camera: Camera;
    options: WorldEngineStartupFlowOptions;
    ports: WorldEngineSharedControllerPorts;
    getActionControllers(): WorldEngineActionControllers;
    spawnPartyAtCurrentHub(): void;
    startIntroTutorial(): void;
    beginRaidFromCurrentHub(): void;
    hasStoredNetworkResumeToken?: () => boolean;
}

export function runWorldEngineStartupFlow(context: WorldEngineStartupFlowContext): void {
    context.spawnPartyAtCurrentHub();
    const controlledActor = context.getControlledActor();
    context.setPlayer(controlledActor?.entity ?? new Player(0, 0));
    context.selectActor(controlledActor?.id ?? null);

    if (context.options.startIntroTutorial) {
        context.startIntroTutorial();
    } else if (context.hasStoredNetworkResumeToken()) {
        context.addCombatLog(t('mp.resumeAttempt'));
        context.beginRaidFromCurrentHub();
    } else {
        context.openCurrentHubTown();
        context.addCombatLog(t('field.log.townReady'));
    }

    const player = context.getPlayer();
    context.camera.followTile(player.gridX, player.gridY);
    context.camera.snapToTarget();
}

export function runWorldEngineStartupFlowFromSources(sources: WorldEngineStartupFlowSources): void {
    runWorldEngineStartupFlow({
        camera: sources.camera,
        options: sources.options,
        spawnPartyAtCurrentHub: () => sources.spawnPartyAtCurrentHub(),
        getControlledActor: () => sources.ports.getControlledActor(),
        setPlayer: (player) => sources.ports.setPlayer(player),
        getPlayer: () => sources.ports.getPlayer(),
        selectActor: (actorId) => sources.getActionControllers().selectionController.selectActor(actorId),
        startIntroTutorial: () => sources.startIntroTutorial(),
        hasStoredNetworkResumeToken: sources.hasStoredNetworkResumeToken ?? (() => NetworkRaidClient.hasStoredResumeToken()),
        beginRaidFromCurrentHub: () => sources.beginRaidFromCurrentHub(),
        openCurrentHubTown: () => sources.ports.openTown(sources.ports.getCurrentHubTown()),
        addCombatLog: (message) => sources.ports.addCombatLog(message),
    });
}
