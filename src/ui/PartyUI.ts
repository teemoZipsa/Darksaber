/**
 * PartyUI — visibility state for the React DOM party panel.
 *
 * Party layout, drag/drop, and roster mutations live in
 * `ui/react/party/PartyPanel.tsx` through UiStore.
 */

import type { PartyManager } from '../character/PartyManager';

export class PartyUI {
    private visible = false;

    constructor(_partyManager: PartyManager) {}

    public toggle(): void {
        this.visible = !this.visible;
    }

    public isVisible(): boolean {
        return this.visible;
    }

    public setVisible(visible: boolean): void {
        this.visible = visible;
    }

    public show(): void {
        this.visible = true;
    }

    public hide(): void {
        this.visible = false;
    }
}
