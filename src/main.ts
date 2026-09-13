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
import { NetworkRaidClient } from './net/NetworkRaidClient';
import { formatT, i18n, t } from './i18n/LanguageManager';
import { applyDevRaidScenario, DEV_STORY_EPISODES, parseDevRaidScenario, type DevRaidScenario } from './dev/DevRaidScenarios';

type DevStartMode = 'town' | 'raid' | 'tutorial';

function init(): void {
    i18n.init();
    SettingsManager.init();

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

    // First paint and auth controls must not wait for large game assets. The
    // compact terrain sheets, sprite atlases, and Canvas font warm in parallel;
    // painted terrain fallbacks and world decorations load when first rendered.
    const coreAssetsReady = preloadCoreAssets();

    const devStartMode = getDevStartMode();
    const devRaidScenario = getDevRaidScenario();
    const devForceLocal = getDevForceLocal();
    if (devStartMode) {
        clearDevWorldResumeToken();
        runAfterInitialTransition(manager, () => {
            void coreAssetsReady.then(() => {
                if (devStartMode === 'tutorial') enterDevTutorial(manager);
                else void enterDevTown(manager, devStartMode, devRaidScenario, devForceLocal);
            });
        });
    } else {
        mountAuthGate(manager);
        mountDevLauncher(manager, uiStore);
    }

    // DEV-only debug handle — lets tooling drive/inspect the game in a headless
    // preview (paired with GameManager's hidden-tab loop fallback). Stripped in prod.
    if (import.meta.env.DEV) (window as unknown as { __gm: GameManager }).__gm = manager;

    console.log('🎮 Darksaber : Extraction started');
}

async function preloadCoreAssets(): Promise<void> {
    await Promise.all([
        loadCanvasFont(),
        TileAssetManager.init(),
        DarksaberSpriteAtlas.init(),
    ]);
}

async function loadCanvasFont(): Promise<void> {
    const dosFont = new FontFace(
        'DOSMyungjo',
        "url('/assets/fonts/DOSMyungjo.ttf') format('truetype')"
    );
    try {
        const loaded = await dosFont.load();
        document.fonts.add(loaded);
        console.log('✅ DOSMyungjo font loaded');
    } catch (error) {
        console.warn('⚠️ DOSMyungjo font load failed, using fallback', error);
    }
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
    return parseDevRaidScenario(value);
}

function getDevForceLocal(): boolean {
    if (!import.meta.env.DEV) return false;
    return new URLSearchParams(window.location.search).get('devLocal') === '1';
}

function clearDevWorldResumeToken(): void {
    NetworkRaidClient.clearStoredResumeTokens();
}

function runAfterInitialTransition(manager: GameManager, callback: () => void): void {
    const startedAt = performance.now();
    const attempt = () => {
        if (!manager.isTransitionActive() || performance.now() - startedAt > 5000) {
            callback();
            return;
        }
        window.setTimeout(attempt, 80);
    };
    window.setTimeout(attempt, 80);
}

async function enterDevTown(
    manager: GameManager,
    mode: Extract<DevStartMode, 'town' | 'raid'>,
    scenario: DevRaidScenario | null,
    forceLocal: boolean
): Promise<void> {
    // Fixtures mutate party, items, and story progress: never attach them to a saved account.
    if (forceLocal || scenario) {
        manager.enterLocalDevCharacter('Dev Hero', 'infantry', 'M');
        mountDevSessionNotice('local');
        if (mode === 'raid') scheduleDevRaidDeploy(manager, scenario, true);
        return;
    }
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
        mountDevSessionNotice('online');
        if (mode === 'raid') scheduleDevRaidDeploy(manager, scenario, false);
    } catch (error) {
        console.warn('[Darksaber] Dev auth autostart unavailable; using local dev character.', error);
        manager.enterLocalDevCharacter('Dev Hero', 'infantry', 'M');
        mountDevSessionNotice('fallback');
        if (mode === 'raid') scheduleDevRaidDeploy(manager, scenario, true);
    }
}

function enterDevTutorial(manager: GameManager): void {
    manager.enterLocalDevCharacter('Dev Hero', 'infantry', 'M', { startIntroTutorial: true });
    mountDevSessionNotice('local');
}

function mountDevSessionNotice(mode: 'local' | 'online' | 'fallback'): void {
    if (!import.meta.env.DEV) return;
    const root = document.createElement('details');
    root.className = 'dev-session';
    root.dataset.mode = mode;
    root.open = mode === 'fallback';
    const label = mode === 'online' ? t('dev.session.online') : t('dev.session.local');
    const note = mode === 'online' ? t('dev.session.onlineNote')
        : mode === 'fallback' ? t('dev.session.fallbackNote') : t('dev.launcher.localNote');
    root.innerHTML = `<summary>${label}</summary>
        <p>${note}</p>
        <a href="/">${t('dev.session.back')}</a>`;
    document.body.appendChild(root);
}

function scheduleDevRaidDeploy(manager: GameManager, scenario: DevRaidScenario | null, localFallback: boolean): void {
    const startedAt = performance.now();
    const attempt = () => {
        const townSession = manager.getTownSession();
        if (townSession?.isVisible()) {
            if (localFallback) manager.beginLocalDevRaidFromTown();
            else townSession.ui.requestDeploy(Number.POSITIVE_INFINITY);
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
            if (applyDevRaidScenario(manager, scenario, { warn: false })) return;
        }
        if (performance.now() - startedAt < 10000) window.setTimeout(attempt, 160);
        else console.warn(`[Darksaber] Dev raid scenario '${scenario}' timed out before raid was ready.`);
    };
    window.setTimeout(attempt, 450);
}

function mountDevLauncher(manager: GameManager, uiStore: ReturnType<typeof mountUiOverlay>): void {
    if (!import.meta.env.DEV) return;
    const root = document.createElement('details');
    root.className = 'dev-launcher';
    root.open = true;
    const storyLinks = DEV_STORY_EPISODES.map((episode) =>
        `<a href="/?devStart=raid&devScenario=story${episode}&devLocal=1">${formatT('dev.launcher.raidStoryEpisode', { episode })}</a>`
    ).join('');
    root.innerHTML = `
        <summary class="dev-launcher__title">${t('dev.launcher.title')}</summary>
        <p>${t('dev.launcher.localNote')}</p>
        <div class="dev-launcher__links">
            <a href="/?devStart=town&devLocal=1">${t('dev.launcher.town')}</a>
            <a href="/?devStart=raid&devLocal=1">${t('dev.launcher.raid')}</a>
            <a href="/?devStart=tutorial">${t('dev.launcher.tutorial')}</a>
        </div>
        <details class="dev-launcher__tests">
            <summary>${t('dev.launcher.scenarios')}</summary>
            <p>${t('dev.launcher.scenarioNote')}</p>
            <div class="dev-launcher__links">
                <a href="/?devStart=raid&devScenario=aggro&devLocal=1">${t('dev.launcher.raidAggro')}</a>
                <a href="/?devStart=raid&devScenario=loot&devLocal=1">${t('dev.launcher.raidLoot')}</a>
                <a href="/?devStart=raid&devScenario=combat&devLocal=1">${t('dev.launcher.raidCombat')}</a>
                ${storyLinks}
            </div>
        </details>
        <details>
            <summary>${t('dev.launcher.server')}</summary>
            <p>${t('dev.session.onlineNote')}</p>
            <div class="dev-launcher__links">
                <a href="/?devStart=town">${t('dev.launcher.town')}</a>
                <a href="/?devStart=raid">${t('dev.launcher.raid')}</a>
            </div>
        </details>
    `;
    document.body.appendChild(root);
    // Normal account entry stays on this page. Remove the launcher from pointer
    // and keyboard navigation while the world (including town/results) is open.
    const syncVisibility = () => { root.hidden = manager.getFieldEngine() !== null; };
    uiStore.subscribe(syncVisibility);
    syncVisibility();
}

async function loginOrRegisterDevAccount(client: AuthClient): Promise<AuthSessionResponse> {
    const loginName = getDevLoginName();
    const password = 'dev-password-123';
    try {
        return await client.login(loginName, password);
    } catch (error) {
        if (!(error instanceof AuthApiError) || error.status !== 401) throw error;
        return client.register(loginName, password);
    }
}

function getDevLoginName(): string {
    const configured = new URLSearchParams(window.location.search).get('devAccount')?.trim();
    if (configured && /^[A-Za-z0-9_.-]{3,32}$/.test(configured)) return configured;
    return 'dev-town';
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
