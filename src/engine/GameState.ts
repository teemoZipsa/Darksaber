/**
 * GameState — defines the high-level flow of the Extraction RPG.
 */
export enum GameState {
    LOBBY = 'LOBBY',
    RAID = 'RAID',     // In the open world
    RESULTS = 'RESULTS' // Post-raid summary (extacted or died)
}
