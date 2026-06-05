import { HIT_FEEDBACK, strongerCombatFeedback, type CombatFeedbackKind } from './CombatFeedback';
import { HitStop } from './HitStop';

export interface WorldCombatFeedbackContext {
    getWorldTime(): number;
    shakeCamera(amount: number, durationMs: number): void;
}

export class WorldCombatFeedbackController {
    private readonly context: WorldCombatFeedbackContext;
    private readonly feedbackGroups = new Map<string, CombatFeedbackKind>();

    constructor(context: WorldCombatFeedbackContext) {
        this.context = context;
    }

    public beginGroup(): string {
        const id = `world:${this.context.getWorldTime()}:${this.feedbackGroups.size + 1}:${Math.random().toString(36).slice(2, 8)}`;
        this.feedbackGroups.set(id, 'status');
        return id;
    }

    public register(kind: CombatFeedbackKind, feedbackGroupId?: string): void {
        if (!feedbackGroupId) {
            this.apply(kind);
            return;
        }
        const current = this.feedbackGroups.get(feedbackGroupId);
        this.feedbackGroups.set(feedbackGroupId, strongerCombatFeedback(current, kind));
    }

    public flush(feedbackGroupId: string): void {
        const kind = this.feedbackGroups.get(feedbackGroupId);
        if (!kind) return;
        this.feedbackGroups.delete(feedbackGroupId);
        this.apply(kind);
    }

    private apply(kind: CombatFeedbackKind): void {
        const feedback = HIT_FEEDBACK[kind];
        if (feedback.shake > 0) this.context.shakeCamera(feedback.shake, feedback.shakeMs);
        if (feedback.hitstopMs > 0) HitStop.freeze(feedback.hitstopMs);
    }
}
