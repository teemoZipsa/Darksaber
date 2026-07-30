import { FIELD_MAX_ACTION_GAUGE, MIN_FIELD_ACTION_GAUGE_COST } from '../../field/FieldActionEconomy';
import type { FieldActor, FieldTurnEndReason } from '../../field/FieldTypes';
import { formatT, t } from '../../i18n/LanguageManager';
import type { ActionMenuSlotState } from '../../ui/ActionMenuUI';

export interface WorldEngineActionTurnFlowContext {
    getControlledActor: () => FieldActor | null;
    getActivePartyTurnActor: () => FieldActor | null;
    getSpendableActionGauge: () => number;
    getActionMenuIsOpen: () => boolean;
    openActionMenu: (states: ActionMenuSlotState[]) => void;
    updateActionMenuStates: (states: ActionMenuSlotState[]) => void;
    closeActionMenu: () => void;
    closeTacticalMenu: () => void;
    selectActor: (actorId: string | null) => void;
    getActionMenuStates: (actor: FieldActor) => ActionMenuSlotState[];
    isTutorialActive: () => boolean;
    addTutorialBlockedLog: () => void;
    getActiveTurnActorId: () => string | null;
    beginActorTurn: (actor: FieldActor) => void;
    spendTurnAp: (cost: number, fallbackGauge: number) => boolean;
    getRemainingActionPoints: () => number;
    setRemainingActionPoints: (points: number) => void;
    getDismissCarryover: () => number;
    endActiveTurn: () => void;
    hasExecutableAction: (actor: FieldActor) => boolean;
    submitEndTurn: (actor: FieldActor, reason: FieldTurnEndReason) => void;
    clearActorIntent: (actor: FieldActor) => void;
    clearTargeting: () => void;
    resetMagic: () => void;
    resetTool: () => void;
    log: (message: string) => void;
}

export class WorldEngineActionTurnFlow {
    public constructor(private readonly context: WorldEngineActionTurnFlowContext) {}

    public toggleActionMenuForControlled(): void {
        const actor = this.context.getControlledActor();
        if (!actor) return;
        this.context.selectActor(actor.id);

        if (!this.context.getActiveTurnActorId() && actor.entity.actionGauge >= FIELD_MAX_ACTION_GAUGE) {
            this.context.beginActorTurn(actor);
            return;
        }

        if (actor.id !== this.context.getActiveTurnActorId()) {
            this.context.log(t('field.log.notTurn'));
            return;
        }

        if (this.context.getActionMenuIsOpen()) {
            this.context.closeActionMenu();
            return;
        }

        this.context.closeTacticalMenu();
        this.context.openActionMenu(this.context.getActionMenuStates(actor));
    }

    public refreshOpenActionMenuState(): void {
        if (!this.context.getActionMenuIsOpen()) return;
        const actor = this.context.getActivePartyTurnActor();
        if (!actor) {
            this.context.closeActionMenu();
            return;
        }
        this.context.openActionMenu(this.context.getActionMenuStates(actor));
    }

    public dismissActionMenuTurn(): void {
        if (this.context.isTutorialActive()) {
            const actor = this.context.getActivePartyTurnActor();
            if (actor) this.reopenActionMenu(actor);
            this.context.addTutorialBlockedLog();
            return;
        }
        const actor = this.context.getActivePartyTurnActor();
        if (!actor) {
            this.context.closeActionMenu();
            return;
        }
        const carryover = this.context.getDismissCarryover();
        this.endActorTurn(actor, 'wait', carryover);
    }

    public spendAp(cost: number): boolean {
        if (!this.context.spendTurnAp(cost, this.context.getSpendableActionGauge())) return false;
        const actor = this.context.getActivePartyTurnActor();
        if (actor) actor.entity.actionGauge = this.context.getRemainingActionPoints();
        return true;
    }

    public resumeOrEndActiveTurn(actor: FieldActor): void {
        if (actor.id !== this.context.getActiveTurnActorId()) return;
        if (actor.character.isDead || actor.character.stats.hp <= 0) {
            this.endActorTurn(actor, 'incapacitated', 0);
            return;
        }
        if (this.context.hasExecutableAction(actor)) {
            this.reopenActionMenu(actor);
            return;
        }
        this.endActorTurn(actor, 'gaugeLow', this.context.getRemainingActionPoints());
    }

    public reopenActionMenu(actor: FieldActor): void {
        if (actor.id !== this.context.getActiveTurnActorId()) return;
        if (actor.character.isDead || actor.character.stats.hp <= 0) return;
        if (this.context.getRemainingActionPoints() <= 0 && actor.entity.actionGauge >= MIN_FIELD_ACTION_GAUGE_COST) {
            this.context.setRemainingActionPoints(Math.floor(actor.entity.actionGauge));
        }
        this.context.selectActor(actor.id);
        this.context.closeTacticalMenu();
        this.context.openActionMenu(this.context.getActionMenuStates(actor));
    }

    public endActorTurn(
        actor: FieldActor,
        reason: FieldTurnEndReason,
        atbCarryover: number = this.context.getRemainingActionPoints()
    ): void {
        if (actor.id === this.context.getActiveTurnActorId()) this.context.submitEndTurn(actor, reason);
        actor.entity.actionGauge = Math.max(0, Math.min(FIELD_MAX_ACTION_GAUGE, atbCarryover));
        this.context.endActiveTurn();
        this.context.clearActorIntent(actor);
        this.context.closeActionMenu();
        this.context.closeTacticalMenu();
        this.context.clearTargeting();
        this.context.resetMagic();
        this.context.resetTool();
        this.context.log(formatT('field.log.turnEnd', {
            name: actor.character.name,
            reason: t(`field.log.reason.${reason}`),
        }));
    }
}
