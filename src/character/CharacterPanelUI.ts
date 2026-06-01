/**
 * CharacterPanelUI — visibility state for the React DOM character panel.
 *
 * Rendering lives in `ui/react/character/CharacterPanel.tsx`; GameManager keeps
 * this small object as the existing open/close bit used by keyboard shortcuts.
 */

import type { PartyManager } from './PartyManager';

export class CharacterPanelUI {
    private visible = false;

    // Kept for the existing GameManager assignment; React reads gold from UiStore.
    public getGold?: () => number;

    constructor(_party: PartyManager) {}

    public toggle(): void {
        this.visible = !this.visible;
    }

    public isVisible(): boolean {
        return this.visible;
    }
}
