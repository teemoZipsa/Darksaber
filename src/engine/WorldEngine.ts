/**
 * WorldEngine — production 2D world field.
 * Click-to-move exploration and same-field ATB combat live here; the legacy
 * BattleEngine remains only for explicit staged encounters.
 */

import { Camera } from './Camera';
import { InputManager } from './InputManager';
import { SettingsManager } from './SettingsManager';
import { Player } from '../entity/Player';
import { Enemy } from '../entity/Enemy';
import { LootObject } from '../entity/LootObject';
import { TILE_SIZE } from '../map/Chunk';
import { PartyManager } from '../character/PartyManager';
import type { Character } from '../character/Character';
import type { GridInventory } from '../inventory/GridInventory';
import { PlayerData } from '../data/PlayerData';
import { getItemDef } from '../data/ItemDB';
import { getClassLine } from '../data/ClassTree';
import { CombatFormulas } from '../combat/CombatFormulas';
import { UI, renderGameTitle, Parchment, drawParchmentPanel, drawGlassPanel } from '../ui/UITheme';
import type { GameManager } from './GameManager';
import { WorldMap } from '../map/WorldMap';
import { FieldPassableQuery, TilePoint, findPath, findPathToAny, isInRange, manhattan, tilesInRange } from '../field/FieldPathing';
import { resolveFieldHit } from '../field/FieldInteraction';
import { advanceAtb, resolveAggroState, shouldAssistTarget } from '../field/FieldCombat';

interface FieldIntent {
    kind: 'move' | 'attack' | 'interact';
    tile?: TilePoint;
    enemyId?: string;
    lootId?: string;
}

interface FieldActor {
    id: string;
    character: Character;
    entity: Player;
    path: TilePoint[];
    queuedIntent: FieldIntent | null;
}

interface FieldEnemy {
    enemy: Enemy;
    home: TilePoint;
    path: TilePoint[];
}

type FieldHitParty = FieldActor & { gridX: number; gridY: number };

const ACTOR_COLORS = ['#00e5ff', '#ff4fd8', '#ffd447'];
const FORMATION_OFFSETS: TilePoint[] = [
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
];
const FIELD_ATB_SCALE = 10;
const ENEMY_AGGRO_RANGE = 6;
const ENEMY_EXIT_RANGE = 10;
const ENEMY_LEASH_RANGE = 16;
const ASSIST_LEASH = 7;
const MOVEMENT_REPATH_INTERVAL = 0.35;

export class WorldEngine {
    private party: PartyManager;
    private playerData: PlayerData;
    private gameManager: GameManager;
    private worldMap: WorldMap;
    private player: Player;
    private partyActors: FieldActor[] = [];
    private fieldEnemies: FieldEnemy[] = [];
    private selectedEnemyId: string | null = null;
    private selectedLootId: string | null = null;
    private hoverTile: TilePoint = { x: -1, y: -1 };
    private combatLog: string[] = [];
    private followRepathTimer: number = 0;

    constructor(
        _canvas: HTMLCanvasElement,
        _ctx: CanvasRenderingContext2D,
        _input: InputManager,
        camera: Camera,
        party: PartyManager,
        _inventory: GridInventory,
        playerData: PlayerData,
        gameManager: GameManager
    ) {
        this.party = party;
        this.playerData = playerData;
        this.gameManager = gameManager;
        this.worldMap = new WorldMap();

        this.spawnPartyAtCentralTown();
        this.player = this.getControlledActor()?.entity ?? new Player(0, 0);
        this.spawnStarterFieldContent();

        camera.followTile(this.player.gridX, this.player.gridY);
        camera.snapToTarget();
        this.addCombatLog('월드 필드 진입. 클릭으로 이동합니다.');
    }

    public update(dt: number, input: InputManager, camera: Camera): void {
        if (input.mouseWheelDelta !== 0) {
            if (input.mouseWheelDelta > 0) camera.zoomOut();
            else camera.zoomIn();
        }

        const screenTile = camera.screenToTile(input.mouseScreenX, input.mouseScreenY);
        this.hoverTile = { x: screenTile.tileX, y: screenTile.tileY };

        if (input.justPressed('Tab')) this.switchToNextAliveActor();
        if (input.justPressed('Escape')) this.clearIntent();
        if (input.mouseJustDown) this.handleFieldClick(this.hoverTile);

        this.updatePartyActors(dt);
        this.updateEnemies(dt);
        this.processQueuedIntents();
        this.refreshLootState();

        const controlled = this.getControlledActor();
        if (controlled) this.player = controlled.entity;
        camera.followTile(this.player.gridX, this.player.gridY);
        camera.update();
    }

    public render(ctx: CanvasRenderingContext2D, camera: Camera, width: number, height: number): void {
        const camX = camera.x;
        const camY = camera.y;
        const scale = SettingsManager.getUIScale();

        ctx.fillStyle = '#080b12';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.scale(camera.zoom, camera.zoom);

        const viewW = width / camera.zoom;
        const viewH = height / camera.zoom;
        this.worldMap.updateLoadedChunks(this.player.pixelX * TILE_SIZE, this.player.pixelY * TILE_SIZE);
        this.worldMap.render(ctx, camX, camY, viewW, viewH);

        this.renderPathPreview(ctx, camX, camY);
        this.renderSelectedLoot(ctx, camX, camY);
        this.renderEnemies(ctx, camX, camY);
        this.renderPartyActors(ctx, camX, camY);
        this.renderHoverTile(ctx, camX, camY);

        ctx.restore();

        ctx.save();
        ctx.scale(scale, scale);
        this.renderHud(ctx, Math.floor(width / scale), Math.floor(height / scale));
        ctx.restore();
    }

    private spawnPartyAtCentralTown(): void {
        const towns = this.worldMap.getTowns();
        const centralTown = towns.find((town) => town.id === 'central_castle') ?? towns[0];
        const spawn = this.worldMap.getTownSpawnTile(centralTown);
        const members = this.party.getCharacters().slice(0, this.party.MAX_ACTIVE_PARTY_SIZE);

        this.partyActors = members.map((character, index) => {
            const tile = this.findNearbyWalkableTile({
                x: spawn.x + (FORMATION_OFFSETS[index]?.x ?? 0),
                y: spawn.y + (FORMATION_OFFSETS[index]?.y ?? 0),
            }, `party_${index}`);
            const entity = new Player(tile.x, tile.y);
            entity.color = ACTOR_COLORS[index % ACTOR_COLORS.length];
            entity.label = character.name;
            if (character.portraitImage && character.portraitLoaded) {
                entity.image = character.portraitImage;
                entity.imageLoaded = true;
            } else {
                entity.setImage(character.portraitImage?.src || '/Image/Character/fighter.png');
            }
            return {
                id: character.id,
                character,
                entity,
                path: [],
                queuedIntent: null,
            };
        });
    }

    private spawnStarterFieldContent(): void {
        const anchor = this.getControlledActor()?.entity;
        if (!anchor) return;

        const enemySeeds = [
            { offset: { x: 7, y: 3 }, name: 'Ash Raider', level: 1, color: '#d95763' },
            { offset: { x: 10, y: -2 }, name: 'Wasteland Scout', level: 2, color: '#ff8a4a' },
            { offset: { x: -6, y: 6 }, name: 'Hollow Guard', level: 1, color: '#b86cff' },
        ];

        this.fieldEnemies = enemySeeds.map((seed, index) => {
            const tile = this.findNearbyWalkableTile({
                x: anchor.gridX + seed.offset.x,
                y: anchor.gridY + seed.offset.y,
            }, `enemy_${index}`);
            const enemy = new Enemy(`field_enemy_${index}`, tile.x, tile.y, seed.name, seed.level, seed.color);
            enemy.aggroRange = ENEMY_AGGRO_RANGE;
            return { enemy, home: tile, path: [] };
        });

        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        const sword = getItemDef('short_sword');
        const lootSeeds = [
            { offset: { x: 3, y: 2 }, id: 'field_chest_1', label: '버려진 보급 상자', item: herb, kind: 'chest' as const },
            { offset: { x: -3, y: 4 }, id: 'field_pack_1', label: '전사자의 배낭', item: sword, kind: 'corpse' as const },
        ];

        this.worldMap.loot = lootSeeds.flatMap((seed) => {
            if (!seed.item) return [];
            const tile = this.findNearbyWalkableTile({
                x: anchor.gridX + seed.offset.x,
                y: anchor.gridY + seed.offset.y,
            }, seed.id);
            return [new LootObject(seed.id, tile.x, tile.y, [seed.item], { sourceLabel: seed.label, kind: seed.kind })];
        });
    }

    private handleFieldClick(tile: TilePoint): void {
        const partyTargets: FieldHitParty[] = this.partyActors.map((actor) => ({
            ...actor,
            gridX: actor.entity.gridX,
            gridY: actor.entity.gridY,
        }));
        const hit = resolveFieldHit(tile, {
            party: partyTargets,
            enemies: this.fieldEnemies.map((entry) => entry.enemy),
            loot: this.worldMap.loot,
            isGroundWalkable: (x, y) => this.worldMap.isWalkable(x, y),
        });

        switch (hit.kind) {
            case 'enemy':
                this.selectedEnemyId = hit.enemy.id;
                this.selectedLootId = null;
                this.queueAttackIntent(this.requireControlledActor(), hit.enemy);
                break;
            case 'party': {
                const index = this.partyActors.findIndex((actor) => actor.id === hit.party.id);
                if (index >= 0) this.switchToPartyMember(index);
                break;
            }
            case 'loot':
                this.selectedEnemyId = null;
                this.selectedLootId = hit.loot.id;
                this.queueInteractIntent(this.requireControlledActor(), hit.loot);
                break;
            case 'ground':
                this.selectedEnemyId = null;
                this.selectedLootId = null;
                this.queueMoveIntent(this.requireControlledActor(), hit.tile);
                break;
            case 'blocked':
                this.clearIntent();
                this.addCombatLog('갈 수 없는 위치입니다.');
                break;
        }
    }

    private queueMoveIntent(actor: FieldActor, tile: TilePoint): void {
        const path = findPath(this.actorTile(actor), tile, (query) => this.isFieldPassable(query), {
            actorId: actor.id,
            intent: 'move',
            maxNodes: 8000,
        });
        if (path.length === 0 && !this.isActorAt(actor, tile)) {
            this.clearActorIntent(actor);
            this.addCombatLog('이동 경로를 찾지 못했습니다.');
            return;
        }

        actor.path = path;
        actor.queuedIntent = { kind: 'move', tile };
    }

    private queueAttackIntent(actor: FieldActor, enemy: Enemy): void {
        const range = this.getAttackRange(actor.character);
        const enemyTile = this.enemyTile(enemy);
        actor.queuedIntent = { kind: 'attack', enemyId: enemy.id };

        if (isInRange(this.actorTile(actor), enemyTile, range)) {
            this.tryActorAttack(actor, enemy);
            return;
        }

        const goals = tilesInRange(enemyTile, range)
            .filter((tile) => this.isFieldPassable({
                ...tile,
                actorId: actor.id,
                intent: 'attack',
                goal: enemyTile,
            }));
        actor.path = findPathToAny(this.actorTile(actor), goals, (query) => this.isFieldPassable(query), {
            actorId: actor.id,
            intent: 'attack',
            maxNodes: 8000,
        });

        if (actor.path.length === 0) {
            this.addCombatLog(`${enemy.name}에게 접근할 경로가 없습니다.`);
        } else {
            this.addCombatLog(`${enemy.name} 공격 위치로 이동합니다.`);
        }
    }

    private queueInteractIntent(actor: FieldActor, loot: LootObject): void {
        actor.queuedIntent = { kind: 'interact', lootId: loot.id };
        if (manhattan(this.actorTile(actor), { x: loot.x, y: loot.y }) <= 1) {
            this.openLoot(loot);
            return;
        }

        const goals = tilesInRange({ x: loot.x, y: loot.y }, 1)
            .filter((tile) => this.isFieldPassable({
                ...tile,
                actorId: actor.id,
                intent: 'interact',
                goal: { x: loot.x, y: loot.y },
            }));
        actor.path = findPathToAny(this.actorTile(actor), goals, (query) => this.isFieldPassable(query), {
            actorId: actor.id,
            intent: 'interact',
            maxNodes: 8000,
        });

        if (actor.path.length === 0) {
            this.addCombatLog(`${loot.sourceLabel}에 접근할 수 없습니다.`);
        } else {
            this.addCombatLog(`${loot.sourceLabel} 쪽으로 이동합니다.`);
        }
    }

    private updatePartyActors(dt: number): void {
        const controlled = this.getControlledActor();
        this.followRepathTimer -= dt;

        for (const actor of this.partyActors) {
            if (actor.character.isDead) continue;
            actor.entity.actionGauge = advanceAtb(actor.entity.actionGauge, actor.character.getCombatStats().spd, dt, FIELD_ATB_SCALE);
            this.stepActorAlongPath(actor);
            actor.entity.update(dt);
        }

        this.updateAssistAI();
        if (controlled && this.followRepathTimer <= 0) {
            this.followRepathTimer = MOVEMENT_REPATH_INTERVAL;
            this.updateFollowerPaths(controlled);
        }
    }

    private updateFollowerPaths(controlled: FieldActor): void {
        for (let i = 0; i < this.partyActors.length; i++) {
            const actor = this.partyActors[i];
            if (actor === controlled || actor.character.isDead || actor.queuedIntent?.kind === 'attack') continue;
            if (actor.path.length > 0) continue;

            const offset = FORMATION_OFFSETS[i % FORMATION_OFFSETS.length];
            const preferred = { x: controlled.entity.gridX + offset.x, y: controlled.entity.gridY + offset.y };
            if (manhattan(this.actorTile(actor), preferred) <= 1) continue;

            const goals = [preferred, ...tilesInRange(preferred, 1)]
                .filter((tile) => this.isFieldPassable({
                    ...tile,
                    actorId: actor.id,
                    intent: 'follow',
                    goal: preferred,
                }));
            const path = findPathToAny(this.actorTile(actor), goals, (query) => this.isFieldPassable(query), {
                actorId: actor.id,
                intent: 'follow',
                maxNodes: 2000,
            });
            if (path.length > 0) {
                actor.path = path;
                actor.queuedIntent = { kind: 'move', tile: path[path.length - 1] };
            }
        }
    }

    private updateAssistAI(): void {
        const controlled = this.getControlledActor();
        const target = this.selectedEnemyId ? this.getEnemyById(this.selectedEnemyId) : null;
        if (!controlled || !target || target.stats.hp <= 0) return;
        const targetTile = this.enemyTile(target);

        for (const actor of this.partyActors) {
            if (actor === controlled || actor.character.isDead) continue;
            if (!shouldAssistTarget({
                isControlledTarget: true,
                targetIsAggro: target.isAggro,
                targetDistanceToControlled: manhattan(targetTile, this.actorTile(controlled)),
                actorDistanceToControlled: manhattan(this.actorTile(actor), this.actorTile(controlled)),
                assistLeash: ASSIST_LEASH,
            })) continue;

            const range = this.getAttackRange(actor.character);
            actor.queuedIntent = { kind: 'attack', enemyId: target.id };
            if (isInRange(this.actorTile(actor), targetTile, range)) {
                this.tryActorAttack(actor, target);
                continue;
            }
            if (actor.path.length === 0) {
                const goals = tilesInRange(targetTile, range)
                    .filter((tile) => this.isFieldPassable({
                        ...tile,
                        actorId: actor.id,
                        intent: 'attack',
                        goal: targetTile,
                    }));
                actor.path = findPathToAny(this.actorTile(actor), goals, (query) => this.isFieldPassable(query), {
                    actorId: actor.id,
                    intent: 'attack',
                    maxNodes: 3000,
                });
            }
        }
    }

    private updateEnemies(dt: number): void {
        const aliveActors = this.partyActors.filter((actor) => !actor.character.isDead);

        for (const entry of this.fieldEnemies) {
            const enemy = entry.enemy;
            if (enemy.stats.hp <= 0) continue;
            enemy.update(dt);

            const closest = this.findClosestActor(this.enemyTile(enemy), aliveActors);
            if (!closest) continue;

            const enemyTile = this.enemyTile(enemy);
            const distanceToTarget = manhattan(enemyTile, this.actorTile(closest));
            const leashExceeded = manhattan(enemyTile, entry.home) > ENEMY_LEASH_RANGE;
            enemy.isAggro = resolveAggroState(enemy.isAggro, distanceToTarget, ENEMY_AGGRO_RANGE, ENEMY_EXIT_RANGE, leashExceeded);

            enemy.actionGauge = advanceAtb(enemy.actionGauge, enemy.stats.spd, dt, FIELD_ATB_SCALE * 0.7);
            if (!enemy.isAggro || enemy.actionGauge < 100 || this.isEntityMoving(enemy)) continue;

            if (distanceToTarget <= 1) {
                this.enemyAttack(entry, closest);
            } else {
                this.enemyStepToward(entry, closest);
                enemy.actionGauge = 0;
            }
        }
    }

    private processQueuedIntents(): void {
        for (const actor of this.partyActors) {
            if (actor.character.isDead || actor.path.length > 0 || this.isEntityMoving(actor.entity) || !actor.queuedIntent) continue;

            if (actor.queuedIntent.kind === 'move') {
                actor.queuedIntent = null;
                continue;
            }

            if (actor.queuedIntent.kind === 'attack' && actor.queuedIntent.enemyId) {
                const enemy = this.getEnemyById(actor.queuedIntent.enemyId);
                if (enemy && enemy.stats.hp > 0) this.tryActorAttack(actor, enemy);
                else this.clearActorIntent(actor);
            }

            if (actor.queuedIntent.kind === 'interact' && actor.queuedIntent.lootId) {
                const loot = this.worldMap.loot.find((candidate) => candidate.id === actor.queuedIntent?.lootId);
                if (loot && !loot.opened && manhattan(this.actorTile(actor), { x: loot.x, y: loot.y }) <= 1) {
                    this.openLoot(loot);
                }
                this.clearActorIntent(actor);
            }
        }
    }

    private tryActorAttack(actor: FieldActor, enemy: Enemy): void {
        const range = this.getAttackRange(actor.character);
        const enemyTile = this.enemyTile(enemy);
        if (!isInRange(this.actorTile(actor), enemyTile, range)) return;
        if (actor.entity.actionGauge < 100) return;

        const result = CombatFormulas.calcPhysicalDamage(
            actor.character.getCombatStats(),
            enemy.stats,
            this.worldMap.getTileAt(enemy.gridX, enemy.gridY)
        );
        const dirBonus = CombatFormulas.getDirectionalMultiplier(
            actor.entity.gridX,
            actor.entity.gridY,
            enemy.gridX,
            enemy.gridY,
            enemy.facing
        );
        if (!result.isMiss) result.damage = Math.max(1, Math.floor(result.damage * dirBonus.multiplier));

        actor.entity.actionGauge = 0;
        actor.entity.facing = this.directionFromTo(this.actorTile(actor), enemyTile);

        if (result.isMiss) {
            this.addCombatLog(`${actor.character.name} 공격 빗나감: ${enemy.name}`);
            return;
        }

        const dead = enemy.takeDamage(result.damage);
        const critText = result.isCrit ? ' CRIT' : '';
        this.addCombatLog(`${actor.character.name} → ${enemy.name} ${result.damage} 피해${critText}`);

        if (dead) this.handleEnemyDefeated(actor, enemy);
    }

    private enemyAttack(entry: FieldEnemy, actor: FieldActor): void {
        const enemy = entry.enemy;
        const result = CombatFormulas.calcPhysicalDamage(
            enemy.stats,
            actor.character.stats,
            this.worldMap.getTileAt(actor.entity.gridX, actor.entity.gridY)
        );
        enemy.actionGauge = 0;
        enemy.facing = this.directionFromTo(this.enemyTile(enemy), this.actorTile(actor));

        if (result.isMiss) {
            this.addCombatLog(`${enemy.name} 공격 빗나감`);
            return;
        }

        actor.character.stats.hp = Math.max(0, actor.character.stats.hp - result.damage);
        this.addCombatLog(`${enemy.name} → ${actor.character.name} ${result.damage} 피해`);

        if (actor.character.stats.hp <= 0 && !actor.character.isDead) {
            this.handleActorDown(actor);
        }
    }

    private enemyStepToward(entry: FieldEnemy, actor: FieldActor): void {
        const enemy = entry.enemy;
        const goals = tilesInRange(this.actorTile(actor), 1)
            .filter((tile) => this.isFieldPassable({
                ...tile,
                actorId: enemy.id,
                intent: 'enemy',
                goal: this.actorTile(actor),
            }));
        const path = findPathToAny(this.enemyTile(enemy), goals, (query) => this.isFieldPassable(query), {
            actorId: enemy.id,
            intent: 'enemy',
            maxNodes: 2500,
        });
        if (path.length === 0) return;

        const next = path[0];
        enemy.facing = this.directionFromTo(this.enemyTile(enemy), next);
        enemy.gridX = next.x;
        enemy.gridY = next.y;
    }

    private handleEnemyDefeated(actor: FieldActor, enemy: Enemy): void {
        this.addCombatLog(`${enemy.name} 처치! +${enemy.expReward} EXP`);
        actor.character.gainExp(enemy.expReward);
        enemy.isAggro = false;
        if (this.selectedEnemyId === enemy.id) this.selectedEnemyId = null;

        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        if (herb) {
            const loot = new LootObject(`corpse_${enemy.id}`, enemy.gridX, enemy.gridY, [herb], {
                sourceLabel: `${enemy.name} 전리품`,
                kind: 'corpse',
            });
            this.worldMap.loot.push(loot);
        }
    }

    private handleActorDown(actor: FieldActor): void {
        const index = this.partyActors.indexOf(actor);
        if (index === this.party.getActiveIndex()) {
            const next = this.party.markActiveDead();
            this.addCombatLog(`${actor.character.name} 쓰러짐`);
            if (next) {
                const nextIndex = this.partyActors.findIndex((candidate) => candidate.character === next);
                if (nextIndex >= 0) this.switchToPartyMember(nextIndex);
            } else {
                this.addCombatLog('출격조 전원 행동 불능');
            }
            return;
        }

        actor.character.isDead = true;
        actor.character.exp = 0;
        this.addCombatLog(`${actor.character.name} 쓰러짐`);
    }

    private openLoot(loot: LootObject): void {
        this.selectedLootId = loot.id;
        this.addCombatLog(`${loot.sourceLabel} 검색 중.`);
        this.clearControlledPath();
        this.requireControlledActor().queuedIntent = null;

        this.gameManager.inventoryUI.setExternalGrid(loot.inventory, loot.sourceLabel, { isRaidLoot: true });
        if (!this.gameManager.inventoryUI.isVisible()) this.gameManager.inventoryUI.toggle();
    }

    private refreshLootState(): void {
        for (const loot of this.worldMap.loot) {
            loot.opened = loot.inventory.items.length === 0;
        }
    }

    private stepActorAlongPath(actor: FieldActor): void {
        if (this.isEntityMoving(actor.entity) || actor.path.length === 0) return;

        const next = actor.path[0];
        if (!this.isFieldPassable({
            ...next,
            actorId: actor.id,
            intent: actor.queuedIntent?.kind === 'attack' ? 'attack' : actor.queuedIntent?.kind === 'interact' ? 'interact' : 'move',
            goal: actor.queuedIntent?.tile,
        })) {
            actor.path = [];
            return;
        }

        actor.path.shift();
        actor.entity.facing = this.directionFromTo(this.actorTile(actor), next);
        actor.entity.gridX = next.x;
        actor.entity.gridY = next.y;
    }

    private isFieldPassable(query: FieldPassableQuery): boolean {
        if (!this.worldMap.isWalkable(query.x, query.y)) return false;

        const enemyAtTile = this.fieldEnemies.some((entry) =>
            entry.enemy.id !== query.actorId &&
            entry.enemy.stats.hp > 0 &&
            entry.enemy.gridX === query.x &&
            entry.enemy.gridY === query.y
        );
        if (enemyAtTile) return false;

        if (query.intent === 'enemy') {
            return !this.partyActors.some((actor) =>
                !actor.character.isDead &&
                actor.id !== query.actorId &&
                actor.entity.gridX === query.x &&
                actor.entity.gridY === query.y
            );
        }

        return true;
    }

    private findNearbyWalkableTile(tile: TilePoint, actorId: string): TilePoint {
        if (this.isFieldPassable({ ...tile, actorId, intent: 'move' })) return tile;

        for (let radius = 1; radius <= 8; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                    const candidate = { x: tile.x + dx, y: tile.y + dy };
                    if (this.isFieldPassable({ ...candidate, actorId, intent: 'move' })) return candidate;
                }
            }
        }
        return tile;
    }

    private getControlledActor(): FieldActor | null {
        return this.partyActors[this.party.getActiveIndex()] ?? this.partyActors.find((actor) => !actor.character.isDead) ?? null;
    }

    private requireControlledActor(): FieldActor {
        const actor = this.getControlledActor();
        if (!actor) throw new Error('No active field actor');
        return actor;
    }

    private switchToNextAliveActor(): void {
        const current = this.party.getActiveIndex();
        for (let offset = 1; offset <= this.partyActors.length; offset++) {
            const next = (current + offset) % this.partyActors.length;
            if (this.switchToPartyMember(next)) return;
        }
    }

    private switchToPartyMember(index: number): boolean {
        const actor = this.partyActors[index];
        if (!actor || actor.character.isDead) return false;
        if (!this.party.switchTo(index)) return false;
        this.player = actor.entity;
        this.selectedEnemyId = null;
        this.selectedLootId = null;
        this.addCombatLog(`${actor.character.name} 조작`);
        return true;
    }

    private findClosestActor(point: TilePoint, actors: FieldActor[]): FieldActor | null {
        let closest: FieldActor | null = null;
        let closestDist = Infinity;
        for (const actor of actors) {
            const distance = manhattan(point, this.actorTile(actor));
            if (distance < closestDist) {
                closest = actor;
                closestDist = distance;
            }
        }
        return closest;
    }

    private getEnemyById(enemyId: string): Enemy | null {
        return this.fieldEnemies.find((entry) => entry.enemy.id === enemyId)?.enemy ?? null;
    }

    private getAttackRange(character: Character): number {
        return getClassLine(character.classLineId)?.attackRange ?? 1;
    }

    private actorTile(actor: FieldActor): TilePoint {
        return { x: actor.entity.gridX, y: actor.entity.gridY };
    }

    private enemyTile(enemy: Enemy): TilePoint {
        return { x: enemy.gridX, y: enemy.gridY };
    }

    private isActorAt(actor: FieldActor, tile: TilePoint): boolean {
        return actor.entity.gridX === tile.x && actor.entity.gridY === tile.y;
    }

    private isEntityMoving(entity: Player | Enemy): boolean {
        return Math.abs(entity.pixelX - entity.gridX) > 0.01 || Math.abs(entity.pixelY - entity.gridY) > 0.01;
    }

    private directionFromTo(from: TilePoint, to: TilePoint): 'up' | 'down' | 'left' | 'right' {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
        return dy >= 0 ? 'down' : 'up';
    }

    private clearIntent(): void {
        const actor = this.getControlledActor();
        if (actor) this.clearActorIntent(actor);
        this.selectedEnemyId = null;
        this.selectedLootId = null;
    }

    private clearActorIntent(actor: FieldActor): void {
        actor.path = [];
        actor.queuedIntent = null;
    }

    private clearControlledPath(): void {
        const actor = this.getControlledActor();
        if (actor) actor.path = [];
    }

    private addCombatLog(message: string): void {
        this.combatLog.push(message);
        if (this.combatLog.length > 7) this.combatLog.shift();
    }

    private renderPathPreview(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        const actor = this.getControlledActor();
        if (!actor || actor.path.length === 0) return;

        ctx.fillStyle = 'rgba(55, 220, 255, 0.22)';
        for (const tile of actor.path) {
            ctx.fillRect(tile.x * TILE_SIZE - camX + 8, tile.y * TILE_SIZE - camY + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        }
    }

    private renderSelectedLoot(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        if (!this.selectedLootId) return;
        const loot = this.worldMap.loot.find((candidate) => candidate.id === this.selectedLootId);
        if (!loot) return;

        ctx.strokeStyle = '#f3d66b';
        ctx.lineWidth = 3;
        ctx.strokeRect(loot.x * TILE_SIZE - camX + 5, loot.y * TILE_SIZE - camY + 5, TILE_SIZE - 10, TILE_SIZE - 10);
    }

    private renderPartyActors(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        const controlled = this.getControlledActor();
        for (const actor of this.partyActors) {
            if (actor.character.isDead) continue;
            const entity = actor.entity;
            const px = entity.pixelX * TILE_SIZE - camX;
            const py = entity.pixelY * TILE_SIZE - camY;

            if (entity.image && entity.imageLoaded) {
                ctx.drawImage(entity.image, px, py, TILE_SIZE, TILE_SIZE);
            } else {
                ctx.fillStyle = entity.color;
                ctx.fillRect(px + 5, py + 5, TILE_SIZE - 10, TILE_SIZE - 10);
            }

            if (actor === controlled) {
                ctx.strokeStyle = '#52f6ff';
                ctx.lineWidth = 3;
                ctx.strokeRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
            }

            this.renderGauge(ctx, px + 4, py - 7, TILE_SIZE - 8, actor.entity.actionGauge / 100, '#39ff88');
            this.renderHpBar(ctx, px + 4, py + TILE_SIZE + 3, TILE_SIZE - 8, actor.character.stats.hp, actor.character.stats.maxHp);
        }
    }

    private renderEnemies(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        for (const entry of this.fieldEnemies) {
            const enemy = entry.enemy;
            if (enemy.stats.hp <= 0) continue;
            const px = enemy.pixelX * TILE_SIZE - camX;
            const py = enemy.pixelY * TILE_SIZE - camY;

            if (enemy.image && enemy.imageLoaded) {
                ctx.drawImage(enemy.image, px, py, TILE_SIZE, TILE_SIZE);
            } else {
                ctx.fillStyle = enemy.isAggro ? '#ff4d5e' : enemy.color;
                ctx.fillRect(px + 7, py + 7, TILE_SIZE - 14, TILE_SIZE - 14);
            }

            if (this.selectedEnemyId === enemy.id) {
                ctx.strokeStyle = '#ffdd55';
                ctx.lineWidth = 3;
                ctx.strokeRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
            }

            this.renderGauge(ctx, px + 5, py - 7, TILE_SIZE - 10, enemy.actionGauge / 100, '#ffb84d');
            this.renderHpBar(ctx, px + 5, py + TILE_SIZE + 3, TILE_SIZE - 10, enemy.stats.hp, enemy.stats.maxHp);
        }
    }

    private renderHoverTile(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
        if (this.hoverTile.x < 0 || this.hoverTile.y < 0) return;
        ctx.strokeStyle = this.worldMap.isWalkable(this.hoverTile.x, this.hoverTile.y)
            ? 'rgba(255,255,255,0.32)'
            : 'rgba(255,70,70,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.hoverTile.x * TILE_SIZE - camX + 1, this.hoverTile.y * TILE_SIZE - camY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }

    private renderGauge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, pct: number, color: string): void {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(x, y, w, 4);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w * Math.max(0, Math.min(1, pct)), 4);
    }

    private renderHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hp: number, maxHp: number): void {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x, y, w, 5);
        ctx.fillStyle = '#d95454';
        ctx.fillRect(x, y, w * Math.max(0, Math.min(1, hp / Math.max(1, maxHp))), 5);
    }

    private renderHud(ctx: CanvasRenderingContext2D, vw: number, vh: number): void {
        renderGameTitle(ctx, 16, 12, { scale: 0.7, subtitle: '' });

        const active = this.party.getActive();
        if (active) {
            drawParchmentPanel(ctx, 16, 56, 210, 66);
            ctx.fillStyle = Parchment.textDark;
            ctx.font = `bold 11px ${UI.fontMono}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`${active.name} Lv.${active.level}`, 28, 68);
            ctx.fillStyle = Parchment.textMid;
            ctx.font = `10px ${UI.fontMono}`;
            ctx.fillText(`HP ${active.stats.hp}/${active.stats.maxHp}  MP ${active.stats.mp}/${active.stats.maxMp}`, 28, 84);
            ctx.fillText(`ATB ${Math.floor(this.player.actionGauge)}%`, 28, 100);
        }

        drawParchmentPanel(ctx, 16, 132, 130, 28);
        ctx.fillStyle = '#ffcc00';
        ctx.font = `bold 11px ${UI.fontMono}`;
        ctx.textAlign = 'left';
        ctx.fillText(`${this.playerData.gold} G`, 28, 140);

        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = `9px ${UI.fontMono}`;
        ctx.fillText(`(${this.player.gridX}, ${this.player.gridY})`, 16, 170);

        this.renderCombatLog(ctx, vw, vh);

        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        ctx.font = `9px ${UI.fontMono}`;
        ctx.textAlign = 'right';
        ctx.fillText('클릭 이동 | 적 클릭 공격 | Tab 교체 | I 인벤토리', vw - 16, vh - 16);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    private renderCombatLog(ctx: CanvasRenderingContext2D, _vw: number, vh: number): void {
        const x = 16;
        const y = Math.max(188, vh - 150);
        const w = 360;
        const h = 112;
        drawGlassPanel(ctx, x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.font = `10px ${UI.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const visible = this.combatLog.slice(-5);
        visible.forEach((line, index) => {
            ctx.fillText(line, x + 12, y + 12 + index * 18);
        });
    }
}
