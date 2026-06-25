import type { InventorySaveSnapshot } from './CharacterSave';

export const DEFAULT_STASH_WIDTH = 15;
export const DEFAULT_STASH_HEIGHT = 10;

export function createDefaultStashSnapshot(): InventorySaveSnapshot {
    return { width: DEFAULT_STASH_WIDTH, height: DEFAULT_STASH_HEIGHT, items: [] };
}
