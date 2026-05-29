/**
 * OverlayRoot — top of the React DOM overlay tree.
 *
 * Renders nothing until a DOM-backed panel is open. For the pilot that is the
 * character panel; future panels each add their own open-flag branch here.
 * Uses a selector (not the per-frame version) so a closed overlay does not
 * re-render every frame.
 */

import { useStore, useUiSelector } from './UiContext';
import { CharacterPanel } from './character/CharacterPanel';

export function OverlayRoot() {
    const store = useStore();
    const charOpen = useUiSelector((s) => s.isCharPanelOpen());

    if (!charOpen) return null;

    return (
        <div className="ds-scrim" onClick={() => store.closeCharPanel()}>
            <CharacterPanel />
        </div>
    );
}
