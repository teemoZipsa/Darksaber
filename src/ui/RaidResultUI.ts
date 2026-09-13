import type { RaidOutcome } from '../raid/RaidOutcome';

/** Result visibility and confirmation; presentation and input belong to React. */
export class RaidResultUI {
    private outcome: RaidOutcome | null = null;
    public onClose: (() => void) | null = null;

    public show(outcome: RaidOutcome): void { this.outcome = outcome; }
    public hide(): void { this.outcome = null; }
    public isVisible(): boolean { return this.outcome !== null; }
    public getOutcome(): RaidOutcome | null { return this.outcome; }

    public confirm(): void {
        if (!this.outcome) return;
        this.hide();
        this.onClose?.();
    }
}
