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
import type { WorldTownSession } from '../../engine/world/WorldTownSession';
import type { TownTab } from '../../ui/TownUI';
import type { ShopEntry, SellEntry } from '../../ui/ShopUI';
import type { ShopKind } from '../../data/ShopData';
import type { TownInfo } from '../../map/BiomeMask';

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

    // ─── Town visit (DOM overlay) ─────────────────────────────────
    private town = (): WorldTownSession | null => this.gm.getTownSession();
    private townUi = () => this.town()?.ui ?? null;
    private shop = () => this.townUi()?.getShopUI() ?? null;

    isTownOpen = (): boolean => this.town()?.isVisible() ?? false;
    getTownTab = (): TownTab => this.townUi()?.getActiveTab() ?? 'storage';
    getTownInfo = (): TownInfo | null => this.townUi()?.getCurrentTown() ?? null;
    getTownRumors = (): string[] => this.townUi()?.getRumors() ?? [];
    getRestFacility = () => this.townUi()?.getRestFacilityPublic() ?? null;
    getPendingRestMenuId = (): string | null => this.townUi()?.getPendingRestMenuId?.() ?? null;
    getInjuredCount = (): number => this.townUi()?.getInjuredCount?.() ?? 0;
    isQuestDone = (questId: string): boolean => this.townUi()?.getQuestDone?.(questId) ?? false;

    getShopKind = (): ShopKind => this.shop()?.getActiveKind() ?? 'equipment';
    getShopGold = (): number => this.shop()?.getGoldValue() ?? this.gm.playerData.gold;
    getShopBuyEntries = (): ShopEntry[] => this.shop()?.listBuyEntries() ?? [];
    getShopSellEntries = (): SellEntry[] => this.shop()?.listSellEntries() ?? [];

    // Town actions
    townSetTab = (tab: TownTab): void => { this.townUi()?.setTab(tab); this.tick(); };
    townDeploy = (): void => { this.townUi()?.requestDeploy(); this.tick(); };

    shopSetKind = (kind: ShopKind): void => { this.shop()?.setActiveKind(kind); this.tick(); };
    shopBuy = (entry: ShopEntry): boolean => { const ok = this.shop()?.buy(entry) ?? false; this.tick(); return ok; };
    shopSell = (entry: SellEntry): boolean => { const ok = this.shop()?.sell(entry) ?? false; this.tick(); return ok; };

    restPurchase = (menuId: string): boolean => { const ok = this.town()?.purchaseRestMenu(menuId) ?? false; this.tick(); return ok; };
    restTreat = (): boolean => { const ok = this.town()?.treatActivePartyInjuries() ?? false; this.tick(); return ok; };
}
