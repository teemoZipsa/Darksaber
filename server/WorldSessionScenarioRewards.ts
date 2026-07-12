import {
    getItemDef,
    type ItemDef,
} from '../src/data/ItemDB';
import {
    getStoryScenarioEventSequence,
    type StoryScenarioFieldEvent,
} from '../src/data/StoryScenarioEventData';
import {
    doesStoryScenarioFieldEventRandomPass,
    getStoryScenarioFieldEventRequiredItems,
    getStoryScenarioFieldEventTrapDamage,
} from '../src/raid/StoryScenarioFieldEventRules';
import type {
    ScenarioFieldEventResultMessage,
    ScenarioFieldEventRewardResult,
} from '../src/net/WorldProtocol';
import { getPlacedItemWeight } from '../src/inventory/CarryWeight';
import { removeActionStanceStatusesFromCarrier } from '../src/combat/StatusEffects';
import {
    addCarriedItemQuantity,
    addCarriedWeight,
    removeCarriedWeight,
} from './WorldSessionCarryState';
import type { WorldSessionSaveState } from './WorldSessionSaveState';
import type { ServerActor, ServerPlayer } from './WorldSessionTypes';

export interface WorldSessionScenarioRewardsContext {
    saveState: WorldSessionSaveState;
}

export class WorldSessionScenarioRewards {
    public constructor(private readonly context: WorldSessionScenarioRewardsContext) {}

    public applyFieldEventRewards(
        player: ServerPlayer,
        event: StoryScenarioFieldEvent
    ): ScenarioFieldEventRewardResult[] {
        return this.applyRewards(player, event.rewards);
    }

    public applyAmbientSiteRewards(
        player: ServerPlayer,
        rewards: ScenarioFieldEventRewardResult[]
    ): ScenarioFieldEventRewardResult[] {
        return this.applyRewards(player, rewards);
    }

    public applyFieldEventTrapMagic(
        actor: ServerActor,
        event: StoryScenarioFieldEvent
    ): ScenarioFieldEventResultMessage['trapDamage'] {
        if (actor.isDead || actor.stats.hp <= 1) return undefined;

        const damage = getStoryScenarioFieldEventTrapDamage(event, actor.stats.hp, actor.stats.maxHp);
        if (damage <= 0) return undefined;

        actor.stats.hp = Math.max(1, actor.stats.hp - damage);
        removeActionStanceStatusesFromCarrier(actor);
        return { actorId: actor.id, damage };
    }

    public applyAmbientSiteTrap(
        actor: ServerActor,
        maxHpRatio: number | undefined
    ): ScenarioFieldEventResultMessage['trapDamage'] {
        if (!maxHpRatio || actor.isDead || actor.stats.hp <= 1) return undefined;
        const damage = Math.min(actor.stats.hp - 1, Math.max(1, Math.floor(actor.stats.maxHp * maxHpRatio)));
        actor.stats.hp = Math.max(1, actor.stats.hp - damage);
        removeActionStanceStatusesFromCarrier(actor);
        return { actorId: actor.id, damage };
    }

    public rollFieldEventRandom(event: StoryScenarioFieldEvent): boolean {
        return doesStoryScenarioFieldEventRandomPass(event, () => Math.random());
    }

    public canConsumeFieldEventUseItems(player: ServerPlayer, event: StoryScenarioFieldEvent): boolean {
        return this.getRequiredItems(event).every((item) => this.getPlayerItemQuantity(player, item.id) > 0);
    }

    public consumeFieldEventUseItems(player: ServerPlayer, event: StoryScenarioFieldEvent): void {
        for (const item of this.getRequiredItems(event)) {
            if (this.getPlayerItemQuantity(player, item.id) <= 0) continue;
            this.context.saveState.removeItemQuantity(player, item.id, 1);
            addCarriedItemQuantity(player, item.id, -1);
            removeCarriedWeight(player, getPlacedItemWeight({ item, quantity: 1 }));
            this.context.saveState.markDirty(player.id);
        }
    }

    public applyBossDefeatRewards(
        player: ServerPlayer,
        dungeonId: string
    ): ScenarioFieldEventRewardResult[] {
        const event = getStoryScenarioEventSequence(dungeonId)?.bossDefeatEvent;
        return this.applyRewards(player, event?.rewards);
    }

    public applyRewards(
        player: ServerPlayer,
        rewards: StoryScenarioFieldEvent['rewards']
    ): ScenarioFieldEventRewardResult[] {
        const results: ScenarioFieldEventRewardResult[] = [];
        for (const reward of rewards ?? []) {
            if (reward.type === 'gold') {
                player.raidGoldReward += Math.max(0, Math.floor(reward.amount));
                results.push({ type: 'gold', amount: reward.amount });
                continue;
            }

            const item = getItemDef(reward.itemId);
            if (!item) continue;
            const saved = this.context.saveState.addPlacedItem(player, {
                item,
                durability: item.maxDurability,
                quantity: 1,
            });
            if (!saved) continue;
            addCarriedItemQuantity(player, item.id, 1);
            addCarriedWeight(player, getPlacedItemWeight({ item, quantity: 1 }));
            this.context.saveState.markDirty(player.id);
            results.push({
                type: 'item',
                itemId: item.id,
                ...(reward.originalItemId !== undefined && reward.originalItemId > 0 ? { originalItemId: reward.originalItemId } : {}),
            });
        }
        return results;
    }

    public canApplyRewards(player: ServerPlayer, rewards: StoryScenarioFieldEvent['rewards']): boolean {
        const placedItems = (rewards ?? []).flatMap((reward) => {
            if (reward.type !== 'item') return [];
            const item = getItemDef(reward.itemId);
            return item ? [{ item, durability: item.maxDurability, quantity: 1 }] : [];
        });
        return this.context.saveState.canAddPlacedItems(player, placedItems);
    }

    public canApplyAmbientSiteRewards(player: ServerPlayer, rewards: ScenarioFieldEventRewardResult[]): boolean {
        return this.canApplyRewards(player, rewards);
    }

    private getRequiredItems(event: StoryScenarioFieldEvent): ItemDef[] {
        return getStoryScenarioFieldEventRequiredItems(event);
    }

    private getPlayerItemQuantity(player: ServerPlayer, itemId: string): number {
        const carriedQuantity = player.carriedItems.get(itemId) ?? 0;
        const savedQuantity = (player.saveSnapshot?.inventory.items ?? [])
            .filter((entry) => entry.itemId === itemId)
            .reduce((sum, entry) => sum + Math.max(1, Math.floor(entry.quantity ?? 1)), 0);
        return Math.max(carriedQuantity, savedQuantity);
    }
}
