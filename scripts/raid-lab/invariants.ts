import type { WorldSession } from '../../server/WorldSession';
import type { ServerActor, ServerPlayer } from '../../server/WorldSessionTypes';
import type { InventorySaveSnapshot } from '../../src/shared/CharacterSave';
import type { RaidLabInvariantViolation, RaidLabPartySize } from './types';

export interface InvariantCheckContext {
    session: WorldSession;
    playerId: string;
    simMs: number;
    actionIndex: number;
    raidFinished: boolean;
    /** Expected party size when known (Phase 4b). */
    expectedPartySize?: RaidLabPartySize;
}

export function checkRaidLabInvariants(context: InvariantCheckContext): RaidLabInvariantViolation[] {
    const violations: RaidLabInvariantViolation[] = [];
    const push = (code: string, message: string) => {
        violations.push({
            code,
            message,
            simMs: context.simMs,
            actionIndex: context.actionIndex,
        });
    };

    const debug = context.session.getDebugState();
    const player = debug.players.get(context.playerId);

    if (context.raidFinished) {
        if (player) push('player_lingering_after_result', `Player ${context.playerId} still present after raid result`);
        return violations;
    }

    if (!player) {
        push('missing_active_player', `Expected active player ${context.playerId}`);
        return violations;
    }

    checkPlayer(player, push);
    if (new Set(player.actorIds).size !== player.actorIds.length) {
        push('duplicate_actor_id', `Player ${player.id} has duplicate actorIds`);
    }
    if (context.expectedPartySize !== undefined && player.actorIds.length !== context.expectedPartySize) {
        push(
            'party_size_mismatch',
            `Expected partySize=${context.expectedPartySize} got actorIds=${player.actorIds.length}`,
        );
    }
    if (player.actorIds.length > 3) {
        push('party_size_over_cap', `Player ${player.id} has ${player.actorIds.length} actors (cap 3)`);
    }

    const localIds = new Set<string>();
    for (const actorId of player.actorIds) {
        const actor = debug.actors.get(actorId);
        if (!actor) {
            push('missing_actor', `Missing actor ${actorId} for player ${player.id}`);
            continue;
        }
        if (actor.ownerPlayerId !== player.id) {
            push('actor_owner_mismatch', `Actor ${actor.id} owner=${actor.ownerPlayerId} expected=${player.id}`);
        }
        if (localIds.has(actor.localActorId)) {
            push('duplicate_local_actor_id', `Player ${player.id} duplicate localActorId=${actor.localActorId}`);
        }
        localIds.add(actor.localActorId);
        checkActor(actor, push);
    }

    const entityKinds = new Map<string, string>();
    const checkEntityId = (mapKey: string, entityId: string, kind: string) => {
        if (mapKey !== entityId) {
            push(`${kind}_map_key_mismatch`, `${kind} map key=${mapKey} entity.id=${entityId}`);
        }
        const previousKind = entityKinds.get(entityId);
        if (previousKind) {
            push('duplicate_entity_id', `Entity id=${entityId} reused by ${previousKind} and ${kind}`);
        } else {
            entityKinds.set(entityId, kind);
        }
    };
    for (const [mapKey, actor] of debug.actors) {
        checkEntityId(mapKey, actor.id, 'actor');
    }
    for (const [mapKey, enemy] of debug.enemies) {
        checkEntityId(mapKey, enemy.enemy.id, 'enemy');
    }
    for (const [mapKey, loot] of debug.loot) {
        checkEntityId(mapKey, loot.id, 'loot');
    }

    for (const enemy of debug.enemies.values()) {
        if (!Number.isFinite(enemy.enemy.stats.hp)) {
            push('enemy_hp_nonfinite', `Enemy ${enemy.enemy.id} has non-finite HP`);
        }
        if (enemy.enemy.stats.hp < 0) {
            push('enemy_hp_negative', `Enemy ${enemy.enemy.id} HP ${enemy.enemy.stats.hp} < 0`);
        }
        if (!Number.isFinite(enemy.enemy.gridX) || !Number.isFinite(enemy.enemy.gridY)) {
            push('enemy_tile_nonfinite', `Enemy ${enemy.enemy.id} has non-finite tile`);
        }
    }

    return violations;
}

function checkPlayer(player: ServerPlayer, push: (code: string, message: string) => void): void {
    if (!(player.elapsedSeconds >= 0) || !Number.isFinite(player.elapsedSeconds)) {
        push('elapsed_nonfinite', `elapsedSeconds=${player.elapsedSeconds}`);
    }
    if (player.elapsedSeconds > 30 * 60 + 1) {
        push('elapsed_past_raid_limit', `elapsedSeconds=${player.elapsedSeconds}`);
    }
    if (player.kills < 0) push('kills_negative', `kills=${player.kills}`);
    if (!Number.isFinite(player.carriedWeight)) push('carried_weight_nonfinite', `carriedWeight=${player.carriedWeight}`);
    if (player.carriedWeight < -1e-6) push('carried_weight_negative', `carriedWeight=${player.carriedWeight}`);
    if (!player.departureTownId) push('missing_departure_town', 'departureTownId empty');
    if (player.actorIds.length === 0) push('no_actors', 'Player has zero actorIds');
    for (const [itemId, quantity] of player.carriedItems) {
        if (!itemId) push('carried_item_empty_id', 'carried item id is empty');
        if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
            push('carried_item_quantity_invalid', `${itemId} quantity=${quantity}`);
        }
    }
    const save = player.saveSnapshot;
    if (save) {
        if (player.characterId && save.characterId !== player.characterId) {
            push('save_character_mismatch', `save=${save.characterId} player=${player.characterId}`);
        }
        if (!Number.isInteger(save.revision) || save.revision < 0) {
            push('save_revision_invalid', `revision=${save.revision}`);
        }
        checkInventory(save.inventory, 'inventory', push);
        checkInventory(save.stashSnapshot, 'stash', push);
    }
}

function checkActor(actor: ServerActor, push: (code: string, message: string) => void): void {
    if (!Number.isFinite(actor.stats.hp) || !Number.isFinite(actor.stats.mp)) {
        push('actor_resource_nonfinite', `Actor ${actor.id} hp/mp non-finite`);
    }
    if (actor.stats.hp < 0) push('actor_hp_negative', `Actor ${actor.id} hp=${actor.stats.hp}`);
    if (actor.stats.mp < 0) push('actor_mp_negative', `Actor ${actor.id} mp=${actor.stats.mp}`);
    if (actor.stats.hp > actor.stats.maxHp + 1) {
        push('actor_hp_above_max', `Actor ${actor.id} hp=${actor.stats.hp} maxHp=${actor.stats.maxHp}`);
    }
    if (actor.stats.mp > actor.stats.maxMp + 1) {
        push('actor_mp_above_max', `Actor ${actor.id} mp=${actor.stats.mp} maxMp=${actor.stats.maxMp}`);
    }
    if (actor.actionGauge < -1e-6 || actor.actionGauge > 100 + 1e-6) {
        push('actor_gauge_oob', `Actor ${actor.id} actionGauge=${actor.actionGauge}`);
    }
    if (actor.remainingAp < -1e-6 || actor.remainingAp > 100 + 1e-6) {
        push('actor_ap_oob', `Actor ${actor.id} remainingAp=${actor.remainingAp}`);
    }
    if (actor.isDead && actor.stats.hp > 0) {
        push('actor_dead_with_hp', `Actor ${actor.id} isDead with hp=${actor.stats.hp}`);
    }
    if (!actor.isDead && actor.stats.hp <= 0) {
        push('actor_alive_with_zero_hp', `Actor ${actor.id} hp<=0 but not isDead`);
    }
    if (!Number.isFinite(actor.tile.x) || !Number.isFinite(actor.tile.y)) {
        push('actor_tile_nonfinite', `Actor ${actor.id} has non-finite tile`);
    }
}

function checkInventory(
    inventory: InventorySaveSnapshot | undefined,
    label: string,
    push: (code: string, message: string) => void,
): void {
    if (!inventory) return;
    if (!Number.isInteger(inventory.width) || inventory.width <= 0
        || !Number.isInteger(inventory.height) || inventory.height <= 0) {
        push('inventory_dimensions_invalid', `${label}=${inventory.width}x${inventory.height}`);
    }
    const uids = new Set<string>();
    for (const item of inventory.items) {
        if (!item.itemId) push('inventory_item_empty_id', `${label} contains empty itemId`);
        if (!Number.isFinite(item.quantity) || !Number.isInteger(item.quantity) || item.quantity <= 0) {
            push('inventory_item_quantity_invalid', `${label}:${item.itemId} quantity=${item.quantity}`);
        }
        if (!Number.isFinite(item.durability) || item.durability < 0) {
            push('inventory_item_durability_invalid', `${label}:${item.itemId} durability=${item.durability}`);
        }
        if (!Number.isInteger(item.gridX) || !Number.isInteger(item.gridY)
            || item.gridX < 0 || item.gridY < 0
            || item.gridX >= inventory.width || item.gridY >= inventory.height) {
            push('inventory_item_origin_oob', `${label}:${item.itemId} origin=${item.gridX},${item.gridY}`);
        }
        if (item.uid) {
            if (uids.has(item.uid)) push('inventory_duplicate_uid', `${label} duplicate uid=${item.uid}`);
            uids.add(item.uid);
        }
    }
}
