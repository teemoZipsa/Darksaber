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
import { t } from './i18n/LanguageManager';
import { applyDevRaidScenario, parseDevRaidScenario, type DevRaidScenario } from './dev/DevRaidScenarios';

type DevStartMode = 'town' | 'raid' | 'tutorial';

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
    return parseDevRaidScenario(value);
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
        <a href="/?devStart=raid&devScenario=story23">${t('dev.launcher.raidLateStory')}</a>
        <a href="/?devStart=raid&devScenario=story31">${t('dev.launcher.raidStory31')}</a>
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
