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
import { createBaseStats } from './data/Stats';
import type { AuthenticatedCharacterSession } from './engine/GameManager';

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
        window.setTimeout(() => manager.enterAuthenticatedCharacter(createDevCharacterSession()), 550);
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

function createDevCharacterSession(): AuthenticatedCharacterSession {
    const now = new Date().toISOString();
    const characterId = 'dev-infantry';
    const accountId = 'dev-account';
    const baseStats = createBaseStats({ hp: 110, maxHp: 110, mp: 10, maxMp: 10, atk: 12, def: 6, magAtk: 0, mov: 3 });
    const character = {
        id: characterId,
        slotNo: 0,
        name: 'Dev Hero',
        classKey: 'infantry',
        tier: 1,
        level: 1,
        exp: 0,
        baseStats,
        createdAt: now,
        updatedAt: now,
    } as const;

    return {
        accessToken: 'dev-access-token',
        character,
        accountProgress: {
            accountId,
            completedQuests: [],
            unlocks: {},
            flags: {},
            updatedAt: now,
        },
        save: {
            characterId,
            saveVersion: 1,
            revision: 1,
            hubLocation: {
                realm: 'mortal',
                townId: 'central_castle',
            },
            questState: {
                completedQuestIds: [],
            },
            inventory: {
                width: 10,
                height: 6,
                items: [
                    { itemId: 'short_sword', gridX: 0, gridY: 0, quantity: 1, durability: 100 },
                    { itemId: 'herb_cheap', gridX: 2, gridY: 0, quantity: 2, durability: 1 },
                    { itemId: 'mp_potion', gridX: 3, gridY: 0, quantity: 1, durability: 1 },
                ],
            },
            equipment: {},
            partySnapshot: {
                activeCharacterIds: [characterId],
            },
            rosterSnapshot: {
                characters: [{
                    id: characterId,
                    name: character.name,
                    classKey: character.classKey,
                    gender: 'M',
                    tier: character.tier,
                    level: character.level,
                    exp: character.exp,
                    baseStats,
                }],
            },
            updatedAt: now,
        },
    };
}

// Wait for DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
