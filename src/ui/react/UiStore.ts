/**
 * UiStore — the bridge between the canvas game and the React DOM overlay.
 *
 * The game has no event bus; state is mutated in place and polled each frame.
 * Rather than instrument every mutation site, we reuse the existing frame loop:
 * GameManager calls `tick()` once per frame, which bumps a version counter and
 * notifies React subscribers. React reads live state through the selectors below.
 *
 * This mirrors the existing `SettingsManager.onChange` / `i18n.subscribe` patterns.
 * React never mutates game state directly — it calls the action methods here,
 * which delegate to GameManager.
 */

import type { GameManager } from '../../engine/GameManager';
import type { Character } from '../../character/Character';

export class UiStore {
    private listeners = new Set<() => void>();
    private _version = 0;

    constructor(private readonly gm: GameManager) {}

    // ─── Subscription (consumed by useSyncExternalStore) ──────────
    /** Subscribe to per-frame ticks. Returns an unsubscribe fn. */
    subscribe = (cb: () => void): (() => void) => {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    };

    /** Stable primitive snapshot — the frame version counter. */
    getVersion = (): number => this._version;

    /** Called once per frame by GameManager; advances the version and notifies React. */
    tick(): void {
        this._version++;
        for (const cb of this.listeners) cb();
    }

    // ─── Selectors (read live from GameManager) ───────────────────
    getActiveCharacter = (): Character | undefined => this.gm.party.getActive();
    getActiveParty = (): Character[] => this.gm.party.getCharacters();
    getActiveIndex = (): number => this.gm.party.getActiveIndex();
    getGold = (): number => this.gm.playerData.gold;
    isCharPanelOpen = (): boolean => this.gm.charUI.isVisible();

    // ─── Actions (delegate to GameManager; never mutate directly) ──
    /** Switch the active party member; syncs dependent UI (e.g. inventory). */
    switchTo = (index: number): void => {
        if (this.gm.party.switchTo(index)) {
            this.gm.onActiveCharacterChanged();
            this.tick(); // reflect the change immediately, not on the next frame
        }
    };

    /** Close the character panel (flips the same visibility bit the C key toggles). */
    closeCharPanel = (): void => {
        if (this.gm.charUI.isVisible()) {
            this.gm.charUI.toggle();
            this.tick();
        }
    };
}
