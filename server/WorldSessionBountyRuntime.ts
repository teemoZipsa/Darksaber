import {
    getBountyHuntLayout,
    type BountyHuntLayout,
} from '../src/data/BountyHuntPlacement';
import { resolveBountyContract } from '../src/data/BountyContractData';
import { INTERACT_ACTION_GAUGE_COST } from '../src/field/FieldActionEconomy';
import { manhattan } from '../src/field/FieldPathing';
import type {
    BountyClueInteractMessage,
    BountyClueResultMessage,
    BountyHuntSnapshot,
} from '../src/net/WorldProtocol';
import { reject } from './WorldSessionHelpers';
import type { WorldSessionContentSpawner } from './WorldSessionContentSpawner';
import type {
    ServerActor,
    ServerBountyState,
    ServerEnemy,
    ServerPlayer,
    WorldSessionMessageResult,
} from './WorldSessionTypes';
import type { WorldMap } from '../src/map/WorldMap';

const BOUNTY_CLUE_DISCOVERY_DISTANCE = 6;
const BOUNTY_CLUE_COUNT = 2;

export interface WorldSessionBountyRuntimeContext {
    players: Map<string, ServerPlayer>;
    actors: ReadonlyMap<string, ServerActor>;
    enemies: Map<string, ServerEnemy>;
    worldMap: WorldMap;
    contentSpawner: WorldSessionContentSpawner;
    spendActorGauge(actor: ServerActor, cost: number): void;
    finishActorIfSpent(actor: ServerActor): void;
    log(message: string): void;
}

export class WorldSessionBountyRuntime {
    public constructor(private readonly context: WorldSessionBountyRuntimeContext) {}

    public initializePlayer(player: ServerPlayer): void {
        const bounty = player.bounty;
        if (!bounty) return;
        if (player.saveSnapshot?.questState.activeBountyContractId !== bounty.contractId) {
            this.removeBountyRuntime(player);
            return;
        }
        const layout = this.ensureLayout(bounty);
        if (!layout) {
            this.removeBountyRuntime(player);
            return;
        }
        this.reconcileTarget(player, layout);
    }

    public reconcileRestoredPlayers(): void {
        for (const player of this.context.players.values()) {
            this.initializePlayer(player);
        }
    }

    public handleClueInteract(
        playerId: string,
        message: BountyClueInteractMessage,
    ): WorldSessionMessageResult {
        const player = this.context.players.get(playerId);
        const actor = this.context.actors.get(message.actorId);
        const validationError = this.validateActor(player, actor);
        if (validationError) return reject(message.intentId, validationError);

        const bounty = player!.bounty;
        if (!bounty) return reject(message.intentId, 'No bounty hunt is active.');
        if (player!.saveSnapshot?.questState.activeBountyContractId !== bounty.contractId) {
            return reject(message.intentId, 'Bounty contract is no longer active.');
        }
        const layout = this.ensureLayout(bounty);
        if (!layout) return reject(message.intentId, 'Bounty hunt layout is unavailable.');

        const cluesFound = normalizeCluesFound(bounty.cluesFound);
        if (cluesFound >= BOUNTY_CLUE_COUNT || bounty.proofEarned) {
            return reject(message.intentId, 'Bounty clues are already complete.');
        }
        const expectedClue = bounty.clueSites?.[cluesFound];
        const clueId = typeof message.clueId === 'string' ? message.clueId.trim() : '';
        if (!expectedClue || !clueId || clueId !== expectedClue.id) {
            return reject(message.intentId, 'Bounty clue is not currently available.');
        }
        if (actor!.remainingAp < INTERACT_ACTION_GAUGE_COST) {
            return reject(message.intentId, 'Actor action gauge is not ready.');
        }
        if (manhattan(actor!.tile, expectedClue.tile) > 1) {
            return reject(message.intentId, 'Bounty clue is too far away.');
        }

        this.context.spendActorGauge(actor!, INTERACT_ACTION_GAUGE_COST);
        bounty.cluesFound = cluesFound + 1;
        if (bounty.cluesFound >= BOUNTY_CLUE_COUNT) {
            this.context.contentSpawner.spawnBountyTarget(player!, bounty.targetAnchor ?? layout.lair.tile);
        }
        this.context.finishActorIfSpent(actor!);
        const targetRevealed = normalizeCluesFound(bounty.cluesFound) >= BOUNTY_CLUE_COUNT;
        const result: BountyClueResultMessage = {
            type: 'BOUNTY_CLUE_RESULT',
            intentId: message.intentId,
            contractId: bounty.contractId,
            clueId: expectedClue.id,
            cluesFound: normalizeCluesFound(bounty.cluesFound),
            targetRevealed,
        };
        this.context.log(
            `bounty clue player=${playerId} contract=${bounty.contractId} clues=${result.cluesFound}/${BOUNTY_CLUE_COUNT}`,
        );
        return { replies: [result], broadcasts: [] };
    }

    public createSnapshot(viewerPlayerId: string | null): BountyHuntSnapshot | undefined {
        if (!viewerPlayerId) return undefined;
        const player = this.context.players.get(viewerPlayerId);
        const bounty = player?.bounty;
        if (!player?.active || !bounty) return undefined;
        const layout = this.ensureLayout(bounty);
        if (!layout) return undefined;

        const cluesFound = normalizeCluesFound(bounty.cluesFound);
        const currentClue = cluesFound < BOUNTY_CLUE_COUNT
            ? bounty.clueSites?.[cluesFound]
            : undefined;
        const searchArea = !player.activeDungeonId && cluesFound < BOUNTY_CLUE_COUNT
            ? bounty.searchAreas?.[cluesFound] ?? {
                center: { ...layout.lastSeenArea.center },
                radius: layout.lastSeenArea.radius,
            }
            : null;
        const nearbyClue = !player.activeDungeonId
            && currentClue
            && this.hasLivingActorNear(player, currentClue.tile, BOUNTY_CLUE_DISCOVERY_DISTANCE)
            ? {
                clueId: currentClue.id,
                kind: currentClue.kind,
                tile: { ...currentClue.tile },
            }
            : undefined;

        return {
            contractId: bounty.contractId,
            cluesFound,
            totalClues: BOUNTY_CLUE_COUNT,
            searchArea: searchArea ? {
                center: { ...searchArea.center },
                radius: searchArea.radius,
            } : null,
            ...(nearbyClue ? { nearbyClue } : {}),
            targetRevealed: cluesFound >= BOUNTY_CLUE_COUNT,
            proofEarned: bounty.proofEarned,
        };
    }

    private validateActor(
        player: ServerPlayer | undefined,
        actor: ServerActor | undefined,
    ): string | null {
        if (!player || !player.active) return 'Player is not in an active raid.';
        if (player.ghost) return 'Ghost players cannot inspect bounty clues.';
        if (player.activeDungeonId) return 'Bounty clues are unavailable inside a scenario.';
        if (!actor) return 'Actor does not exist.';
        if (actor.ownerPlayerId !== player.id) return 'Actor is not owned by this player.';
        if (actor.isDead || actor.stats.hp <= 0) return 'Actor is down.';
        return null;
    }

    private ensureLayout(bounty: ServerBountyState): BountyHuntLayout | null {
        const contract = resolveBountyContract(bounty.contractId);
        if (!contract) return null;
        const layout = getBountyHuntLayout(contract, this.context.worldMap);
        if (!layout) return null;

        // Exact placement is always re-derived from trusted contract/map data.
        // Persisted copies exist only to keep snapshots self-contained and are
        // intentionally never authoritative on restore.
        bounty.clueSites = layout.clues.map((clue) => ({
            id: clue.id,
            kind: clue.kind,
            tile: { ...clue.tile },
        }));
        bounty.searchAreas = [{
            center: { ...layout.lastSeenArea.center },
            radius: layout.lastSeenArea.radius,
        }, {
            center: { ...layout.clues[1].tile },
            radius: 10,
        }];
        bounty.targetAnchor = { ...layout.lair.tile };
        bounty.cluesFound = normalizeCluesFound(bounty.cluesFound);
        return layout;
    }

    private reconcileTarget(player: ServerPlayer, layout: BountyHuntLayout): void {
        const bounty = player.bounty!;
        const ownedTargets = [...this.context.enemies.values()]
            .filter((entry) => entry.bountyPlayerId === player.id);
        const matchingTargets = ownedTargets.filter((entry) => (
            entry.bountyContractId === bounty.contractId
            && entry.enemy.stats.hp > 0
        ));
        const target = matchingTargets.find((entry) => entry.enemy.id === bounty.targetEnemyId)
            ?? matchingTargets[0];
        for (const stale of ownedTargets) {
            if (stale === target) continue;
            this.context.enemies.delete(stale.enemy.id);
        }

        if (bounty.proofEarned) {
            if (target) this.context.enemies.delete(target.enemy.id);
            bounty.targetEnemyId = null;
            bounty.cluesFound = BOUNTY_CLUE_COUNT;
            return;
        }
        if (target) {
            bounty.targetEnemyId = target.enemy.id;
            bounty.cluesFound = BOUNTY_CLUE_COUNT;
            return;
        }

        bounty.targetEnemyId = null;
        if (normalizeCluesFound(bounty.cluesFound) >= BOUNTY_CLUE_COUNT) {
            this.context.contentSpawner.spawnBountyTarget(
                player,
                bounty.targetAnchor ?? layout.lair.tile,
            );
        }
    }

    private removeBountyRuntime(player: ServerPlayer): void {
        for (const [enemyId, entry] of this.context.enemies) {
            if (entry.bountyPlayerId === player.id) this.context.enemies.delete(enemyId);
        }
        player.bounty = undefined;
    }

    private hasLivingActorNear(player: ServerPlayer, tile: { x: number; y: number }, distance: number): boolean {
        return player.actorIds.some((actorId) => {
            const actor = this.context.actors.get(actorId);
            return Boolean(
                actor
                && !actor.isDead
                && actor.stats.hp > 0
                && manhattan(actor.tile, tile) <= distance
            );
        });
    }
}

function normalizeCluesFound(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(BOUNTY_CLUE_COUNT, Math.floor(value)));
}
