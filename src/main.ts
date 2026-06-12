/**
 * main.ts — Application entry point.
 * Initializes the GameManager and starts the game loop.
 */

import { GameManager } from './engine/GameManager';
import { SettingsManager } from './engine/SettingsManager';
import { TileAssetManager } from './map/TileAssetManager';
import { DarksaberSpriteAtlas } from './ui/DarksaberSpriteAtlas';
import { mountUiOverlay } from './ui/react/mountOverlay';
import { mountAuthGate } from './ui/react/auth/mountAuthGate';
import { AuthApiError, AuthClient, type AuthSessionResponse } from './net/AuthClient';
import { Enemy } from './entity/Enemy';
import { LootObject } from './entity/LootObject';
import { getItemDef } from './data/ItemDB';
import { t } from './i18n/LanguageManager';

type DevStartMode = 'town' | 'raid' | 'tutorial';
type DevRaidScenario = 'aggro' | 'loot';

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
type DevNetworkRaidState = {
    activate: (playerId: string) => void;
    deactivate: () => void;
    setClient: (client: unknown) => void;
};
type DevWorldEngine = {
    partyActors: DevFieldActor[];
    fieldEnemies: Array<{ enemy: Enemy; home: DevTile; path: DevTile[] }>;
    worldMap: { loot: LootObject[]; isWalkable: (x: number, y: number) => boolean };
    selectionController: { selectActor: (actorId: string | null) => void; selectLoot: (lootId: string) => void };
    clearFieldTurnState: () => void;
    closeNetworkRaidClient?: (sendLeave: boolean, reason?: 'town' | 'wipe' | 'manual') => void;
    getNetworkRaidState: () => DevNetworkRaidState;
    addCombatLog?: (message: string) => void;
    currentPhase: string;
    player: DevEntity;
    activeTurnActorId: string | null;
    readyQueue: string[];
};

async function init(): Promise<void> {
    SettingsManager.init();

    // Explicitly preload DOSMyungjo for Canvas (Canvas doesn't trigger @font-face)
    const dosFont = new FontFace(
        'DOSMyungjo',
        "url('/assets/fonts/DOSMyungjo.ttf') format('truetype')"
    );
    try {
        const loaded = await dosFont.load();
        document.fonts.add(loaded);
        console.log('✅ DOSMyungjo font loaded');
    } catch (e) {
        console.warn('⚠️ DOSMyungjo font load failed, using fallback', e);
    }

    await TileAssetManager.init();
    await DarksaberSpriteAtlas.init();

    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error('Canvas element #gameCanvas not found!');
        return;
    }

    const manager = new GameManager(canvas);
    manager.start();

    // Mount the React DOM UI overlay and hand the store to the game loop.
    const uiStore = mountUiOverlay(manager);
    manager.attachUiStore(uiStore);

    const devStartMode = getDevStartMode();
    const devRaidScenario = getDevRaidScenario();
    if (devStartMode) {
        clearDevWorldResumeToken();
        window.setTimeout(() => {
            if (devStartMode === 'tutorial') enterDevTutorial(manager);
            else void enterDevTown(manager, devStartMode, devRaidScenario);
        }, 550);
    } else {
        mountAuthGate(manager);
        mountDevLauncher();
    }

    // DEV-only debug handle — lets tooling drive/inspect the game in a headless
    // preview (paired with GameManager's hidden-tab loop fallback). Stripped in prod.
    if (import.meta.env.DEV) (window as unknown as { __gm: GameManager }).__gm = manager;

    console.log('🎮 Darksaber : Extraction started');
}

function getDevStartMode(): DevStartMode | null {
    if (!import.meta.env.DEV) return null;
    const value = new URLSearchParams(window.location.search).get('devStart');
    if (value === '1' || value === 'town') return 'town';
    if (value === 'raid') return 'raid';
    if (value === 'tutorial') return 'tutorial';
    return null;
}

function getDevRaidScenario(): DevRaidScenario | null {
    if (!import.meta.env.DEV) return null;
    const value = new URLSearchParams(window.location.search).get('devScenario');
    if (value === 'aggro') return 'aggro';
    if (value === 'loot') return 'loot';
    return null;
}

function clearDevWorldResumeToken(): void {
    try {
        localStorage.removeItem('darksaber_world_resume_token');
    } catch {
        // Ignore storage failures; dev autostart still works without persistence.
    }
}

async function enterDevTown(manager: GameManager, mode: Extract<DevStartMode, 'town' | 'raid'>, scenario: DevRaidScenario | null): Promise<void> {
    try {
        const client = new AuthClient();
        const session = await loginOrRegisterDevAccount(client);
        const characterId = session.characters[0]?.id;
        const selected = characterId
            ? await client.selectCharacter(characterId)
            : await createDevCharacter(client, session);
        const accessToken = client.getAccessToken();
        if (!accessToken) throw new Error('Dev auth did not return an access token.');
        manager.enterAuthenticatedCharacter({
            accessToken,
            character: selected.character,
            save: selected.save,
            accountProgress: selected.accountProgress,
            authClient: client,
        });
        if (mode === 'raid') scheduleDevRaidDeploy(manager, scenario);
    } catch (error) {
        console.error('[Darksaber] Dev autostart failed', error);
        mountAuthGate(manager);
    }
}

function enterDevTutorial(manager: GameManager): void {
    manager.completeCharacterCreation('Dev Hero', 'infantry', 'M');
}

function scheduleDevRaidDeploy(manager: GameManager, scenario: DevRaidScenario | null): void {
    const startedAt = performance.now();
    const attempt = () => {
        const townSession = manager.getTownSession();
        if (townSession?.isVisible()) {
            townSession.ui.requestDeploy(Number.POSITIVE_INFINITY);
            if (scenario) scheduleDevRaidScenario(manager, scenario);
            return;
        }
        if (performance.now() - startedAt < 6000) window.setTimeout(attempt, 120);
        else console.warn('[Darksaber] Dev raid autostart timed out before town became visible.');
    };
    window.setTimeout(attempt, 700);
}

function scheduleDevRaidScenario(manager: GameManager, scenario: DevRaidScenario): void {
    const startedAt = performance.now();
    const attempt = () => {
        const raidSession = manager.getRaidSession();
        const townSession = manager.getTownSession();
        if (raidSession?.active && !townSession?.isVisible()) {
            applyDevRaidScenario(manager, scenario);
            return;
        }
        if (performance.now() - startedAt < 10000) window.setTimeout(attempt, 160);
        else console.warn(`[Darksaber] Dev raid scenario '${scenario}' timed out before raid became active.`);
    };
    window.setTimeout(attempt, 450);
}

function applyDevRaidScenario(manager: GameManager, scenario: DevRaidScenario): void {
    const world = getDevWorldEngine(manager);
    const actor = world?.partyActors[0];
    if (!world || !actor) {
        console.warn(`[Darksaber] Dev raid scenario '${scenario}' could not find a controlled actor.`);
        return;
    }

    world.closeNetworkRaidClient?.(false);
    world.currentPhase = 'raid';
    manager.inventoryUI.setActiveCharacter(actor.character as Parameters<typeof manager.inventoryUI.setActiveCharacter>[0]);

    if (scenario === 'aggro') applyDevAggroScenario(world, actor);
    else applyDevLootScenario(manager, world, actor);
}

function getDevWorldEngine(manager: GameManager): DevWorldEngine | null {
    return (manager as unknown as { worldEngine?: DevWorldEngine }).worldEngine ?? null;
}

function applyDevAggroScenario(world: DevWorldEngine, actor: DevFieldActor): void {
    world.getNetworkRaidState().deactivate();
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
    world.selectionController.selectActor(actor.id);
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
    const networkRaid = world.getNetworkRaidState();
    networkRaid.setClient(createDevLootClient());
    networkRaid.activate('dev-scenario');
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
    world.selectionController.selectLoot(loot.id);
    manager.inventoryUI.setExternalGrid(loot.inventory, loot.sourceLabel, { isRaidLoot: true });
    if (!manager.inventoryUI.isVisible()) manager.inventoryUI.toggle();
    world.addCombatLog?.(t('dev.scenario.lootReady'));
    setDevScenarioStatus('loot', 'loot-open');
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

function mountDevLauncher(): void {
    if (!import.meta.env.DEV) return;
    const root = document.createElement('div');
    root.className = 'dev-launcher';
    root.innerHTML = `
        <div class="dev-launcher__title">${t('dev.launcher.title')}</div>
        <a href="/?devStart=town">${t('dev.launcher.town')}</a>
        <a href="/?devStart=raid">${t('dev.launcher.raid')}</a>
        <a href="/?devStart=raid&devScenario=aggro">${t('dev.launcher.raidAggro')}</a>
        <a href="/?devStart=raid&devScenario=loot">${t('dev.launcher.raidLoot')}</a>
        <a href="/?devStart=tutorial">${t('dev.launcher.tutorial')}</a>
    `;
    document.body.appendChild(root);
}

async function loginOrRegisterDevAccount(client: AuthClient): Promise<AuthSessionResponse> {
    const loginName = 'dev-town';
    const password = 'dev-password-123';
    try {
        return await client.login(loginName, password);
    } catch (error) {
        if (!(error instanceof AuthApiError) || error.status !== 401) throw error;
        return client.register(loginName, password);
    }
}

async function createDevCharacter(client: AuthClient, session: AuthSessionResponse) {
    const created = await client.createCharacter('Dev Hero', 'infantry', 'M');
    return {
        character: created.character,
        save: created.save,
        accountProgress: session.accountProgress,
    };
}

// Wait for DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
