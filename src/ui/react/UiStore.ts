/**
 * UiStore — the bridge between the canvas game and the React DOM overlay.
 *
 * The game has no event bus; state is mutated in place and sampled from the
 * frame loop. `tick()` builds a compact signature of the DOM-visible state and
 * only notifies React subscribers when that signature changes. React reads live
 * state through the selectors below.
 *
 * This mirrors the existing `SettingsManager.onChange` / `i18n.subscribe` patterns.
 * React never mutates game state directly — it calls the action methods here,
 * which delegate to GameManager.
 */

import type { GameManager } from '../../engine/GameManager';
import type { Character } from '../../character/Character';
import type { BountyContractView, MerchantContractView, WorldTownSession } from '../../engine/world/WorldTownSession';
import type { TownTab } from '../../ui/TownUI';
import type { ShopEntry, SellEntry } from '../../ui/ShopUI';
import type { ShopKind } from '../../data/ShopData';
import type { TownInfo } from '../../map/BiomeMask';
import type { InventoryUI } from '../../inventory/InventoryUI';
import type { ItemSlot } from '../../data/ItemDB';
import type { GridInventory, PlacedItem } from '../../inventory/GridInventory';
import { SettingsManager } from '../../engine/SettingsManager';
import { i18n } from '../../i18n/LanguageManager';
import { getRepairCost, getUnsocketCost, repairItem, unsocketAll } from '../../inventory/Socketing';
import { getStoryQuestViews as buildStoryQuestViews, type StoryQuestView } from '../../data/StoryQuestData';
import { getSkill, type Skill } from '../../data/SkillDB';
import { overlayFlagsSignature, type OverlayPanelId, type OverlayOpenState } from './OverlayRegistry';
import {
    applyFacilityCostMultiplier,
    getNextFacilityUpgradeTier,
    getWorkshopCostMultiplier,
    type FacilityUpgradeCostItem,
    type FacilityUpgradeDefinition,
    type FacilityUpgradeId,
} from '../../data/FacilityUpgradeData';
import {
    checkUpgrade,
    getLearnedSkillIdSet,
    getOrderedLearnedSkills,
    getUpgradeLevel,
    normalizeLoadout,
} from '../../magic/MagicLoadout';
import type { RaidHistoryEntry } from '../../raid/RaidHistory';
import type { MonsterCodexEntry } from '../../raid/MonsterCodex';

export interface BlacksmithEntry {
    id: string;
    placed: PlacedItem;
    source: 'equipment' | 'backpack' | 'stash';
    sourceLabel: string;
    slot?: ItemSlot;
    repairCost: number;
    unsocketCost: number;
}

export interface FacilityUpgradeView {
    definition: FacilityUpgradeDefinition;
    level: number;
    nextLevel: number | null;
    goldCost: number;
    items: Array<FacilityUpgradeCostItem & { owned: number }>;
    canUpgrade: boolean;
    maxed: boolean;
}

export interface UiMutationResult {
    ok: boolean;
    reasonKey?: string;
}

const RAID_EDITING_LOCKED_REASON_KEY = 'raid.editingLocked';

export class UiStore {
    private listeners = new Set<() => void>();
    private _version = 0;
    private lastSignature = '';

    constructor(private readonly gm: GameManager) {}

    // ─── Subscription (consumed by useSyncExternalStore) ──────────
    /** Subscribe to DOM-visible state changes. Returns an unsubscribe fn. */
    subscribe = (cb: () => void): (() => void) => {
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    };

    /** Stable primitive snapshot — bumps only when DOM-visible state changes. */
    getVersion = (): number => this._version;

    /** Called by GameManager's frame loop; notifies React only when the UI snapshot changed. */
    tick(): void {
        const signature = this.captureSignature();
        if (signature === this.lastSignature) return;
        this.lastSignature = signature;
        this._version++;
        for (const cb of this.listeners) cb();
    }

    private captureSignature(): string {
        const openState = this.getOverlayOpenState();
        const flags = overlayFlagsSignature(openState);
        return [
            flags,
            `lang:${i18n.lang}`,
            `settings:${SettingsManager.lastUpdated}`,
            `gold:${this.getGold()}`,
            `party:${this.getActiveIndex()}:${this.getRoster().map((char) => this.characterSignature(char)).join(';')}`,
            openState.town ? `town:${this.townSignature()}` : '',
            openState.inventory ? `worldInv:${this.inventorySignature(this.getWorldInventory())}` : '',
            openState.journal ? `quests:${this.questSignature()}` : '',
            openState.magic ? `magic:${this.magicSignature()}` : '',
        ].join('|');
    }

    private townSignature(): string {
        const town = this.getTownInfo();
        const townInv = this.getTownInventory();
        return [
            town?.id ?? '',
            this.getTownTab(),
            this.isTownDeployPending() ? 'deploying' : '',
            this.getTownDeployError() ?? '',
            this.getHubSaveError() ?? '',
            this.getPendingRestMenuId() ?? '',
            this.getInjuredCount(),
            this.hasRaidInsurance() ? 'insured' : `insurance:${this.getRaidInsurancePrice()}`,
            `rumors:${this.getTownRumors().join('~')}`,
            `shop:${this.shopSignature()}`,
            `facilities:${this.getFacilityUpgradeViews().map((view) => `${view.definition.id}:${view.level}:${view.canUpgrade ? 1 : 0}:${view.items.map((item) => `${item.itemId}:${item.owned}`).join(',')}`).join(';')}`,
            `contracts:${this.getMerchantContractViews().map((contract) => `${contract.id}:${contract.canComplete ? 1 : 0}`).join(';')}`,
            `bounties:${this.getBountyContractViews().map((view) => `${view.contract.id}:${view.active ? 1 : 0}`).join(';')}`,
            townInv ? `inv:${this.inventorySignature(townInv)}` : '',
            `quests:${this.questSignature()}`,
        ].join('/');
    }

    private shopSignature(): string {
        const shop = this.shop();
        if (!shop) return '';
        return [
            this.getShopKind(),
            this.getShopGold(),
            this.getShopBuyEntries().map((entry) => `${entry.item.id}:${entry.remaining}:${entry.price}`).join(','),
            this.getShopSellEntries().map((entry) => `${entry.source.id}:${this.placedSignature(entry.placed)}:${entry.price}`).join(','),
        ].join(':');
    }

    private questSignature(): string {
        const quests = this.getStoryQuestViews()
            .map((view) => `${view.quest.id}:${view.status}:${view.rewardView.owned ? 1 : 0}:${view.sideObjectives.map((side) => `${side.labelKey}:${side.completed ? 1 : 0}`).join('~')}`)
            .join(',');
        const history = this.getRaidHistory()
            .map((entry) => [
                entry.id,
                entry.completedAt,
                entry.result,
                entry.elapsedSeconds,
                entry.kills,
                entry.departureTownId,
                entry.extractionTownId,
                entry.securedItems,
                entry.lostItems,
                entry.equipmentLost,
                entry.goldReward,
            ].join(':'))
            .join(',');
        const codex = this.getMonsterCodex()
            .map((entry) => [
                entry.monsterId,
                entry.encounters,
                entry.kills,
                entry.highestDefeatedLevel,
                entry.lastEncounteredAt,
                entry.lastDefeatedAt ?? 0,
            ].join(':'))
            .join(',');
        return `${quests}|history:${history}|codex:${codex}`;
    }

    private magicSignature(): string {
        const char = this.getActiveCharacter();
        return char
            ? `${char.id}:${char.magicLoadout.join(',')}:${Object.entries(char.skillUpgradeLevels).sort(([a], [b]) => a.localeCompare(b)).map(([id, level]) => `${id}:${level}`).join(',')}`
            : '';
    }

    private inventorySignature(inv: InventoryUI): string {
        const ext = inv.getExternalGrid();
        return [
            inv.isCloseHidden() ? 'hiddenClose' : '',
            inv.getExternalTitle(),
            inv.isExternalRaidLoot() ? 'raidLoot' : '',
            inv.getActiveCharacter()?.id ?? '',
            `${inv.getFeedback().id}:${inv.getFeedback().text}`,
            `bag:${this.gridSignature(inv.getBag())}`,
            ext ? `ext:${this.gridSignature(ext)}` : '',
        ].join(':');
    }

    private gridSignature(grid: GridInventory): string {
        return `${grid.width}x${grid.height}:${grid.items.map((placed) => this.placedSignature(placed)).join(',')}`;
    }

    private characterSignature(char: Character): string {
        const stats = char.stats;
        return [
            char.id,
            char.name,
            char.classLineId,
            char.currentTier,
            char.level,
            char.exp,
            char.isDead ? 1 : 0,
            `${stats.hp}/${stats.maxHp}/${stats.mp}/${stats.maxMp}`,
            `eq:${[...char.equipment.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([slot, placed]) => `${slot}:${this.placedSignature(placed)}`).join(',')}`,
            `loadout:${char.magicLoadout.join(',')}`,
        ].join(':');
    }

    private placedSignature(placed: PlacedItem): string {
        return [
            placed.item.id,
            placed.gridX,
            placed.gridY,
            placed.quantity,
            placed.durability,
            placed.acquiredInRaid ? 1 : 0,
            placed.sockets?.map((item) => item.id).join('+') ?? '',
        ].join('@');
    }

    // ─── Selectors (read live from GameManager) ───────────────────
    getActiveCharacter = (): Character | undefined => this.gm.party.getActive();
    getActiveParty = (): Character[] => this.gm.party.getCharacters();
    getRoster = (): Character[] => this.gm.party.getRoster();
    getActiveIndex = (): number => this.gm.party.getActiveIndex();
    isPartyFull = (): boolean => this.gm.party.isFull();
    getGold = (): number => this.gm.playerData.gold;
    getOverlayOpenState = (): OverlayOpenState => this.gm.getOverlayOpenState();
    isOverlayOpen = (id: OverlayPanelId): boolean => this.getOverlayOpenState()[id];
    isCharPanelOpen = (): boolean => this.isOverlayOpen('char');
    isPauseOpen = (): boolean => this.isOverlayOpen('pause');
    isSettingsOpen = (): boolean => this.isOverlayOpen('settings');
    isPartyOpen = (): boolean => this.isOverlayOpen('party');
    isQuestJournalOpen = (): boolean => this.isOverlayOpen('journal');
    getStoryQuestViews = (): StoryQuestView[] => buildStoryQuestViews(this.gm.playerData, this.gm.getRaidSession());
    getRaidHistory = (): readonly RaidHistoryEntry[] => this.gm.playerData.raidHistory;
    getMonsterCodex = (): readonly MonsterCodexEntry[] => this.gm.playerData.monsterCodex;
    isRaidPreparationEditingLocked = (): boolean => this.gm.isRaidPreparationEditingLocked();

    private raidPreparationEditGuard(): UiMutationResult | null {
        return this.isRaidPreparationEditingLocked()
            ? { ok: false, reasonKey: RAID_EDITING_LOCKED_REASON_KEY }
            : null;
    }

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

    // ─── Quest journal actions ───────────────────────────────────
    closeQuestJournal = (): void => { this.gm.closeQuestJournal(); this.tick(); };

    // ─── Magic loadout / upgrade (DOM overlay, K key) ─────────────
    isMagicLoadoutOpen = (): boolean => this.isOverlayOpen('magic');
    closeMagicLoadout = (): void => { this.gm.closeMagicLoadout(); this.tick(); };

    /** Equipped skill ids for a character, normalized to currently-learnable ones. */
    getMagicLoadout = (char: Character): string[] => normalizeLoadout(char.magicLoadout, char);
    /** All learned skills in deterministic (tier, id) order — for the learned list. */
    getLearnedMagicSkills = (char: Character): Skill[] => getOrderedLearnedSkills(char);
    getSkillUpgradeLevel = (char: Character, skillId: string): number =>
        getUpgradeLevel(char.skillUpgradeLevels, skillId);

    /** Equip `skillId` into slot `slotIndex` of the active character (swap if already equipped). */
    equipMagic = (slotIndex: number, skillId: string): UiMutationResult => {
        const blocked = this.raidPreparationEditGuard();
        if (blocked) return blocked;
        const char = this.gm.party.getActive();
        if (!char || !getLearnedSkillIdSet(char).has(skillId)) return { ok: false };
        const arr = normalizeLoadout(char.magicLoadout, char);
        if (slotIndex < 0 || slotIndex >= arr.length || arr[slotIndex] === skillId) return { ok: false };
        const existing = arr.indexOf(skillId);
        if (existing >= 0) arr[existing] = arr[slotIndex]; // swap the two slots' skills
        arr[slotIndex] = skillId;                          // (otherwise the benched skill replaces)
        char.magicLoadout = arr;
        this.gm.saveActiveCharacterMagic();
        this.tick();
        return { ok: true };
    };

    /** Spend gold to raise the active character's upgrade level for a skill by 1. */
    upgradeMagic = (skillId: string): { ok: boolean; reasonKey?: string } => {
        const blocked = this.raidPreparationEditGuard();
        if (blocked) return blocked;
        const char = this.gm.party.getActive();
        if (!char) return { ok: false };
        const skill = getSkill(skillId);
        if (!skill) return { ok: false };
        const isLearned = getLearnedSkillIdSet(char).has(skillId);
        const level = getUpgradeLevel(char.skillUpgradeLevels, skillId);
        const check = checkUpgrade(skill, level, this.gm.playerData.gold, isLearned);
        if (!check.ok) { this.tick(); return { ok: false, reasonKey: check.reasonKey }; }
        this.gm.playerData.spendGold(check.cost);
        char.skillUpgradeLevels = { ...char.skillUpgradeLevels, [skillId]: level + 1 };
        this.gm.saveActiveCharacterMagic();
        this.tick();
        return { ok: true };
    };

    // ─── Party actions ────────────────────────────────────────────
    closeParty = (): void => {
        if (this.gm.partyUI.isVisible()) { this.gm.partyUI.toggle(); this.tick(); }
    };
    partyDeploy = (char: Character): UiMutationResult =>
        this.runPartyMutation(() => this.gm.party.deployCharacter(char));
    partyUndeploy = (charId: string): UiMutationResult =>
        this.runPartyMutation(() => this.gm.party.unDeployCharacter(charId));
    partySwapActive = (a: number, b: number): UiMutationResult =>
        this.runPartyMutation(() => this.gm.party.swapActiveSlots(a, b));
    partyReplaceActive = (slot: number, char: Character): UiMutationResult =>
        this.runPartyMutation(() => this.gm.party.replaceActiveSlot(slot, char));
    partySwapRoster = (a: number, b: number): UiMutationResult => {
        const blocked = this.raidPreparationEditGuard();
        if (blocked) return blocked;
        if (!this.gm.party.swapRoster(a, b)) return { ok: false };
        this.gm.persistHubSaveToServer();
        this.tick();
        return { ok: true };
    };

    private runPartyMutation = (mutation: () => boolean | void): UiMutationResult => {
        const blocked = this.raidPreparationEditGuard();
        if (blocked) return blocked;
        if (mutation() === false) return { ok: false };
        this.afterPartyChange();
        return { ok: true };
    };

    private afterPartyChange = (): void => {
        this.gm.onActiveCharacterChanged();
        this.gm.persistHubSaveToServer();
        this.tick();
    };

    // ─── Town visit (DOM overlay) ─────────────────────────────────
    private town = (): WorldTownSession | null => this.gm.getTownSession();
    private townUi = () => this.town()?.ui ?? null;
    private shop = () => this.townUi()?.getShopUI() ?? null;

    isTownOpen = (): boolean => this.isOverlayOpen('town');
    getTownTab = (): TownTab => this.townUi()?.getActiveTab() ?? 'storage';
    getTownInfo = (): TownInfo | null => this.townUi()?.getCurrentTown() ?? null;
    getTownRumors = (): string[] => this.townUi()?.getRumors() ?? [];
    getRestFacility = () => this.townUi()?.getRestFacilityPublic() ?? null;
    isTownDeployPending = (): boolean => this.townUi()?.isDeployPending() ?? false;
    getTownDeployError = (): string | null => this.townUi()?.getDeployError() ?? null;
    getHubSaveError = (): string | null => this.gm.getHubSaveError();
    getPendingRestMenuId = (): string | null => this.townUi()?.getPendingRestMenuId?.() ?? null;
    getInjuredCount = (): number => this.townUi()?.getInjuredCount?.() ?? 0;
    getInjuryTreatmentPrice = (): number => this.town()?.getInjuryTreatmentPrice() ?? 0;
    getRaidInsurancePrice = (): number => this.town()?.getRaidInsurancePrice() ?? 0;
    hasRaidInsurance = (): boolean => this.town()?.hasRaidInsurance() ?? false;
    isQuestDone = (questId: string): boolean => this.townUi()?.getQuestDone?.(questId) ?? false;
    getMerchantContractViews = (): MerchantContractView[] => this.town()?.getMerchantContractViews() ?? [];
    getBountyContractViews = (): BountyContractView[] => this.town()?.getBountyContractViews() ?? [];

    getShopKind = (): ShopKind => this.shop()?.getActiveKind() ?? 'weapon';
    getShopGold = (): number => this.shop()?.getGoldValue() ?? this.gm.playerData.gold;
    getShopBuyEntries = (): ShopEntry[] => this.shop()?.listBuyEntries() ?? [];
    getShopSellEntries = (): SellEntry[] => this.shop()?.listSellEntries() ?? [];
    getBlacksmithGold = (): number => this.gm.playerData.gold;
    getFacilityUpgradeViews = (): FacilityUpgradeView[] => {
        const town = this.town();
        if (!town) return [];
        return town.getFacilityUpgradeDefinitions().map((definition) => {
            const level = town.getFacilityUpgradeLevel(definition.id);
            const tier = getNextFacilityUpgradeTier(this.gm.playerData.facilityUpgrades, definition.id);
            return {
                definition,
                level,
                nextLevel: tier?.level ?? null,
                goldCost: tier?.gold ?? 0,
                items: (tier?.items ?? []).map((item) => ({
                    ...item,
                    owned: town.countFacilityCostItem(item.itemId),
                })),
                canUpgrade: town.canUpgradeFacility(definition.id),
                maxed: level >= definition.maxLevel,
            };
        });
    };
    getBlacksmithEntries = (): BlacksmithEntry[] => {
        const entries: BlacksmithEntry[] = [];
        for (const character of this.gm.party.getCharacters()) {
            for (const [slot, placed] of character.equipment) {
                this.pushBlacksmithEntry(entries, placed, 'equipment', character.name, slot);
            }
        }
        const townInv = this.getTownInventory();
        if (townInv) {
            this.pushGridBlacksmithEntries(entries, townInv.getBag(), 'backpack', 'blacksmith.source.backpack');
            const ext = townInv.getExternalGrid();
            if (ext) this.pushGridBlacksmithEntries(entries, ext, 'stash', 'blacksmith.source.stash');
        }
        return entries;
    };

    // Town actions
    townSetTab = (tab: TownTab): void => { this.townUi()?.setTab(tab); this.tick(); };
    townDeploy = (): boolean => { const deployed = this.townUi()?.requestDeploy() ?? false; this.tick(); return deployed; };

    shopSetKind = (kind: ShopKind): void => { this.shop()?.setActiveKind(kind); this.tick(); };
    shopBuy = (entry: ShopEntry): boolean => { const ok = this.shop()?.buy(entry) ?? false; this.tick(); return ok; };
    shopSell = (entry: SellEntry): boolean => { const ok = this.shop()?.sell(entry) ?? false; this.tick(); return ok; };
    facilityUpgrade = (id: FacilityUpgradeId): boolean => {
        const ok = this.town()?.upgradeFacility(id) ?? false;
        this.tick();
        return ok;
    };
    completeMerchantContract = (id: string): boolean => {
        const ok = this.town()?.completeMerchantContract(id) ?? false;
        this.tick();
        return ok;
    };
    acceptBountyContract = (id: string): boolean => {
        const ok = this.town()?.acceptBountyContract(id) ?? false;
        this.tick();
        return ok;
    };
    abandonBountyContract = (): boolean => {
        const ok = this.town()?.abandonBountyContract() ?? false;
        this.tick();
        return ok;
    };
    blacksmithRepair = (entry: BlacksmithEntry): boolean => {
        if (this.gm.playerData.gold < entry.repairCost) { this.tick(); return false; }
        const result = repairItem(entry.placed, Number.POSITIVE_INFINITY);
        if (!result.ok) { this.tick(); return false; }
        if (entry.repairCost > 0) this.gm.playerData.spendGold(entry.repairCost);
        this.gm.playerData.save();
        this.tick();
        return true;
    };
    blacksmithUnsocket = (entry: BlacksmithEntry): boolean => {
        if (this.gm.playerData.gold < entry.unsocketCost) { this.tick(); return false; }
        const result = unsocketAll(entry.placed, this.gm.inventory, Number.POSITIVE_INFINITY);
        if (!result.ok) { this.tick(); return false; }
        if (entry.unsocketCost > 0) this.gm.playerData.spendGold(entry.unsocketCost);
        this.gm.playerData.save();
        this.tick();
        return true;
    };

    restPurchase = (menuId: string): boolean => { const ok = this.town()?.purchaseRestMenu(menuId) ?? false; this.tick(); return ok; };
    restTreat = (): boolean => { const ok = this.town()?.treatActivePartyInjuries() ?? false; this.tick(); return ok; };
    buyRaidInsurance = (): boolean => {
        const ok = this.town()?.buyRaidInsurance() ?? false;
        this.tick();
        return ok;
    };

    // ─── Character creation (DOM overlay) ─────────────────────────
    isCharCreateOpen = (): boolean => this.isOverlayOpen('create');
    charCreateComplete = (name: string, classId: string, gender: string): void => {
        this.gm.completeCharacterCreation(name, classId, gender);
        this.tick();
    };

    // ─── Inventory (DOM overlay) ──────────────────────────────────
    /** Standalone world inventory (I/Tab); town storage uses its own instance. */
    isInventoryOpen = (): boolean => this.isOverlayOpen('inventory');
    getWorldInventory = (): InventoryUI => this.gm.inventoryUI;
    getTownInventory = (): InventoryUI | null => this.townUi()?.getInventoryUI() ?? null;
    closeInventory = (): void => { this.gm.closeWorldInventory(); this.tick(); };
    /** Re-render after a direct InventoryUI mutation (drag/drop, equip, sort…). */
    refresh = (): void => {
        if (this.townUi()?.isVisible()) this.gm.persistHubSaveToServer();
        this.tick();
    };

    private pushGridBlacksmithEntries(
        entries: BlacksmithEntry[],
        grid: GridInventory,
        source: BlacksmithEntry['source'],
        sourceLabel: string
    ): void {
        for (const placed of grid.items) {
            this.pushBlacksmithEntry(entries, placed, source, sourceLabel);
        }
    }

    private pushBlacksmithEntry(
        entries: BlacksmithEntry[],
        placed: PlacedItem,
        source: BlacksmithEntry['source'],
        sourceLabel: string,
        slot?: ItemSlot
    ): void {
        const workshopMultiplier = getWorkshopCostMultiplier(this.gm.playerData.facilityUpgrades);
        const repairCost = applyFacilityCostMultiplier(getRepairCost(placed), workshopMultiplier);
        const unsocketCost = applyFacilityCostMultiplier(getUnsocketCost(placed), workshopMultiplier);
        if (repairCost <= 0 && unsocketCost <= 0) return;
        entries.push({
            id: `${source}:${sourceLabel}:${slot ?? 'grid'}:${placed.item.id}:${entries.length}`,
            placed,
            source,
            sourceLabel,
            slot,
            repairCost,
            unsocketCost,
        });
    }
}
