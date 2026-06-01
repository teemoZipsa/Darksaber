/**
 * PauseMenuUI — visibility/callback state for the React DOM pause menu.
 *
 * Rendering and pointer handling live in `ui/react/PauseMenu.tsx`.
 */

import { AudioManager } from '../engine/AudioManager';

export class PauseMenuUI {
    private visible = false;

    public onResume: () => void = () => undefined;
    public onOpenSettings: () => void = () => undefined;
    public onReturnToTitle: () => void = () => undefined;

    public open(): void {
        if (this.visible) return;
        this.visible = true;
        AudioManager.playUi('ui.open');
    }

    public close(): void {
        this.visible = false;
    }

    public isVisible(): boolean {
        return this.visible;
    }
}
