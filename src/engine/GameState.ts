/**
 * GameState — defines the high-level game states for the Sin Eater SRPG.
 */
export enum GameState {
    TITLE = 'TITLE',
    CHARACTER_CREATION = 'CHARACTER_CREATION',
    WORLD = 'WORLD',                 // Open world (town + field), WASD movement, multiplayer
    SHOP = 'SHOP',                   // Shop UI overlay
}
