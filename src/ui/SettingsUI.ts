/**
 * SettingsUI — visibility/callback state for the React DOM settings panel.
 *
 * Rendering, input controls, and SettingsManager writes live in
 * `ui/react/settings/SettingsPanel.tsx`.
 */

export class SettingsUI {
    private visible = false;

    public onClose: () => void = () => undefined;

    public open(): void {
        this.visible = true;
    }

    public close(): void {
        this.visible = false;
    }

    public isVisible(): boolean {
        return this.visible;
    }
}
