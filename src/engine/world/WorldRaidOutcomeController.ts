import type { PartyManager } from '../../character/PartyManager';
import { getItemDef } from '../../data/ItemDB';
import type { PlayerData } from '../../data/PlayerData';
import { STORY_QUESTS } from '../../data/StoryQuestData';
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
            questRewards.push('퀘스트 완료: 첫 생환');
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
            notes: [result === 'MIA' ? '시간 초과로 실종 처리되었습니다.' : '출격조가 전멸했습니다.'],
        };
        this.showRaidResult(outcome, returnTown);
        this.context.log(result === 'MIA' ? '시간 초과. 손실이 적용되었습니다.' : '전멸. 손실이 적용되었습니다.');
    }

    private completeStoryQuestRewards(): string[] {
        const rewards: string[] = [];
        for (const quest of STORY_QUESTS) {
            if (!this.context.raidSession.isDungeonCleared(quest.dungeonId)) continue;
            if (this.context.playerData.isCleared(quest.id)) continue;

            this.context.playerData.markCleared(quest.id);
            if (!this.context.playerData.hasQuestItem(quest.rewardItemId)) {
                this.context.playerData.addQuestItem(quest.rewardItemId);
            }

            const rewardItem = getItemDef(quest.rewardItemId);
            rewards.push(`${t('quest.completed')}: ${t(quest.titleKey)}`);
            rewards.push(`${t('quest.rewardItem')}: ${rewardItem?.nameKr ?? quest.rewardItemId}`);
        }
        return rewards;
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
