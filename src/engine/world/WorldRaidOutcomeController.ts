import type { PartyManager } from '../../character/PartyManager';
import { Character } from '../../character/Character';
import { getItemDef } from '../../data/ItemDB';
import type { PlayerData } from '../../data/PlayerData';
import { STORY_QUESTS, type StoryQuestReward } from '../../data/StoryQuestData';
import { formatT, t } from '../../i18n/LanguageManager';
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
        let goldReward = 0;

        if (!this.context.playerData.isCleared('quest:first_survival')) {
            this.context.playerData.markCleared('quest:first_survival');
            this.context.playerData.addGold(200);
            goldReward = 200;
            questRewards.push(formatT('raid.outcome.firstSurvivalQuest', { completed: t('quest.completed') }));
        }
        questRewards.push(...this.completeStoryQuestRewards());

        raidSession.completeAtTown(destination.id);
        this.context.playerData.currentHubTownId = destination.id;
        this.context.playerData.save();

        this.context.townSession.clearRestStatusesFromParty();
        this.context.townSession.applyRaidInjuries(raidSession.downedCharacterIds);
        this.context.party.resetForNewRaid();
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
            notes: [t('raid.outcome.sessionOnlyNote')],
        };
        this.showRaidResult(outcome, destination);
        this.context.log(formatT('raid.outcome.survivedLog', { town: destination.nameKr }));
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

        const returnTown = this.context.getTownById(raidSession.departureTownId) ?? this.context.getCurrentHubTown();
        raidSession.failBackToTown(returnTown.id);
        this.context.playerData.currentHubTownId = returnTown.id;
        this.context.playerData.save();

        this.context.townSession.clearRestStatusesFromParty();
        this.context.townSession.applyRaidInjuries(raidSession.downedCharacterIds);
        this.context.party.resetForNewRaid();
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
            notes: [t(result === 'MIA' ? 'raid.outcome.miaNote' : 'raid.outcome.deadNote')],
        };
        this.showRaidResult(outcome, returnTown);
        this.context.log(t(result === 'MIA' ? 'raid.outcome.miaLog' : 'raid.outcome.deadLog'));
    }

    private completeStoryQuestRewards(): string[] {
        const rewards: string[] = [];
        for (const quest of STORY_QUESTS) {
            if (!this.context.raidSession.isDungeonCleared(quest.dungeonId)) continue;
            if (this.context.playerData.isCleared(quest.id)) continue;

            this.context.playerData.markCleared(quest.id);
            rewards.push(`${t('quest.completed')}: ${t(quest.titleKey)}`);
            rewards.push(this.grantStoryQuestReward(quest.reward));
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
                this.context.playerData.addQuestItem(reward.itemId);
                const rewardItem = getItemDef(reward.itemId);
                if (rewardItem) this.context.gameManager.inventory.autoPlace(rewardItem);
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
