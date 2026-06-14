import type { PartyManager } from '../../character/PartyManager';
import { Character } from '../../character/Character';
import { getItemDef, type ItemDef } from '../../data/ItemDB';
import type { PlayerData } from '../../data/PlayerData';
import { GridInventory, type PlacedItem } from '../../inventory/GridInventory';
import { getStarterBodyArmorId, STARTER_CONSUMABLE_ITEM_IDS, STARTER_WEAPON_ITEM_ID } from '../../data/StarterKitData';
import { STORY_SCENARIO_EVENT_SEQUENCES } from '../../data/StoryScenarioEventData';
import {
    isStoryQuestAvailable,
    isStoryRewardOwned,
    STORY_QUESTS,
    type StoryQuestReward,
} from '../../data/StoryQuestData';
import { t } from '../../i18n/LanguageManager';
import type { TownInfo } from '../../map/BiomeMask';
import {
    computeRaidFailureLoss,
    mergeSnapshots,
    type HeroRaidStatus,
    type RaidOutcome,
    type RaidResultType,
    snapshotPlacedItem,
} from '../../raid/RaidOutcome';
import { RaidResultUI } from '../../ui/RaidResultUI';
import type { GameManager } from '../GameManager';
import type { InputManager } from '../InputManager';
import type { WorldPhase, WorldRaidSession } from './WorldRaidSession';
import type { WorldTownSession } from './WorldTownSession';

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

    public completeSuccess(destination: TownInfo): void {
        const raidSession = this.context.raidSession;
        if (!raidSession.active) return;

        const heroStatuses = this.createHeroStatuses();
        const secured = this.secureRaidLoot();
        const questRewards: string[] = [];
        const raidGoldReward = raidSession.consumeRaidGoldReward();
        if (raidGoldReward > 0) this.context.playerData.addGold(raidGoldReward);
        let goldReward = raidGoldReward;

        if (!this.context.playerData.isCleared('quest:first_survival')) {
            this.context.playerData.markCleared('quest:first_survival');
            this.context.playerData.addGold(200);
            goldReward += 200;
            questRewards.push('퀘스트 완료: 첫 생환');
        }
        questRewards.push(...this.completeScenarioRuntimeQuestItems());
        questRewards.push(...this.completeStoryQuestRewards());

        raidSession.completeAtTown(destination.id);
        this.context.playerData.currentHubTownId = destination.id;
        this.context.playerData.save();

        this.context.townSession.clearRestStatusesFromParty();
        this.context.townSession.applyRaidInjuries(raidSession.downedCharacterIds);
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
            notes: ['전리품과 창고는 현재 세션에서만 유지됩니다.'],
        };
        this.showRaidResult(outcome, destination);
        this.context.log(`${destination.nameKr} 생환 성공.`);
    }

    public completeFailure(result: Exclude<RaidResultType, 'SURVIVED'>): void {
        const raidSession = this.context.raidSession;
        if (!raidSession.active) return;

        const heroStatuses = this.createHeroStatuses();
        const loss = computeRaidFailureLoss(this.context.gameManager.inventory.items, this.context.party.getCharacters());
        this.context.gameManager.inventory.clear();
        for (const lost of loss.equipmentLost) {
            const character = this.context.party.getCharacters().find((candidate) => candidate.id === lost.characterId);
            character?.unequip(lost.slot);
        }
        const recoveryNotes = this.applyRaidFailureRecoveryKit();

        const returnTown = this.context.getTownById(raidSession.departureTownId) ?? this.context.getCurrentHubTown();
        raidSession.failBackToTown(returnTown.id);
        this.context.playerData.currentHubTownId = returnTown.id;
        this.context.playerData.save();

        this.context.townSession.clearRestStatusesFromParty();
        this.context.townSession.applyRaidInjuries(raidSession.downedCharacterIds);
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
                result === 'MIA' ? '시간 초과로 실종 처리되었습니다.' : '출격조가 전멸했습니다.',
                ...recoveryNotes,
            ],
        };
        this.showRaidResult(outcome, returnTown);
        this.context.log(result === 'MIA' ? '시간 초과. 손실이 적용되었습니다.' : '전멸. 손실이 적용되었습니다.');
        if (recoveryNotes.length > 0) this.context.log('기본 보급품을 지급했습니다.');
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
        return [`기본 보급품 지급: 장비 ${equippedCount}개, 소모품 ${backpackCount}개`];
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
                rewards.push(`${t('quest.rewardItem')}: ${item?.nameKr ?? event.questItemId}`);
            }
        }
        return rewards;
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
            return `${t('quest.rewardItem')}: ${rewardItem?.nameKr ?? reward.itemId}`;
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
            return `${t('quest.rewardItem')}: ${rewardItem?.nameKr ?? reward.itemId}`;
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
