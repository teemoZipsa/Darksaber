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

    if (isDevAutoStartEnabled()) {
        clearDevWorldResumeToken();
        window.setTimeout(() => { void enterDevTown(manager); }, 550);
    } else {
        mountAuthGate(manager);
    }

    // DEV-only debug handle — lets tooling drive/inspect the game in a headless
    // preview (paired with GameManager's hidden-tab loop fallback). Stripped in prod.
    if (import.meta.env.DEV) (window as unknown as { __gm: GameManager }).__gm = manager;

    console.log('🎮 Darksaber : Extraction started');
}

function isDevAutoStartEnabled(): boolean {
    if (!import.meta.env.DEV) return false;
    const value = new URLSearchParams(window.location.search).get('devStart');
    return value === '1' || value === 'town';
}

function clearDevWorldResumeToken(): void {
    try {
        localStorage.removeItem('darksaber_world_resume_token');
    } catch {
        // Ignore storage failures; dev autostart still works without persistence.
    }
}

async function enterDevTown(manager: GameManager): Promise<void> {
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
    } catch (error) {
        console.error('[Darksaber] Dev autostart failed', error);
        mountAuthGate(manager);
    }
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
