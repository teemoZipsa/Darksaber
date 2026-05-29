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
    getRoster = (): Character[] => this.gm.party.getRoster();
    getActiveIndex = (): number => this.gm.party.getActiveIndex();
    isPartyFull = (): boolean => this.gm.party.isFull();
    getGold = (): number => this.gm.playerData.gold;
    isCharPanelOpen = (): boolean => this.gm.charUI.isVisible();
    isPauseOpen = (): boolean => this.gm.isPauseMenuOpen();
    isSettingsOpen = (): boolean => this.gm.isSettingsMenuOpen();
    isPartyOpen = (): boolean => this.gm.partyUI.isVisible();

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

    // ─── Pause menu actions ───────────────────────────────────────
    pauseResume = (): void => { this.gm.pauseResume(); this.tick(); };
    pauseOpenSettings = (): void => { this.gm.pauseOpenSettings(); this.tick(); };
    pauseReturnToTitle = (): void => { this.gm.pauseReturnToTitle(); this.tick(); };

    // ─── Settings actions ─────────────────────────────────────────
    closeSettings = (): void => { this.gm.closeSettingsMenu(); this.tick(); };

    // ─── Party actions ────────────────────────────────────────────
    closeParty = (): void => {
        if (this.gm.partyUI.isVisible()) { this.gm.partyUI.toggle(); this.tick(); }
    };
    partyDeploy = (char: Character): void => { this.gm.party.deployCharacter(char); this.afterPartyChange(); };
    partyUndeploy = (charId: string): void => { this.gm.party.unDeployCharacter(charId); this.afterPartyChange(); };
    partySwapActive = (a: number, b: number): void => { this.gm.party.swapActiveSlots(a, b); this.afterPartyChange(); };
    partyReplaceActive = (slot: number, char: Character): void => { this.gm.party.replaceActiveSlot(slot, char); this.afterPartyChange(); };
    partySwapRoster = (a: number, b: number): void => { this.gm.party.swapRoster(a, b); this.tick(); };

    private afterPartyChange = (): void => {
        this.gm.onActiveCharacterChanged();
        this.tick();
    };
}
