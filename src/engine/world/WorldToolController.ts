import { TOOL_ACTION_GAUGE_COST } from '../../field/FieldActionEconomy';
import {
    isCombatRecoveryItem,
    previewCombatItemRecovery,
    previewCombatItemUse,
    type CombatItemApplicationPreview,
} from '../../field/FieldCombatItemRules';
import type { FieldActor } from '../../field/FieldTypes';
import type { ItemDef } from '../../data/ItemDB';
import type { PlacedItem } from '../../inventory/GridInventory';
import { ToolUI, type ToolOptionView } from '../../ui/ToolUI';
import { formatItemName } from '../../i18n/DisplayNames';
import { formatT, t } from '../../i18n/LanguageManager';

type ToolUseCandidate = CombatItemApplicationPreview & {
    placed: PlacedItem;
};

export interface CombatToolAvailability {
    hasRecoveryConsumable: boolean;
    hasEffectiveRecovery: boolean;
}

export interface WorldToolContext {
    getActivePartyTurnActor: () => FieldActor | null;
    getRemainingActionPoints: () => number;
    getInventoryItems: () => PlacedItem[];
    removeInventoryItem: (placed: PlacedItem) => void;
    spendAp: (cost: number) => boolean;
    isMajorActionUsed: () => boolean;
    markMajorActionUsed: () => void;
    submitNetworkUseItem?: (actor: FieldActor, itemId: string) => boolean;
    reopenActionMenu: (actor: FieldActor) => void;
    resumeOrEndActiveTurn: (actor: FieldActor) => void;
}

export interface WorldToolEventSink {
    log(message: string): void;
    spawnHeal(x: number, y: number, amount: number): void;
    spawnStatus(x: number, y: number, text: string): void;
    spawnHealEffect(x: number, y: number): void;
}

export class WorldToolController {
    private readonly context: WorldToolContext;
    private readonly sink: WorldToolEventSink;
    private readonly toolUI = new ToolUI();

    constructor(context: WorldToolContext, sink: WorldToolEventSink) {
        this.context = context;
        this.sink = sink;
        this.toolUI.onToolSelect = (itemId) => this.useTool(itemId);
    }

    public isVisible(): boolean {
        return this.toolUI.isVisible();
    }

    public isActive(): boolean {
        return this.toolUI.isVisible();
    }

    public render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
        this.toolUI.render(ctx, width, height);
    }

    public onMouseMove(x: number, y: number): void {
        this.toolUI.onMouseMove(x, y);
    }

    public onMouseUp(): void {
        this.toolUI.onMouseUp();
    }

    public onScroll(delta: number): boolean {
        return this.toolUI.onScroll(delta);
    }

    public handleMenuMouseDown(x: number, y: number): void {
        const actor = this.context.getActivePartyTurnActor();
        const wasVisible = this.toolUI.isVisible();
        const consumed = this.toolUI.onMouseDown(x, y);
        if (!consumed && wasVisible && actor) this.context.reopenActionMenu(actor);
    }

    public open(actor: FieldActor): void {
        if (this.context.getRemainingActionPoints() < TOOL_ACTION_GAUGE_COST) {
            this.sink.log(t('field.log.toolApLow'));
            this.context.reopenActionMenu(actor);
            return;
        }

        const options = this.getToolOptions(actor);
        if (options.length === 0) {
            this.sink.log(t('field.log.toolNone'));
            this.context.reopenActionMenu(actor);
            return;
        }

        this.toolUI.show(options);
        this.sink.log(t('field.log.toolSelect'));
    }

    public reset(): void {
        this.toolUI.hide();
    }

    public hasUsableCombatTool(actor: FieldActor): boolean {
        return this.getCombatToolAvailability(actor).hasEffectiveRecovery;
    }

    public getCombatToolAvailability(actor: FieldActor): CombatToolAvailability {
        let hasRecoveryConsumable = false;
        let hasEffectiveRecovery = false;
        for (const placed of this.context.getInventoryItems()) {
            if (placed.quantity <= 0 || !isCombatRecoveryItem(placed.item)) continue;
            hasRecoveryConsumable = true;
            if (previewCombatItemRecovery(placed.item, actor.character).ok) {
                hasEffectiveRecovery = true;
            }
        }
        return {
            hasRecoveryConsumable,
            hasEffectiveRecovery,
        };
    }

    public useTool(itemId: string): void {
        const actor = this.context.getActivePartyTurnActor();
        if (!actor) return;

        const candidate = this.getToolCandidates(actor).find((entry) => entry.placed.item.id === itemId);
        if (!candidate) {
            this.sink.log(t('field.log.toolUnavailable'));
            this.context.reopenActionMenu(actor);
            return;
        }

        if (!this.context.getInventoryItems().includes(candidate.placed) || candidate.placed.quantity <= 0) {
            this.sink.log(t('field.log.toolMissing'));
            this.context.reopenActionMenu(actor);
            return;
        }

        const preview = previewCombatItemUse({
            item: candidate.placed.item,
            carrier: actor.character,
            remainingAp: this.context.getRemainingActionPoints(),
        });
        if (!preview.ok) {
            this.sink.log(preview.reason === 'noAction'
                ? t('field.log.toolApLow')
                : preview.reason === 'noEffect'
                    ? t('field.log.toolNoEffect')
                    : t('field.log.toolUnavailable'));
            this.context.reopenActionMenu(actor);
            return;
        }

        if (this.context.submitNetworkUseItem?.(actor, itemId)) {
            this.reset();
            return;
        }

        if (!this.context.spendAp(preview.apCost)) {
            this.sink.log(t('field.log.toolApLow'));
            this.context.reopenActionMenu(actor);
            return;
        }

        actor.character.stats.hp = preview.nextHp;
        actor.character.stats.mp = preview.nextMp;

        if (candidate.placed.quantity > 1) {
            candidate.placed.quantity -= 1;
        } else {
            this.context.removeInventoryItem(candidate.placed);
        }

        if (preview.effectiveHp > 0) {
            this.sink.spawnHeal(actor.entity.gridX, actor.entity.gridY, preview.effectiveHp);
        }
        if (preview.effectiveMp > 0) {
            this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, `MP+${preview.effectiveMp}`);
        }
        this.sink.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);
        this.sink.log(formatT('field.log.toolUsed', {
            item: formatItemName(candidate.placed.item),
            hp: preview.effectiveHp,
            mp: preview.effectiveMp,
        }));
        this.context.resumeOrEndActiveTurn(actor);
    }

    private getToolOptions(actor: FieldActor): ToolOptionView[] {
        const grouped = new Map<string, { item: ItemDef; count: number; hp: number; mp: number }>();
        for (const candidate of this.getToolCandidates(actor)) {
            const item = candidate.placed.item;
            const current = grouped.get(item.id);
            if (current) {
                current.count += Math.max(1, candidate.placed.quantity);
                current.hp = Math.max(current.hp, candidate.effectiveHp);
                current.mp = Math.max(current.mp, candidate.effectiveMp);
            } else {
                grouped.set(item.id, {
                    item,
                    count: Math.max(1, candidate.placed.quantity),
                    hp: candidate.effectiveHp,
                    mp: candidate.effectiveMp,
                });
            }
        }

        return [...grouped.values()]
            .sort((a, b) => formatItemName(a.item).localeCompare(formatItemName(b.item), undefined))
            .map(({ item, count, hp, mp }) => ({
                itemId: item.id,
                icon: item.icon,
                iconSprite: item.iconSprite,
                color: item.color,
                name: formatItemName(item),
                count,
                recoverHp: hp,
                recoverMp: mp,
            }));
    }

    private getToolCandidates(actor: FieldActor): ToolUseCandidate[] {
        const candidates: ToolUseCandidate[] = [];
        for (const placed of this.context.getInventoryItems()) {
            if (placed.quantity <= 0) continue;
            const preview = previewCombatItemRecovery(placed.item, actor.character);
            if (preview.ok) candidates.push({ placed, ...preview });
        }
        return candidates;
    }
}
