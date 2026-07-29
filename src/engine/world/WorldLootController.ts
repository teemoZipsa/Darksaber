import { getItemDef } from '../../data/ItemDB';
import { rollBossRune } from '../../data/SocketLoot';
import { formatT, t } from '../../i18n/LanguageManager';
import { formatItemName } from '../../i18n/DisplayNames';
import { LootObject } from '../../entity/LootObject';
import type { Enemy } from '../../entity/Enemy';
import type { FieldActor } from '../../field/FieldTypes';
import type { GameManager } from '../GameManager';
import type { NetworkRaidClient } from '../../net/NetworkRaidClient';
import { createInteractIntentPayload } from '../../net/WorldIntentPayloads';
import { getEnemyLootSourceLabel, getLootSourceLabelForDisplay } from '../../loot/LootLabels';
import type { WorldMap } from '../../map/WorldMap';
import type { WorldNetworkSyncController } from './WorldNetworkSyncController';
import type { WorldSelectionController } from './WorldSelectionController';
import type { WorldStoryScenarioController } from './WorldStoryScenarioController';
import { BOUNTY_PROOF_ITEM_ID } from '../../data/BountyContractData';

export interface WorldLootContext {
    gameManager: GameManager;
    selectionController: WorldSelectionController;
    storyScenarioController: WorldStoryScenarioController;
    networkSyncController: WorldNetworkSyncController;
    getWorldMap(): WorldMap;
    isNetworkRaid(): boolean;
    isLocalLootEnabled(): boolean;
    getNetworkRaidClient(): NetworkRaidClient | null;
    getControlledActor(): FieldActor | null;
    clearControlledPath(): void;
    log(message: string): void;
}

export class WorldLootController {
    private readonly context: WorldLootContext;

    constructor(context: WorldLootContext) {
        this.context = context;
        this.context.gameManager.inventoryUI.onRaidLootSecured = (placed, source) => {
            const client = this.context.getNetworkRaidClient();
            const lootId = this.context.selectionController.lootId;
            if (!this.context.isNetworkRaid() || !client || !source || !lootId) return;
            const intentId = client.sendLootPickup(lootId, source.gridX, source.gridY);
            this.context.networkSyncController.addPendingLootPick(intentId, placed, source);
            this.context.networkSyncController.purgeStaleLootPicks();
        };
    }

    public spawnEnemyLoot(enemy: Enemy): void {
        const herb = getItemDef('herb_common') ?? getItemDef('herb_cheap');
        const bountyProof = enemy.bountyContractId ? getItemDef(BOUNTY_PROOF_ITEM_ID) : null;
        const bossRune = enemy.isBoss ? rollBossRune(enemy.level) : null;
        const items = [bountyProof, bossRune, herb].filter((item): item is NonNullable<typeof item> => Boolean(item));
        if (items.length === 0) return;
        const storyInteriorBossReturn = enemy.isBoss ? this.context.storyScenarioController.getActiveInterior() : null;
        const lootMap = storyInteriorBossReturn?.previousWorldMap ?? this.context.getWorldMap();
        const lootTile = storyInteriorBossReturn?.returnTile ?? { x: enemy.gridX, y: enemy.gridY };

        if (!enemy.isBoss) {
            const failedItems: typeof items = [];
            const acquiredNames: string[] = [];
            const bag = this.context.gameManager.inventoryUI.getBag();
            for (const item of items) {
                const placed = bag.autoPlace(item);
                if (placed) {
                    placed.acquiredInRaid = true;
                    acquiredNames.push(formatItemName(item));
                } else {
                    failedItems.push(item);
                }
            }
            if (acquiredNames.length > 0) {
                this.context.log(`${enemy.name} ${t('raid.autoLoot')}: ${acquiredNames.join(', ')}`);
            }
            if (failedItems.length === 0) return;

            this.context.log(`${enemy.name}: ${t('raid.autoLootFull')}`);
            const loot = new LootObject(`corpse_${enemy.id}`, enemy.gridX, enemy.gridY, failedItems, {
                sourceLabel: getEnemyLootSourceLabel(enemy.name),
                kind: 'corpse',
            });
            this.context.getWorldMap().loot.push(loot);
            return;
        }

        const loot = new LootObject(`corpse_${enemy.id}`, lootTile.x, lootTile.y, items, {
            sourceLabel: getEnemyLootSourceLabel(enemy.name),
            kind: 'corpse',
        });
        lootMap.loot.push(loot);
        if (storyInteriorBossReturn) {
            this.context.log(formatT('story.interior.rewardAtEntrance', { source: enemy.name }));
        }
    }

    public openLoot(loot: LootObject): void {
        const sourceLabel = getLootSourceLabelForDisplay(loot);
        if (this.context.isNetworkRaid()) {
            this.context.selectionController.selectLoot(loot.id);
            this.context.log(formatT('field.log.lootLockRequest', { source: sourceLabel }));
            const actor = this.context.getControlledActor();
            if (actor) {
                this.context.getNetworkRaidClient()?.sendIntent(actor.id, 'interact', createInteractIntentPayload(loot.id));
            }
            return;
        }
        if (!this.context.isLocalLootEnabled()) {
            this.context.log(t('field.log.serverLootOnly'));
            return;
        }
        this.context.selectionController.selectLoot(loot.id);
        this.context.log(formatT('field.log.lootSearch', { source: sourceLabel }));
        this.context.clearControlledPath();
        const actor = this.context.getControlledActor();
        if (actor) actor.queuedIntent = null;

        this.context.gameManager.inventoryUI.setExternalGrid(loot.inventory, sourceLabel, { isRaidLoot: true });
        if (!this.context.gameManager.inventoryUI.isVisible()) this.context.gameManager.inventoryUI.toggle();
    }

    public refreshLootState(): void {
        for (const loot of this.context.getWorldMap().loot) {
            loot.opened = loot.inventory.items.length === 0;
        }
    }
}
