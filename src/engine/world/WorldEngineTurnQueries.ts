import { countCursedArtifactsInPlacedItems } from '../../raid/CursedArtifact';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import { actorTile, isEntityMoving } from './WorldEngineFieldHelpers';
import type { WorldNetworkSyncController } from './WorldNetworkSyncController';
import type { WorldTurnStateController } from './WorldTurnStateController';
import type { ActionMenuUI } from '../../ui/ActionMenuUI';
import type { WorldPlayerActionController } from './WorldPlayerActionController';
import type { WorldTacticalController } from './WorldTacticalController';
import type { WorldMagicController } from './WorldMagicController';
import type { WorldToolController } from './WorldToolController';
import type { TilePoint } from '../../field/FieldPathing';

export function getWorldPathPreviewTiles(
    actor: FieldActor | null,
    networkSyncController: WorldNetworkSyncController
): TilePoint[] {
    if (!actor) return [];
    const networkPreview = networkSyncController.getPathPreviewTiles(actor);
    if (networkPreview) return networkPreview;
    if (isEntityMoving(actor.entity)) {
        const currentTarget = actorTile(actor);
        const [nextStep] = actor.path;
        if (!nextStep || nextStep.x !== currentTarget.x || nextStep.y !== currentTarget.y) {
            return [currentTarget, ...actor.path];
        }
    }
    return actor.path;
}

export function getWorldSpendableActionGauge(input: {
    turnStateController: WorldTurnStateController;
    isNetworkRaid: boolean;
    activeActor: FieldActor | null;
}): number {
    if (input.turnStateController.getActiveTurnActorId() && input.isNetworkRaid) {
        return Math.max(0, Math.floor(input.turnStateController.getRemainingActionPoints()));
    }
    if (!input.activeActor) return input.turnStateController.getRemainingActionPoints();
    return Math.max(input.turnStateController.getRemainingActionPoints(), Math.floor(input.activeActor.entity.actionGauge));
}

export function isWorldTurnCombatActive(input: {
    fieldEnemies: readonly FieldEnemy[];
    turnStateController: WorldTurnStateController;
    actionMenuUI: ActionMenuUI;
    playerActionController: WorldPlayerActionController;
    tacticalController: WorldTacticalController;
    magicController: WorldMagicController;
    toolController: WorldToolController;
    partyActors: readonly FieldActor[];
}): boolean {
    if (input.fieldEnemies.some((entry) => entry.enemy.stats.hp > 0 && entry.enemy.isAggro)) return true;
    if (input.turnStateController.hasTurnActivity()) return true;
    if (input.actionMenuUI.getIsOpen() || input.playerActionController.getMode()) return true;
    if (input.tacticalController.isOpen()) return true;
    if (input.magicController.isActive()) return true;
    if (input.toolController.isActive()) return true;
    return input.partyActors.some((actor) => actor.queuedIntent || actor.path.length > 0);
}

export function getWorldBackpackCursedArtifactCount(
    items: Parameters<typeof countCursedArtifactsInPlacedItems>[0]
): number {
    return countCursedArtifactsInPlacedItems(items);
}
