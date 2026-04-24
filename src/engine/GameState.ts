/**
 * GameState — defines the high-level game states for the Sin Eater SRPG.
 */
export enum GameState {
    TITLE = 'TITLE',
    CHARACTER_CREATION = 'CHARACTER_CREATION',
    WORLD = 'WORLD',                 // Open world (town + field), WASD movement, multiplayer
    BATTLE = 'BATTLE',               // Battle map (SRPG turn-based), singleplayer
    SHOP = 'SHOP',                   // Shop UI overlay
    BATTLE_RESULT = 'BATTLE_RESULT', // Post-battle rewards screen

    // ── Legacy aliases (kept for backward compat with GameEngine.ts) ──
    LOBBY = 'LOBBY',
    RAID = 'RAID',
    TOWN_VISIT = 'TOWN_VISIT',
    RESULTS = 'RESULTS',
}
