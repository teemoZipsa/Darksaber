import { getEffectiveStatsForCharacter } from '../../combat/StatusEffects';
import { getActionApCost } from '../../field/FieldActionEconomy';
import type { FieldActor } from '../../field/FieldTypes';
import {
    getCombatRecovery,
    isCombatRecoveryConsumable,
    type ItemDef,
} from '../../data/ItemDB';
import type { PlacedItem } from '../../inventory/GridInventory';
import { ToolUI, type ToolOptionView } from '../../ui/ToolUI';

interface ToolUseCandidate {
    placed: PlacedItem;
    effectiveHp: number;
    effectiveMp: number;
}

export interface WorldToolContext {
    getActivePartyTurnActor: () => FieldActor | null;
    getRemainingActionPoints: () => number;
    getInventoryItems: () => PlacedItem[];
    removeInventoryItem: (placed: PlacedItem) => void;
    spendAp: (cost: number) => boolean;
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
        if (this.context.getRemainingActionPoints() < getActionApCost('tool')) {
            this.sink.log('도구를 사용할 행동력이 부족합니다.');
            this.context.reopenActionMenu(actor);
            return;
        }

        const options = this.getToolOptions(actor);
        if (options.length === 0) {
            this.sink.log('지금 사용할 수 있는 도구가 없습니다.');
            this.context.reopenActionMenu(actor);
            return;
        }

        this.toolUI.show(options);
        this.sink.log('사용할 도구를 선택하세요.');
    }

    public reset(): void {
        this.toolUI.hide();
    }

    public hasUsableCombatTool(actor: FieldActor): boolean {
        return this.getToolCandidates(actor).length > 0;
    }

    public useTool(itemId: string): void {
        const actor = this.context.getActivePartyTurnActor();
        if (!actor) return;

        const candidate = this.getToolCandidates(actor).find((entry) => entry.placed.item.id === itemId);
        if (!candidate) {
            this.sink.log('지금은 사용할 수 없는 도구입니다.');
            this.context.reopenActionMenu(actor);
            return;
        }

        if (!this.context.getInventoryItems().includes(candidate.placed) || candidate.placed.quantity <= 0) {
            this.sink.log('도구를 찾을 수 없습니다.');
            this.context.reopenActionMenu(actor);
            return;
        }

        if (this.context.getRemainingActionPoints() < getActionApCost('tool')) {
            this.sink.log('도구를 사용할 행동력이 부족합니다.');
            this.context.reopenActionMenu(actor);
            return;
        }

        if (candidate.effectiveHp <= 0 && candidate.effectiveMp <= 0) {
            this.sink.log('효과가 없습니다.');
            this.context.reopenActionMenu(actor);
            return;
        }

        if (!this.context.spendAp(getActionApCost('tool'))) {
            this.sink.log('도구를 사용할 행동력이 부족합니다.');
            this.context.reopenActionMenu(actor);
            return;
        }

        actor.character.stats.hp += candidate.effectiveHp;
        actor.character.stats.mp += candidate.effectiveMp;

        if (candidate.placed.quantity > 1) {
            candidate.placed.quantity -= 1;
        } else {
            this.context.removeInventoryItem(candidate.placed);
        }

        if (candidate.effectiveHp > 0) {
            this.sink.spawnHeal(actor.entity.gridX, actor.entity.gridY, candidate.effectiveHp);
        }
        if (candidate.effectiveMp > 0) {
            this.sink.spawnStatus(actor.entity.gridX, actor.entity.gridY, `MP+${candidate.effectiveMp}`);
        }
        this.sink.spawnHealEffect(actor.entity.gridX, actor.entity.gridY);
        this.sink.log(`${candidate.placed.item.nameKr} 사용: HP +${candidate.effectiveHp}, MP +${candidate.effectiveMp}`);
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
            .sort((a, b) => a.item.nameKr.localeCompare(b.item.nameKr, 'ko'))
            .map(({ item, count, hp, mp }) => ({
                itemId: item.id,
                icon: item.icon,
                name: item.nameKr,
                count,
                recoverHp: hp,
                recoverMp: mp,
            }));
    }

    private getToolCandidates(actor: FieldActor): ToolUseCandidate[] {
        return this.context.getInventoryItems()
            .filter((placed) => placed.quantity > 0 && isCombatRecoveryConsumable(placed.item))
            .map((placed) => ({
                placed,
                ...this.getEffectiveRecovery(actor, placed.item),
            }))
            .filter((candidate) => candidate.effectiveHp > 0 || candidate.effectiveMp > 0);
    }

    private getEffectiveRecovery(actor: FieldActor, item: ItemDef): { effectiveHp: number; effectiveMp: number } {
        const recovery = getCombatRecovery(item);
        const effective = getEffectiveStatsForCharacter(actor.character);
        return {
            effectiveHp: Math.max(0, Math.min(recovery.hp, effective.maxHp - actor.character.stats.hp)),
            effectiveMp: Math.max(0, Math.min(recovery.mp, effective.maxMp - actor.character.stats.mp)),
        };
    }
}
