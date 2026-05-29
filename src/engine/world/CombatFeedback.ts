export type CombatFeedbackKind = 'normal' | 'counter' | 'critical' | 'kill' | 'status';

export interface CombatFeedbackConfig {
    shake: number;
    shakeMs: number;
    hitstopMs: number;
}

export const HIT_FEEDBACK: Record<CombatFeedbackKind, CombatFeedbackConfig> = {
    normal: { shake: 6, shakeMs: 180, hitstopMs: 18 },
    counter: { shake: 4, shakeMs: 120, hitstopMs: 12 },
    critical: { shake: 14, shakeMs: 280, hitstopMs: 50 },
    kill: { shake: 16, shakeMs: 320, hitstopMs: 60 },
    status: { shake: 0, shakeMs: 0, hitstopMs: 0 },
};

const FEEDBACK_PRIORITY: Record<CombatFeedbackKind, number> = {
    status: 0,
    counter: 1,
    normal: 2,
    critical: 3,
    kill: 4,
};

export function strongerCombatFeedback(
    current: CombatFeedbackKind | undefined,
    next: CombatFeedbackKind
): CombatFeedbackKind {
    if (!current) return next;
    return FEEDBACK_PRIORITY[next] > FEEDBACK_PRIORITY[current] ? next : current;
}
