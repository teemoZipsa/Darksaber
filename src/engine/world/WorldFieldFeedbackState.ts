import type { TilePoint } from '../../field/FieldPathing';
import type { AttackCue } from '../../field/FieldTypes';
import { CombatPresentationTimeline } from './CombatPresentationTimeline';

export class WorldFieldFeedbackState {
    public readonly combatLog: string[] = [];
    public readonly attackCues: AttackCue[] = [];
    private readonly combatPresentation = new CombatPresentationTimeline();

    public addCombatLog(message: string): void {
        this.combatLog.push(message);
        if (this.combatLog.length > 200) this.combatLog.shift();
    }

    public lastCombatLog(): string | undefined {
        return this.combatLog[this.combatLog.length - 1];
    }

    public spawnAttackCue(from: TilePoint, to: TilePoint, color: string, label?: string): void {
        this.attackCues.push({ from, to, color, label, timer: 0, duration: 0.38 });
    }

    public scheduleCombatPresentation(delaySeconds: number, action: () => void): void {
        this.combatPresentation.schedule(delaySeconds, action);
    }

    public updateAttackCues(dt: number): void {
        this.combatPresentation.update(dt);
        for (let i = this.attackCues.length - 1; i >= 0; i--) {
            this.attackCues[i].timer += dt;
            if (this.attackCues[i].timer >= this.attackCues[i].duration) this.attackCues.splice(i, 1);
        }
    }

    public clearCombatPresentation(): void {
        this.combatPresentation.clear();
    }

    public isCombatPresentationBusy(): boolean {
        return this.combatPresentation.pendingCount > 0;
    }
}
