import { getStoryQuestByDungeonId } from '../data/StoryQuestData';
import { STORY_SCENARIOS } from '../data/StoryScenarioData';
import { getItemDef } from '../data/ItemDB';
import { Enemy } from '../entity/Enemy';
import { LootObject } from '../entity/LootObject';
import type { GameManager } from '../engine/GameManager';
import { formatT, t } from '../i18n/LanguageManager';

export const DEV_STORY_EPISODES = STORY_SCENARIOS.map((scenario) => scenario.episode);
export const DEV_STORY_INTERIOR_EPISODES = STORY_SCENARIOS
    .filter((scenario) => scenario.missionKind === 'soloInterior')
    .map((scenario) => scenario.episode);
export const DEV_LATE_STORY_EPISODES = STORY_SCENARIOS
    .filter((scenario) => scenario.episode >= 23)
    .map((scenario) => scenario.episode);
type DevStoryScenario = `story${number}`;

export type DevRaidScenario = 'aggro' | 'loot' | DevStoryScenario;

export function parseDevRaidScenario(value: string | null): DevRaidScenario | null {
    if (value === 'aggro' || value === 'loot') return value;
    const match = value?.match(/^story(\d+)$/);
    if (!match) return null;
    const episode = Number(match[1]);
    return DEV_STORY_EPISODES.includes(episode)
        ? `story${episode}`
        : null;
}

type DevTile = { x: number; y: number };
type DevEntity = {
    gridX: number;
    gridY: number;
    pixelX: number;
    pixelY: number;
    actionGauge: number;
    setGridPosition?: (gridX: number, gridY: number, instant?: boolean) => void;
};
type DevFieldActor = {
    id: string;
    character: { isDead?: boolean; stats?: { hp?: number } };
    entity: DevEntity;
    path: DevTile[];
    queuedIntent: unknown;
};
type DevDungeon = {
    id: string;
    nameKr: string;
    chunkX: number;
    chunkY: number;
    sprite: string;
    tileSpan: number;
    tileRadius: number;
};
type DevWorldEngine = {
    partyActors: DevFieldActor[];
    fieldEnemies: Array<{ enemy: Enemy; home: DevTile; path: DevTile[] }>;
    worldMap: {
        loot: LootObject[];
        isWalkable: (x: number, y: number) => boolean;
        getDungeons?: () => DevDungeon[];
    };
    actionControllers: {
        selectionController: { selectActor: (actorId: string | null) => void; selectLoot: (lootId: string) => void };
    };
    scenarioNetworkControllers?: {
        storyScenarioController?: {
            startLocalStoryScenarioDungeon?: (dungeon: DevDungeon, storyQuest: NonNullable<ReturnType<typeof getStoryQuestByDungeonId>>) => void;
            startLocalStoryInteriorDungeon: (dungeon: DevDungeon, storyQuest: NonNullable<ReturnType<typeof getStoryQuestByDungeonId>>) => void;
        };
    };
    clearFieldTurnState: () => void;
    closeNetworkRaidClient?: (sendLeave: boolean, reason?: 'town' | 'wipe' | 'manual') => void;
    addCombatLog?: (message: string) => void;
    currentPhase: string;
    isNetworkRaid?: boolean;
    networkRaidClient?: unknown;
    player: DevEntity;
    activeTurnActorId: string | null;
    readyQueue: string[];
};

export function applyDevRaidScenario(
    manager: GameManager,
    scenario: DevRaidScenario,
    options: { warn?: boolean } = {}
): boolean {
    const world = getDevWorldEngine(manager);
    const actor = world?.partyActors[0];
    if (!world || !actor) {
        if (options.warn ?? true) console.warn(`[Darksaber] Dev raid scenario '${scenario}' could not find a controlled actor.`);
        return false;
    }

    deactivateDevNetworkRaid(world);
    world.currentPhase = 'raid';
    manager.inventoryUI.setActiveCharacter(actor.character as Parameters<typeof manager.inventoryUI.setActiveCharacter>[0]);

    if (scenario === 'aggro') applyDevAggroScenario(world, actor);
    else if (scenario === 'loot') applyDevLootScenario(manager, world, actor);
    else return applyDevStoryScenario(world, scenario);
    return true;
}

function getDevWorldEngine(manager: GameManager): DevWorldEngine | null {
    return (manager as unknown as { worldEngine?: DevWorldEngine }).worldEngine ?? null;
}

function deactivateDevNetworkRaid(world: DevWorldEngine): void {
    world.closeNetworkRaidClient?.(true, 'manual');
    world.isNetworkRaid = false;
    world.networkRaidClient = null;
}

function applyDevAggroScenario(world: DevWorldEngine, actor: DevFieldActor): void {
    deactivateDevNetworkRaid(world);
    world.partyActors = [actor];

    const actorTile = findWalkableTile(world, { x: actor.entity.gridX, y: actor.entity.gridY });
    setDevEntityTile(actor.entity, actorTile);
    actor.path = [];
    actor.queuedIntent = null;
    actor.entity.actionGauge = 0;
    if (actor.character.stats) actor.character.stats.hp = Math.max(1, actor.character.stats.hp ?? 1);
    actor.character.isDead = false;

    const enemyTile = findWalkableTileAtDistance(world, actorTile, 3) ?? findWalkableTileAtDistance(world, actorTile, 2) ?? { x: actorTile.x + 2, y: actorTile.y };
    const enemy = new Enemy('dev_aggro_enemy', enemyTile.x, enemyTile.y, t('dev.scenario.aggroEnemy'), 1, '#d98a5a', 'bruiser');
    enemy.isAggro = true;
    enemy.aggroRange = 8;
    enemy.stats.atk = 1;
    enemy.stats.hitRate = 100;
    enemy.setGridPosition?.(enemyTile.x, enemyTile.y, true);

    world.fieldEnemies = [{ enemy, home: { ...enemyTile }, path: [] }];
    world.worldMap.loot = [];
    world.player = actor.entity;
    world.actionControllers.selectionController.selectActor(actor.id);
    world.clearFieldTurnState();
    enemy.isAggro = true;
    enemy.actionGauge = 100;
    world.readyQueue = [enemy.id];
    world.addCombatLog?.(t('dev.scenario.aggroReady'));
    setDevScenarioStatus('aggro', 'chase-ready');

    window.setTimeout(() => {
        const liveEnemy = world.fieldEnemies[0]?.enemy;
        const liveActor = world.partyActors[0];
        if (!liveEnemy || !liveActor) return;
        const adjacent = findWalkableTileAtDistance(world, { x: liveActor.entity.gridX, y: liveActor.entity.gridY }, 1) ?? {
            x: liveActor.entity.gridX + 1,
            y: liveActor.entity.gridY,
        };
        setDevEntityTile(liveEnemy, adjacent);
        liveEnemy.isAggro = true;
        liveEnemy.actionGauge = 100;
        world.activeTurnActorId = null;
        world.readyQueue = [liveEnemy.id];
        world.addCombatLog?.(t('dev.scenario.aggroAttackReady'));
        setDevScenarioStatus('aggro', 'attack-ready');
    }, 1400);
}

function applyDevLootScenario(manager: GameManager, world: DevWorldEngine, actor: DevFieldActor): void {
    world.networkRaidClient = createDevLootClient();
    world.isNetworkRaid = true;
    world.partyActors = [actor];

    const actorTile = findWalkableTile(world, { x: actor.entity.gridX, y: actor.entity.gridY });
    setDevEntityTile(actor.entity, actorTile);
    actor.path = [];
    actor.queuedIntent = null;
    actor.entity.actionGauge = 0;
    world.player = actor.entity;
    world.fieldEnemies = [];
    world.clearFieldTurnState();

    const lootTile = findWalkableTileAtDistance(world, actorTile, 1) ?? { x: actorTile.x + 1, y: actorTile.y };
    const items = ['herb_common', 'short_sword']
        .map((id) => getItemDef(id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const loot = new LootObject('dev_raid_loot', lootTile.x, lootTile.y, items, {
        sourceLabel: t('dev.scenario.lootTitle'),
        kind: 'chest',
        gridW: 5,
        gridH: 2,
    });
    world.worldMap.loot = [loot];
    world.actionControllers.selectionController.selectLoot(loot.id);
    manager.inventoryUI.setExternalGrid(loot.inventory, loot.sourceLabel, { isRaidLoot: true });
    if (!manager.inventoryUI.isVisible()) manager.inventoryUI.toggle();
    world.addCombatLog?.(t('dev.scenario.lootReady'));
    setDevScenarioStatus('loot', 'loot-open');
}

function applyDevStoryScenario(world: DevWorldEngine, scenarioId: DevStoryScenario): boolean {
    deactivateDevNetworkRaid(world);
    const episode = Number(scenarioId.replace('story', ''));
    const scenario = STORY_SCENARIOS.find((candidate) => candidate.episode === episode);
    const dungeon = world.worldMap.getDungeons?.().find((candidate) => candidate.id === scenario?.dungeonId);
    const quest = scenario ? getStoryQuestByDungeonId(scenario.dungeonId) : null;
    const storyScenarioController = world.scenarioNetworkControllers?.storyScenarioController;
    if (!scenario || !dungeon || !quest || !storyScenarioController) {
        console.warn(`[Darksaber] Dev ${scenarioId} scenario could not find the dungeon, quest, or controller.`);
        return false;
    }

    if (storyScenarioController.startLocalStoryScenarioDungeon) {
        storyScenarioController.startLocalStoryScenarioDungeon(dungeon, quest);
    } else {
        storyScenarioController.startLocalStoryInteriorDungeon(dungeon, quest);
    }
    world.addCombatLog?.(formatT('dev.scenario.storyReady', { episode, dungeon: dungeon.nameKr }));
    setDevScenarioStatus(scenarioId, scenario.missionKind === 'soloInterior' ? 'interior-ready' : 'scenario-ready');
    return true;
}

function createDevLootClient(): unknown {
    let counter = 0;
    return {
        getIsOpen: () => true,
        sendLootPickup: (lootId: string, gridX: number, gridY: number) => {
            const intentId = `dev-loot-${Date.now()}-${++counter}`;
            setDevScenarioStatus('loot', `picked:${lootId}:${gridX},${gridY}`);
            return intentId;
        },
        sendIntent: () => `dev-intent-${Date.now()}-${++counter}`,
        close: () => undefined,
        leave: () => undefined,
    };
}

function setDevEntityTile(entity: DevEntity, tile: DevTile): void {
    entity.setGridPosition?.(tile.x, tile.y, true);
    entity.gridX = tile.x;
    entity.gridY = tile.y;
    entity.pixelX = tile.x;
    entity.pixelY = tile.y;
}

function findWalkableTile(world: DevWorldEngine, preferred: DevTile): DevTile {
    if (world.worldMap.isWalkable(preferred.x, preferred.y)) return preferred;
    for (let radius = 1; radius <= 8; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                const tile = { x: preferred.x + dx, y: preferred.y + dy };
                if (world.worldMap.isWalkable(tile.x, tile.y)) return tile;
            }
        }
    }
    return preferred;
}

function findWalkableTileAtDistance(world: DevWorldEngine, origin: DevTile, distance: number): DevTile | null {
    for (let dx = -distance; dx <= distance; dx++) {
        const dy = distance - Math.abs(dx);
        const candidates = dy === 0
            ? [{ x: origin.x + dx, y: origin.y }]
            : [{ x: origin.x + dx, y: origin.y + dy }, { x: origin.x + dx, y: origin.y - dy }];
        for (const tile of candidates) {
            if (world.worldMap.isWalkable(tile.x, tile.y)) return tile;
        }
    }
    return null;
}

function setDevScenarioStatus(scenario: DevRaidScenario, state: string): void {
    if (typeof document === 'undefined') return;
    const root = getOrCreateDevScenarioStatus();
    root.dataset.scenario = scenario;
    root.dataset.state = state;
    root.textContent = `${t('dev.scenario.status')}: ${scenario} / ${state}`;
}

function getOrCreateDevScenarioStatus(): HTMLDivElement {
    const existing = document.querySelector<HTMLDivElement>('.dev-scenario-status');
    if (existing) return existing;
    const root = document.createElement('div');
    root.className = 'dev-scenario-status';
    document.body.appendChild(root);
    return root;
}
