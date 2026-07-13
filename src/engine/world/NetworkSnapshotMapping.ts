import { Character } from '../../character/Character';
import { getCharacterExpToNext } from '../../character/CharacterProgression';
import { getMonsterDefinitionSafe } from '../../data/MonsterCatalog';
import { Enemy } from '../../entity/Enemy';
import { LootObject } from '../../entity/LootObject';
import { Player } from '../../entity/Player';
import type { FieldActor, FieldEnemy } from '../../field/FieldTypes';
import { GridInventory } from '../../inventory/GridInventory';
import type { ActorSnapshot, EnemySnapshot, GridSnapshot, LootSnapshot } from '../../net/WorldProtocol';
import { MONSTER_ROW_BY_FACING, MONSTER_SPRITE_PATH } from '../../data/MonsterCatalog';
import { getItemDef } from '../../data/ItemDB';

export function applyNetworkActorSnapshot(actor: FieldActor, snapshot: ActorSnapshot): void {
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

export function reconcileNetworkLocalActors(
    previousActors: readonly FieldActor[],
    localCharacters: readonly Character[],
    ownSnapshots: readonly ActorSnapshot[]
): FieldActor[] {
    const ownByLocalId = new Map(ownSnapshots.map((actor) => [actor.localActorId ?? actor.id, actor]));
    const nextLocalActors: FieldActor[] = [];

    for (const character of localCharacters) {
        const actorSnapshot = ownByLocalId.get(character.id);
        if (!actorSnapshot) continue;

        const existing = previousActors.find((actor) => actor.character === character);
        const actor = existing ?? {
            id: actorSnapshot.id,
            character,
            entity: new Player(actorSnapshot.tile.x, actorSnapshot.tile.y),
            path: [],
            queuedIntent: null,
        };
        applyNetworkActorSnapshot(actor, actorSnapshot);
        nextLocalActors.push(actor);
    }

    return nextLocalActors;
}

export function reconcileNetworkRemoteActors(
    remotePartyActors: Map<string, FieldActor>,
    remoteSnapshots: readonly ActorSnapshot[]
): FieldActor[] {
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
        applyNetworkActorSnapshot(actor, actorSnapshot);
        nextRemoteActors.push(actor);
    }

    for (const actorId of [...remotePartyActors.keys()]) {
        if (!seenRemoteIds.has(actorId)) remotePartyActors.delete(actorId);
    }

    return nextRemoteActors;
}

export function reconcileNetworkEnemies(
    previousEnemies: readonly FieldEnemy[],
    enemySnapshots: readonly EnemySnapshot[]
): FieldEnemy[] {
    return enemySnapshots.map((enemySnapshot) => {
        const existing = previousEnemies.find((entry) => entry.enemy.id === enemySnapshot.id)?.enemy;
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
        applyMonsterSprite(enemy, enemySnapshot.monsterId);
        return {
            enemy,
            home: { ...enemySnapshot.home },
            path: [],
        };
    });
}

export function createNetworkLootFromSnapshot(snapshot: LootSnapshot): LootObject {
    const loot = new LootObject(snapshot.id, snapshot.tile.x, snapshot.tile.y, [], {
        sourceLabel: snapshot.sourceLabel,
        kind: snapshot.kind,
        containerType: snapshot.containerType,
        gridW: snapshot.gridSnapshot.width,
        gridH: snapshot.gridSnapshot.height,
    });
    loot.inventory = gridFromSnapshot(snapshot.gridSnapshot);
    loot.opened = snapshot.opened;
    return loot;
}

export function gridFromSnapshot(snapshot: GridSnapshot): GridInventory {
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

export function applyMonsterSprite(enemy: Enemy, monsterId: string | undefined): void {
    if (!monsterId || enemy.walkSprite) return;
    const definition = getMonsterDefinitionSafe(monsterId);
    if (!definition) return;
    enemy.setWalkSprite(
        `${MONSTER_SPRITE_PATH}/${definition.sprite}`,
        definition.frameSize,
        definition.frameSize,
        definition.frameCount,
        definition.framesPerSecond,
        MONSTER_ROW_BY_FACING,
        definition.renderScale
    );
}
