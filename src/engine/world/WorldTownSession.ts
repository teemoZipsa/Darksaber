import { formatT, t } from '../../i18n/LanguageManager';
import type { PartyManager } from '../../character/PartyManager';
import type { PlayerData } from '../../data/PlayerData';
import { HybridMarketService } from '../../data/HybridMarketService';
import type { MarketService } from '../../data/MarketService';
import { getRestMenu, INJURY_TREATMENT_PRICE, type RestMenu } from '../../data/RestFacilityData';
import {
    FACILITY_UPGRADES,
    applyFacilityCostMultiplier,
    getFacilityUpgradeLevel,
    getInjuryTreatmentCostMultiplier,
    getNextFacilityUpgradeTier,
    type FacilityUpgradeDefinition,
    type FacilityUpgradeId,
} from '../../data/FacilityUpgradeData';
import { getSellPrice as getBaseSellPrice } from '../../data/ShopData';
import type { GameManager } from '../GameManager';
import type { InputManager } from '../InputManager';
import type { PlacedItem } from '../../inventory/GridInventory';
import type { TownInfo } from '../../map/BiomeMask';
import { TownUI } from '../../ui/TownUI';
import {
    advanceTimedStatuses,
    applyStatusToCarrier,
    applyStatusesToCarrier,
    createStatus,
    getEffectiveStatsForCharacter,
    hasStatus,
    removeRestStatusesFromCarrier,
    removeStatusesFromCarrier,
    type StatusEffect,
} from '../../combat/StatusEffects';

type WorldTownSessionGameManager = Pick<GameManager, 'inventory' | 'stash'>;
type FacilityInventoryGrid = { items: PlacedItem[]; remove: (placed: PlacedItem) => void };

export interface WorldTownSessionOptions {
    party: PartyManager;
    playerData: PlayerData;
    gameManager: WorldTownSessionGameManager;
    useServerMarket?: boolean;
    onDeploy: () => void;
    log: (message: string) => void;
}

export class WorldTownSession {
    public readonly ui: TownUI;
    private readonly party: PartyManager;
    private readonly playerData: PlayerData;
    private readonly gameManager: WorldTownSessionGameManager;
    private readonly marketService: MarketService;
    private readonly log: (message: string) => void;

    constructor(options: WorldTownSessionOptions) {
        this.party = options.party;
        this.playerData = options.playerData;
        this.gameManager = options.gameManager;
        this.marketService = new HybridMarketService(this.playerData, { useServerMarket: options.useServerMarket });
        this.log = options.log;
        this.ui = new TownUI(this.gameManager.inventory, this.gameManager.stash);
        this.configureTownUI(options.onDeploy);
    }

    public isVisible(): boolean {
        return this.ui.isVisible();
    }

    public show(town: TownInfo): void {
        this.applyPendingRestPreview();
        this.marketService.rollTownVisit(town.id);
        this.ui.show(town);
    }

    public hide(): void {
        this.ui.hide();
    }

    public setDeployError(message: string | null): void {
        this.ui.setDeployError(message);
    }

    public sync(): void {
        this.ui.playerGold = this.playerData.gold;
        const active = this.party.getActive();
        if (active) this.ui.setActiveCharacter(active);
    }

    public updateInput(input: InputManager): void {
        this.ui.updateInput(input);
    }

    public render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        this.ui.render(ctx, width, height);
    }

    public purchaseRestMenu(menuId: string): boolean {
        const menu = getRestMenu(menuId);
        if (!menu) return false;
        if (!this.playerData.spendGold(menu.price)) {
            this.log(t('rest.noGold'));
            return false;
        }

        for (const character of this.party.getCharacters()) {
            removeRestStatusesFromCarrier(character);
            applyStatusesToCarrier(character, this.createRestStatuses(menu, 'immediate'));
        }
        this.playerData.pendingRestMenuId = menu.id;
        this.playerData.save();
        this.log(formatT('town.log.restReserved', { menu: t(menu.nameKey) }));
        return true;
    }

    public treatActivePartyInjuries(): boolean {
        const injured = this.party.getCharacters().filter((character) => hasStatus(character.statuses, 'injury'));
        if (injured.length === 0) return false;

        const price = injured.length * this.getInjuryTreatmentPrice();
        if (!this.playerData.spendGold(price)) {
            this.log(t('rest.noGold'));
            return false;
        }

        for (const character of injured) {
            removeStatusesFromCarrier(character, (status) => status.kind === 'injury');
        }
        this.playerData.save();
        this.log(`${t('rest.treated')} -${price}G`);
        return true;
    }

    public getActivePartyInjuryCount(): number {
        return this.party.getCharacters().filter((character) => hasStatus(character.statuses, 'injury')).length;
    }

    public getInjuryTreatmentPrice(): number {
        return applyFacilityCostMultiplier(
            INJURY_TREATMENT_PRICE,
            getInjuryTreatmentCostMultiplier(this.playerData.facilityUpgrades)
        );
    }

    public getFacilityUpgradeDefinitions(): FacilityUpgradeDefinition[] {
        return Object.values(FACILITY_UPGRADES);
    }

    public getFacilityUpgradeLevel(id: FacilityUpgradeId): number {
        return getFacilityUpgradeLevel(this.playerData.facilityUpgrades, id);
    }

    public canUpgradeFacility(id: FacilityUpgradeId): boolean {
        const tier = getNextFacilityUpgradeTier(this.playerData.facilityUpgrades, id);
        if (!tier) return false;
        if (this.playerData.gold < tier.gold) return false;
        return tier.items.every((cost) => this.countTownItem(cost.itemId) >= cost.quantity);
    }

    public upgradeFacility(id: FacilityUpgradeId): boolean {
        const tier = getNextFacilityUpgradeTier(this.playerData.facilityUpgrades, id);
        if (!tier) return false;
        if (!this.canUpgradeFacility(id)) {
            this.log(t('facility.noMaterials'));
            return false;
        }

        if (!this.playerData.spendGold(tier.gold)) {
            this.log(t('town.log.noGold'));
            return false;
        }
        for (const cost of tier.items) this.consumeTownItem(cost.itemId, cost.quantity);
        this.playerData.facilityUpgrades[id] = tier.level;
        this.playerData.save();
        this.log(formatT('facility.upgradedLog', { facility: t(FACILITY_UPGRADES[id].nameKey), level: tier.level }));
        return true;
    }

    public countFacilityCostItem(itemId: string): number {
        return this.countTownItem(itemId);
    }

    public applyPendingRestPreview(): void {
        const menu = this.playerData.pendingRestMenuId ? getRestMenu(this.playerData.pendingRestMenuId) : null;
        for (const character of this.party.getCharacters()) {
            removeRestStatusesFromCarrier(character);
            if (menu) applyStatusesToCarrier(character, this.createRestStatuses(menu, 'immediate'));
        }
    }

    public applyPendingRestForRaidStart(): void {
        const menu = this.playerData.pendingRestMenuId ? getRestMenu(this.playerData.pendingRestMenuId) : null;
        for (const character of this.party.getCharacters()) {
            removeRestStatusesFromCarrier(character);
            if (menu) applyStatusesToCarrier(character, this.createRestStatuses(menu));
        }
        if (menu) {
            this.log(formatT('town.log.restApplied', { menu: t(menu.nameKey) }));
            this.playerData.pendingRestMenuId = null;
            this.playerData.save();
        }
    }

    public clearRestStatusesFromParty(): void {
        for (const character of this.party.getCharacters()) {
            removeRestStatusesFromCarrier(character);
        }
    }

    public applyRaidInjuries(downedCharacterIds: Set<string>): void {
        for (const character of this.party.getCharacters()) {
            if (!downedCharacterIds.has(character.id)) continue;
            applyStatusToCarrier(character, createStatus('injury', {
                icon: '✚',
                magnitude: 0.9,
                sourceType: 'injury',
                activation: 'immediate',
            }));
        }
    }

    public advancePartyTimedRestStatuses(dt: number): void {
        for (const character of this.party.getCharacters()) {
            const before = character.statuses?.length ?? 0;
            character.statuses = advanceTimedStatuses(character.statuses, dt);
            if ((character.statuses?.length ?? 0) !== before) {
                const effective = getEffectiveStatsForCharacter(character);
                character.stats.hp = Math.min(character.stats.hp, effective.maxHp);
                character.stats.mp = Math.min(character.stats.mp, effective.maxMp);
            }
        }
    }

    private configureTownUI(onDeploy: () => void): void {
        this.ui.getQuestDone = (questId) => this.playerData.isCleared(questId);
        this.ui.getMarketRumor = (townId) => this.marketService.getMarketRumor(townId);
        this.ui.onDeploy(onDeploy);
        this.ui.getShopUI().getGold = () => this.playerData.gold;
        this.ui.getShopUI().getBuyPrice = (item, shopItem, townId) => this.marketService.getBuyPrice(item, shopItem.buyPrice, townId);
        this.ui.getShopUI().getSellPriceForItem = (placed, _source, townId) => {
            const basePrice = getBaseSellPrice(placed.item, townId ?? undefined);
            return this.marketService.getSellPrice(placed.item, basePrice, townId);
        };
        this.ui.getShopUI().getSellQuoteForItem = (placed, _source, townId, quantity) => {
            const basePrice = getBaseSellPrice(placed.item, townId ?? undefined);
            return this.marketService.getSellQuote(placed.item, basePrice, townId, quantity);
        };
        this.ui.getShopUI().onBuy = (item, price) => {
            if (!this.playerData.spendGold(price)) {
                this.log(t('town.log.noGold'));
                return false;
            }
            const placed = this.gameManager.inventory.autoPlace(item);
            if (!placed) {
                this.playerData.addGold(price);
                this.log(t('town.log.inventoryFull'));
                return false;
            }
            this.marketService.recordBuy(this.ui.getCurrentTown()?.id, item.id);
            this.playerData.save();
            this.log(formatT('town.log.itemBought', { item: item.nameKr }));
            return true;
        };
        this.ui.getShopUI().onSell = (placed, sourceGrid, price) => {
            if (!sourceGrid.items.includes(placed)) return false;
            const quantity = Math.max(1, placed.quantity);
            sourceGrid.remove(placed);
            this.playerData.addGold(price);
            this.marketService.recordSell(this.ui.getCurrentTown()?.id, placed.item.id, quantity);
            this.playerData.save();
            this.log(formatT('town.log.itemSold', { item: placed.item.nameKr, price }));
            return true;
        };
        this.ui.getPendingRestMenuId = () => this.playerData.pendingRestMenuId;
        this.ui.getInjuredCount = () => this.getActivePartyInjuryCount();
        this.ui.onPurchaseRestMenu = (menuId) => this.purchaseRestMenu(menuId);
        this.ui.onTreatInjuries = () => this.treatActivePartyInjuries();
    }

    private createRestStatuses(menu: RestMenu, activation?: 'immediate' | 'on_raid_start'): StatusEffect[] {
        return menu.buffs
            .filter((buff) => !activation || buff.activation === activation)
            .map((buff) => createStatus(buff.kind, {
                icon: buff.icon,
                magnitude: buff.magnitude,
                activation: buff.activation,
                durationSeconds: buff.durationSeconds,
                remainingSeconds: buff.activation === 'on_raid_start' ? buff.durationSeconds : undefined,
                sourceType: 'rest',
                sourceRestMenuId: menu.id,
            }));
    }

    private countTownItem(itemId: string): number {
        return countItemInGrid(this.gameManager.inventory, itemId) + countItemInGrid(this.gameManager.stash, itemId);
    }

    private consumeTownItem(itemId: string, quantity: number): void {
        let remaining = Math.max(0, Math.floor(quantity));
        remaining = consumeItemFromGrid(this.gameManager.inventory, itemId, remaining);
        consumeItemFromGrid(this.gameManager.stash, itemId, remaining);
    }
}

function countItemInGrid(grid: FacilityInventoryGrid, itemId: string): number {
    return grid.items
        .filter((placed) => placed.item.id === itemId)
        .reduce((sum, placed) => sum + Math.max(1, Math.floor(placed.quantity)), 0);
}

function consumeItemFromGrid(
    grid: FacilityInventoryGrid,
    itemId: string,
    quantity: number
): number {
    let remaining = Math.max(0, Math.floor(quantity));
    for (const placed of [...grid.items]) {
        if (remaining <= 0) break;
        if (placed.item.id !== itemId) continue;
        const stack = Math.max(1, Math.floor(placed.quantity));
        const take = Math.min(stack, remaining);
        placed.quantity = stack - take;
        remaining -= take;
        if (placed.quantity <= 0) grid.remove(placed);
    }
    return remaining;
}
