import type { Enemy } from '../../entity/Enemy';
import type { FieldActor } from '../../field/FieldTypes';
import type { TilePoint } from '../../field/FieldPathing';
import type { NetworkRaidClient } from '../../net/NetworkRaidClient';
import type { PlayerIntentKind } from '../../net/WorldProtocol';
import {
    createAttackIntentPayload,
    createCastSkillIntentPayload,
    createEndTurnIntentPayload,
    createMoveIntentPayload,
    createUseItemIntentPayload,
} from '../../net/WorldIntentPayloads';
import type { WorldNetworkSyncController } from './WorldNetworkSyncController';

export interface WorldNetworkIntentContext {
    networkSyncController: WorldNetworkSyncController;
    isNetworkRaid(): boolean;
    getNetworkRaidClient(): NetworkRaidClient | null;
}

export class WorldNetworkIntentController {
    private readonly context: WorldNetworkIntentContext;

    constructor(context: WorldNetworkIntentContext) {
        this.context = context;
    }

    public submitMove(actor: FieldActor, tile: TilePoint, path: TilePoint[], apCost: number, pathCost: number): boolean {
        const client = this.getOpenClient();
        if (!client) return false;
        const intentId = client.sendIntent(actor.id, 'move', createMoveIntentPayload(tile, path, apCost, pathCost));
        this.context.networkSyncController.trackPendingMove(intentId, actor.id, tile, path);
        return true;
    }

    public submitAction(actor: FieldActor, action: 'defend' | 'rest'): boolean {
        return this.submitOpenIntent(actor, action, {});
    }

    public submitUseItem(actor: FieldActor, itemId: string): boolean {
        return this.submitOpenIntent(actor, 'useItem', createUseItemIntentPayload(itemId));
    }

    public submitSkill(actor: FieldActor, skillId: string, targetId?: string): boolean {
        return this.submitOpenIntent(actor, 'castSkill', createCastSkillIntentPayload(skillId, targetId));
    }

    public submitAttack(actor: FieldActor, enemy: Enemy): boolean {
        const client = this.getOpenClient();
        if (!client) return false;
        client.sendIntent(actor.id, 'attack', createAttackIntentPayload(enemy.id));
        return true;
    }

    public submitEndTurn(actor: FieldActor, reason: string): boolean {
        const client = this.getOpenClient();
        if (!client) return false;
        client.sendIntent(actor.id, 'endTurn', createEndTurnIntentPayload(reason));
        return true;
    }

    private submitOpenIntent(actor: FieldActor, kind: PlayerIntentKind, payload: unknown): boolean {
        const client = this.getOpenClient();
        if (!client) return false;
        client.sendIntent(actor.id, kind, payload);
        return true;
    }

    private getOpenClient(): NetworkRaidClient | null {
        const client = this.getClient();
        return client?.getIsOpen() ? client : null;
    }

    private getClient(): NetworkRaidClient | null {
        if (!this.context.isNetworkRaid()) return null;
        return this.context.getNetworkRaidClient();
    }
}
