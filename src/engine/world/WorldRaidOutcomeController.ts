import type { PartyManager } from '../../character/PartyManager';
import { Character } from '../../character/Character';
import { getItemDef, type ItemDef } from '../../data/ItemDB';
import type { PlayerData } from '../../data/PlayerData';
import { GridInventory, type PlacedItem } from '../../inventory/GridInventory';
import { getStarterBodyArmorId, STARTER_CONSUMABLE_ITEM_IDS, STARTER_WEAPON_ITEM_ID } from '../../data/StarterKitData';
import { STORY_SCENARIO_EVENT_SEQUENCES } from '../../data/StoryScenarioEventData';
import {
    CAIN_NECKLACE_ITEM_ID,
    isStoryQuestAvailable,
    isStoryRewardOwned,
    MAIN_QUEST_EPISODE_01_ID,
    MAIN_QUEST_EPISODE_02_ID,
    STORY_QUESTS,
    type StoryQuestReward,
} from '../../data/StoryQuestData';
import { BURGOS_CASTLE_DUNGEON_ID } from '../../data/MonsterCatalog';
import { t, formatT, i18n } from '../../i18n/LanguageManager';
import { formatItemName } from '../../i18n/DisplayNames';
import type { TownInfo } from '../../map/BiomeMask';
import {
    computeRaidFailureLoss,
    mergeSnapshots,
    type HeroRaidStatus,
    type RaidOutcome,
    type RaidOutcomeMissionReport,
    type RaidResultType,
    type RaidLossPlan,
    type EquipmentLoss,
    snapshotItem,
    snapshotPlacedItem,
} from '../../raid/RaidOutcome';
import { applyRaidInsurance } from '../../raid/RaidInsurance';
import { RaidResultUI } from '../../ui/RaidResultUI';
import { FIRST_SURVIVAL_GOLD_REWARD, FIRST_SURVIVAL_QUEST_ID } from '../../shared/FirstSurvivalReward';
import type { GameManager } from '../GameManager';
import type { InputManager } from '../InputManager';
import type { WorldPhase, WorldRaidSession } from './WorldRaidSession';
import type { WorldTownSession } from './WorldTownSession';
import type { RaidFailureSummary } from '../../net/WorldProtocol';
import type { BountySettlementSummary } from '../../net/WorldProtocol';
import {
    BOUNTY_PROOF_ITEM_ID,
    isBountyRiskCompleted,
    resolveBountyContract,
} from '../../data/BountyContractData';

function displayTownName(town: TownInfo): string {
    return i18n.lang === 'ko' ? town.nameKr : town.name;
}

function displayItemName(item: ItemDef | undefined, fallback: string): string {
    return item ? formatItemName(item) : fallback;
}

export interface WorldRaidOutcomeContext {
    party: PartyManager;
    playerData: PlayerData;
    gameManager: GameManager;
    raidSession: WorldRaidSession;
    townSession: WorldTownSession;
    getTownById: (townId: string) => TownInfo | null;
    getCurrentHubTown: () => TownInfo;
    resetStoryScenarioStateForRaidEnd: () => void;
    placePartyAtTown: (town: TownInfo) => void;
    openTown: (town: TownInfo) => void;
    setPhase: (phase: WorldPhase) => void;
    log(message: string): void;
}

export interface CompleteSuccessOptions {
    /** Server survival flush already applied gold, story rewards, and raid inventory. */
    serverAuthoritativeRewards?: boolean;
    /**
     * Gold actually granted by the server this raid (measured as the hub-save
     * sync delta). Used only with {@link serverAuthoritativeRewards} so the
     * result screen reports the authoritative total, including the server-side
     * first-survival bonus the client no longer credits.
     */
    displayGoldReward?: number;
    /**
     * Whether the server granted the one-time first-survival bonus this raid.
     * Used only with {@link serverAuthoritativeRewards} to itemize the bonus on
     * the result screen (the client no longer decides this for network raids).
     */
    firstSurvivalBonus?: boolean;
    bounty?: BountySettlementSummary;
}

export interface CompleteFailureOptions {
    /**
     * The world server has already committed the failed raid state and the
     * client has reloaded it. Do not apply the local-only loss/recovery pass a
     * second time, or the next hub save will look like free item creation.
     */
    serverAuthoritativeState?: boolean;
    serverFailure?: RaidFailureSummary;
}

export class WorldRaidOutcomeController {
    private readonly context: WorldRaidOutcomeContext;
    private readonly raidResultUI = new RaidResultUI();

    constructor(context: WorldRaidOutcomeContext) {
        this.context = context;
        this.raidResultUI.onClose = () => this.openPendingTownAfterResult();
    }

    public isVisible(): boolean {
        return this.raidResultUI.isVisible();
    }

    public updateInput(input: InputManager): void {
        this.raidResultUI.updateInput(input);
    }

    public render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        this.raidResultUI.render(ctx, width, height);
    }

    public close(): void {
        this.raidResultUI.hide();
    }

    public completeSuccess(destination: TownInfo, options: CompleteSuccessOptions = {}): void {
        const raidSession = this.context.raidSession;
        if (!raidSession.active) return;

        const serverRewards = options.serverAuthoritativeRewards === true;
        const heroStatuses = this.createHeroStatuses();
        const questRewards: string[] = [];
        if (!serverRewards) questRewards.push(...this.settleLocalBounty());
        if (serverRewards && options.bounty) {
            questRewards.push(formatT('bounty.completed', { gold: options.bounty.baseReward }));
            questRewards.push(options.bounty.riskCompleted
                ? formatT('bounty.bonusCompleted', { gold: options.bounty.bonusReward })
                : t('bounty.bonusFailed'));
        }
        const secured = serverRewards ? this.snapshotRaidLootForDisplay() : this.secureRaidLoot();
        const episode1WasCleared = this.context.playerData.isCleared(MAIN_QUEST_EPISODE_01_ID);
        const burgosObjectiveCleared = raidSession.isDungeonCleared(BURGOS_CASTLE_DUNGEON_ID);
        const raidGoldReward = raidSession.consumeRaidGoldReward();
        if (!serverRewards && raidGoldReward > 0) {
            this.context.playerData.addGold(raidGoldReward);
        }
        let goldReward = serverRewards && options.displayGoldReward !== undefined
            ? options.displayGoldReward
            : raidGoldReward;

        if (!serverRewards && !this.context.playerData.isCleared(FIRST_SURVIVAL_QUEST_ID)) {
            this.context.playerData.markCleared(FIRST_SURVIVAL_QUEST_ID);
            this.context.playerData.addGold(FIRST_SURVIVAL_GOLD_REWARD);
            goldReward += FIRST_SURVIVAL_GOLD_REWARD;
            questRewards.push(formatT('raid.outcome.firstSurvivalQuest', { completed: t('quest.completed') }));
        }
        if (serverRewards && options.firstSurvivalBonus) {
            questRewards.push(formatT('raid.outcome.firstSurvivalQuest', { completed: t('quest.completed') }));
        }
        if (this.context.playerData.raidInsuranceActive) {
            this.context.playerData.raidInsuranceActive = false;
        }
        if (!serverRewards) {
            questRewards.push(...this.completeScenarioRuntimeQuestItems());
            questRewards.push(...this.completeStoryQuestRewards());
        }
        const missionReport = this.createMissionReport({
            episode1WasCleared,
            burgosObjectiveCleared,
        });

        raidSession.completeAtTown(destination.id);
        this.context.playerData.currentHubTownId = destination.id;
        this.context.townSession.clearRestStatusesFromParty();
        this.context.townSession.applyRaidInjuries(raidSession.downedCharacterIds);
        if (!serverRewards) this.context.playerData.save();
        this.context.party.resetForNewRaid();
        this.context.resetStoryScenarioStateForRaidEnd();
        this.context.placePartyAtTown(destination);

        const outcome: RaidOutcome = {
            result: 'SURVIVED',
            elapsedSeconds: raidSession.elapsedSeconds,
            kills: raidSession.kills,
            departureTownId: raidSession.departureTownId,
            extractionTownId: destination.id,
            heroStatuses,
            looted: secured,
            secured,
            lost: [],
            equipmentLost: [],
            goldReward,
            questRewards,
            missionReport,
        };
        this.showRaidResult(outcome, destination);
        this.context.log(formatT('raid.outcome.survivedLog', { town: displayTownName(destination) }));
    }

    private settleLocalBounty(): string[] {
        const contract = resolveBountyContract(this.context.playerData.activeBountyContractId);
        if (!contract) return [];
        const bag = this.context.gameManager.inventory;
        const proof = bag.items.find((placed) => (
            placed.item.id === BOUNTY_PROOF_ITEM_ID && placed.acquiredInRaid === true
        ));
        if (!proof) return [];
        bag.remove(proof);
        const riskCompleted = isBountyRiskCompleted(contract, {
            elapsedSeconds: this.context.raidSession.elapsedSeconds,
            hadActorDown: this.context.raidSession.downedCharacterIds.size > 0,
            killsIncludingTarget: this.context.raidSession.kills,
        });
        this.context.raidSession.addRaidGoldReward(
            contract.rewardGold + (riskCompleted ? contract.bonusGold : 0),
        );
        this.context.playerData.activeBountyContractId = null;
        return [
            formatT('bounty.completed', { gold: contract.rewardGold }),
            riskCompleted
                ? formatT('bounty.bonusCompleted', { gold: contract.bonusGold })
                : t('bounty.bonusFailed'),
        ];
    }

    public completeFailure(
        result: Exclude<RaidResultType, 'SURVIVED'>,
        options: CompleteFailureOptions = {},
    ): void {
        const raidSession = this.context.raidSession;
        if (!raidSession.active) return;

        const heroStatuses = this.createHeroStatuses();
        const serverAuthoritativeState = options.serverAuthoritativeState === true;
        const insuranceActive = !serverAuthoritativeState && this.context.playerData.raidInsuranceActive;
        const insurance = serverAuthoritativeState
            ? this.mapServerFailure(options.serverFailure)
            : applyRaidInsurance(
                computeRaidFailureLoss(this.context.gameManager.inventory.items, this.context.party.getCharacters()),
                insuranceActive
            );
        const loss = insurance.loss;
        let recoveryNotes: string[] = [];
        if (!serverAuthoritativeState) {
            if (insuranceActive) this.context.playerData.raidInsuranceActive = false;
            this.context.gameManager.inventory.clear();
            for (const lost of loss.equipmentLost) {
                const character = this.context.party.getCharacters().find((candidate) => candidate.id === lost.characterId);
                character?.unequip(lost.slot);
            }
            recoveryNotes = this.applyRaidFailureRecoveryKit();
        } else if (options.serverFailure && (options.serverFailure.recoveryEquipped > 0 || options.serverFailure.recoveryBackpack > 0)) {
            recoveryNotes = [formatT('raid.outcome.recoveryKit', {
                equipped: options.serverFailure.recoveryEquipped,
                backpack: options.serverFailure.recoveryBackpack,
            })];
        }

        const returnTown = this.context.getTownById(raidSession.departureTownId) ?? this.context.getCurrentHubTown();
        raidSession.failBackToTown(returnTown.id);
        this.context.playerData.currentHubTownId = returnTown.id;
        this.context.townSession.clearRestStatusesFromParty();
        this.context.townSession.applyRaidInjuries(raidSession.downedCharacterIds);
        if (!serverAuthoritativeState) this.context.playerData.save();
        this.context.party.resetForNewRaid();
        this.context.resetStoryScenarioStateForRaidEnd();
        this.context.placePartyAtTown(returnTown);

        const outcome: RaidOutcome = {
            result,
            elapsedSeconds: raidSession.elapsedSeconds,
            kills: raidSession.kills,
            departureTownId: raidSession.departureTownId,
            extractionTownId: returnTown.id,
            heroStatuses,
            looted: [],
            secured: [],
            lost: mergeSnapshots(loss.backpackLost),
            equipmentLost: loss.equipmentLost,
            notes: [
                result === 'MIA' ? t('raid.outcome.miaNote') : t('raid.outcome.deadNote'),
                ...(serverAuthoritativeState ? [t('raid.outcome.serverFailureState')] : []),
                ...(insurance.protectedEquipment
                    ? [formatT('insurance.protectedNote', {
                        character: insurance.protectedEquipment.characterName,
                        item: displayItemName(getItemDef(insurance.protectedEquipment.item.id), insurance.protectedEquipment.item.id),
                    })]
                    : insuranceActive ? [t('insurance.noEquipmentProtected')] : []),
                ...recoveryNotes,
            ],
        };
        this.showRaidResult(outcome, returnTown);
        this.context.log(result === 'MIA' ? t('raid.outcome.miaLog') : t('raid.outcome.deadLog'));
        if (recoveryNotes.length > 0) this.context.log(t('raid.outcome.recoveryGranted'));
    }

    private mapServerFailure(summary?: RaidFailureSummary): { loss: RaidLossPlan; protectedEquipment: EquipmentLoss | null } {
        if (!summary) return { loss: { backpackLost: [], equipmentLost: [] }, protectedEquipment: null };
        const equipmentLost = summary.equipmentLost.flatMap((entry): EquipmentLoss[] => {
            const item = getItemDef(entry.itemId);
            return item ? [{
                characterId: entry.characterId,
                characterName: entry.characterName,
                slot: entry.slot,
                item: snapshotItem(item, entry.quantity),
            }] : [];
        });
        const protectedEquipment = summary.protectedEquipment
            ? (() => {
                const item = getItemDef(summary.protectedEquipment.itemId);
                return item ? {
                    characterId: summary.protectedEquipment.characterId,
                    characterName: summary.protectedEquipment.characterName,
                    slot: summary.protectedEquipment.slot,
                    item: snapshotItem(item, summary.protectedEquipment.quantity),
                } : null;
            })()
            : null;
        return {
            loss: {
                backpackLost: summary.backpackLost.flatMap((entry) => {
                    const item = getItemDef(entry.itemId);
                    return item ? [snapshotItem(item, entry.quantity)] : [];
                }),
                equipmentLost,
            },
            protectedEquipment,
        };
    }

    private applyRaidFailureRecoveryKit(): string[] {
        let equippedCount = 0;
        for (const character of this.context.party.getCharacters()) {
            equippedCount += this.equipRecoveryItemIfEmpty(character, STARTER_WEAPON_ITEM_ID) ? 1 : 0;
            equippedCount += this.equipRecoveryItemIfEmpty(character, this.getRecoveryBodyArmorId(character)) ? 1 : 0;
        }

        let backpackCount = 0;
        for (const itemId of STARTER_CONSUMABLE_ITEM_IDS) {
            const item = getItemDef(itemId);
            if (item && this.context.gameManager.inventory.autoPlace(item)) backpackCount += 1;
        }

        if (equippedCount === 0 && backpackCount === 0) return [];
        return [formatT('raid.outcome.recoveryKit', { equipped: equippedCount, backpack: backpackCount })];
    }

    private equipRecoveryItemIfEmpty(character: Character, itemId: string): boolean {
        const item = getItemDef(itemId);
        if (!item || item.slot === 'consumable' || character.equipment.has(item.slot)) return false;
        character.equip(this.createRecoveryPlacedItem(item));
        return true;
    }

    private getRecoveryBodyArmorId(character: Character): string {
        return getStarterBodyArmorId(character.classLineId);
    }

    private createRecoveryPlacedItem(item: ItemDef): PlacedItem {
        return {
            item,
            gridX: 0,
            gridY: 0,
            durability: item.maxDurability,
            quantity: 1,
        };
    }

    private completeStoryQuestRewards(): string[] {
        const rewards: string[] = [];
        for (const quest of STORY_QUESTS) {
            if (!this.context.raidSession.isDungeonCleared(quest.dungeonId)) continue;
            if (this.context.playerData.isCleared(quest.id)) continue;
            if (!isStoryQuestAvailable(quest, this.context.playerData)) continue;

            if (!this.canStoreStoryQuestReward(quest.reward)) {
                rewards.push(`${t('quest.rewardStorageFull')}: ${t(quest.titleKey)}`);
                continue;
            }
            const rewardLine = this.grantStoryQuestReward(quest.reward);
            if (!isStoryRewardOwned(quest.reward, this.context.playerData)) {
                rewards.push(`${t('quest.rewardStorageFull')}: ${t(quest.titleKey)}`);
                continue;
            }
            this.context.playerData.markCleared(quest.id);
            rewards.push(`${t('quest.completed')}: ${t(quest.titleKey)}`);
            rewards.push(rewardLine);
        }
        return rewards;
    }

    private completeScenarioRuntimeQuestItems(): string[] {
        const rewards: string[] = [];
        for (const sequence of STORY_SCENARIO_EVENT_SEQUENCES) {
            const quest = STORY_QUESTS.find((candidate) => candidate.dungeonId === sequence.dungeonId);
            if (quest && !isStoryQuestAvailable(quest, this.context.playerData)) continue;
            for (const event of sequence.fieldEvents) {
                if (!event.runtimeFlag || !event.questItemId) continue;
                if (!this.context.raidSession.hasScenarioFlag(sequence.dungeonId, event.runtimeFlag)) continue;
                if (this.context.playerData.hasQuestItem(event.questItemId)) continue;

                this.context.playerData.addQuestItem(event.questItemId);
                const item = getItemDef(event.questItemId);
                rewards.push(`${t('quest.rewardItem')}: ${displayItemName(item, event.questItemId)}`);
            }
        }
        return rewards;
    }

    private createMissionReport(options: {
        episode1WasCleared: boolean;
        burgosObjectiveCleared: boolean;
    }): RaidOutcomeMissionReport | undefined {
        if (options.episode1WasCleared || !options.burgosObjectiveCleared) return undefined;
        if (!this.context.playerData.isCleared(MAIN_QUEST_EPISODE_01_ID)) return undefined;

        const cainRecovered = this.context.playerData.hasQuestItem(CAIN_NECKLACE_ITEM_ID)
            || this.context.raidSession.hasScenarioFlag(BURGOS_CASTLE_DUNGEON_ID, 'cain_necklace');
        const nextQuest = STORY_QUESTS.find((quest) => quest.id === MAIN_QUEST_EPISODE_02_ID);
        const nextQuestTitle = nextQuest ? t(nextQuest.titleKey) : t('quest.journal');

        return {
            title: t('raid.result.operationReport'),
            lines: [
                { text: t('raid.result.ep01.mainObjectiveComplete'), kind: 'success' },
                {
                    text: cainRecovered
                        ? t('raid.result.ep01.sideObjectiveComplete')
                        : t('raid.result.ep01.sideObjectiveMissed'),
                    kind: cainRecovered ? 'success' : 'missed',
                },
                {
                    text: formatT('raid.result.ep01.nextAction', { quest: nextQuestTitle }),
                    kind: 'next',
                },
            ],
        };
    }

    private grantStoryQuestReward(reward: StoryQuestReward): string {
        if (reward.type === 'none') {
            return t('quest.rewardNone');
        }

        if (reward.type === 'bundle') {
            return reward.rewards.map((entry) => this.grantStoryQuestReward(entry)).join(' / ');
        }

        if (reward.type === 'questItem') {
            if (!this.context.playerData.hasQuestItem(reward.itemId)) {
                this.context.playerData.addQuestItem(reward.itemId);
            }
            const rewardItem = getItemDef(reward.itemId);
            return `${t('quest.rewardItem')}: ${displayItemName(rewardItem, reward.itemId)}`;
        }

        if (reward.type === 'inventoryItem') {
            if (!this.context.playerData.hasQuestItem(reward.itemId)) {
                const rewardItem = getItemDef(reward.itemId);
                if (rewardItem) {
                    const placed = this.placeStoryInventoryReward(rewardItem);
                    if (placed) this.context.playerData.addQuestItem(reward.itemId);
                }
            }
            const rewardItem = getItemDef(reward.itemId);
            return `${t('quest.rewardItem')}: ${displayItemName(rewardItem, reward.itemId)}`;
        }

        if (!this.context.playerData.hasStoryCompanion(reward.companionId)) {
            this.context.playerData.addStoryCompanion(reward.companionId);
        }
        if (!this.context.party.getRoster().some((character) => character.id === reward.companionId)) {
            this.context.party.addToRoster(new Character(reward.companionId, t(reward.nameKey), reward.classId));
        }
        return `${t('quest.rewardCompanion')}: ${t(reward.nameKey)}`;
    }

    private canStoreStoryQuestReward(reward: StoryQuestReward): boolean {
        if (reward.type === 'none' || reward.type === 'questItem' || reward.type === 'companion') return true;
        if (reward.type === 'bundle') return reward.rewards.every((entry) => this.canStoreStoryQuestReward(entry));
        if (this.context.playerData.hasQuestItem(reward.itemId)) return true;
        const rewardItem = getItemDef(reward.itemId);
        return rewardItem ? this.canPlaceStoryInventoryReward(rewardItem) : false;
    }

    private canPlaceStoryInventoryReward(item: ItemDef): boolean {
        return canAutoPlaceItem(this.context.gameManager.inventory, item)
            || canAutoPlaceItem(this.context.gameManager.stash, item);
    }

    private placeStoryInventoryReward(item: ItemDef): PlacedItem | null {
        const backpackPlaced = this.context.gameManager.inventory.autoPlace(item);
        if (backpackPlaced) return backpackPlaced;
        const stashPlaced = this.context.gameManager.stash.autoPlace(item);
        if (stashPlaced) return stashPlaced;

        this.context.gameManager.inventory.sort();
        const sortedBackpackPlaced = this.context.gameManager.inventory.autoPlace(item);
        if (sortedBackpackPlaced) return sortedBackpackPlaced;
        this.context.gameManager.stash.sort();
        return this.context.gameManager.stash.autoPlace(item);
    }

    private showRaidResult(outcome: RaidOutcome, nextTown: TownInfo): void {
        this.context.setPhase('lobby');
        this.context.raidSession.setPendingTownAfterResult(nextTown.id);
        this.context.townSession.hide();
        this.raidResultUI.show(outcome);
    }

    private openPendingTownAfterResult(): void {
        const nextTown = this.context.getTownById(this.context.raidSession.consumePendingTownAfterResultId() ?? '')
            ?? this.context.getCurrentHubTown();
        this.context.openTown(nextTown);
    }

    private createHeroStatuses(): HeroRaidStatus[] {
        return this.context.party.getCharacters().map((character) => ({
            characterId: character.id,
            characterName: character.name,
            hp: character.stats.hp,
            maxHp: character.stats.maxHp,
            isDead: character.isDead || character.stats.hp <= 0,
        }));
    }

    private secureRaidLoot() {
        const backpackSecured = [...this.context.gameManager.inventory.items].filter((placed) => placed.acquiredInRaid);
        const equippedSecured = this.context.party.getCharacters().flatMap((character) =>
            [...character.equipment.values()].filter((placed) => placed.acquiredInRaid)
        );
        const secured = mergeSnapshots([...backpackSecured, ...equippedSecured].map(snapshotPlacedItem));

        for (const placed of backpackSecured) {
            const moved = this.context.gameManager.stash.autoPlace(placed.item);
            if (moved) {
                moved.durability = placed.durability;
                moved.quantity = placed.quantity;
                moved.sockets = placed.sockets;
                moved.acquiredInRaid = false;
                this.context.gameManager.inventory.remove(placed);
            } else {
                placed.acquiredInRaid = false;
            }
        }
        for (const placed of equippedSecured) {
            placed.acquiredInRaid = false;
        }

        return secured;
    }

    /** Display-only loot snapshot after server sync; do not move items locally. */
    private snapshotRaidLootForDisplay() {
        const backpackSecured = [...this.context.gameManager.inventory.items].filter((placed) => placed.acquiredInRaid);
        const equippedSecured = this.context.party.getCharacters().flatMap((character) =>
            [...character.equipment.values()].filter((placed) => placed.acquiredInRaid)
        );
        return mergeSnapshots([...backpackSecured, ...equippedSecured].map(snapshotPlacedItem));
    }
}

function canAutoPlaceItem(grid: GridInventory, item: ItemDef): boolean {
    if (hasFreeSlotForItem(grid, item)) return true;
    const sorted = cloneGridInventory(grid);
    sorted.sort();
    return hasFreeSlotForItem(sorted, item);
}

function hasFreeSlotForItem(grid: GridInventory, item: ItemDef): boolean {
    for (let y = 0; y <= grid.height - item.gridH; y++) {
        for (let x = 0; x <= grid.width - item.gridW; x++) {
            if (grid.canPlace(item, x, y)) return true;
        }
    }
    return false;
}

function cloneGridInventory(grid: GridInventory): GridInventory {
    const clone = new GridInventory(grid.width, grid.height);
    for (const placed of grid.items) {
        clone.place(placed.item, placed.gridX, placed.gridY);
    }
    return clone;
}
