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
import { PauseMenu } from './PauseMenu';
import { SettingsPanel } from './settings/SettingsPanel';
import { PartyPanel } from './party/PartyPanel';

export function OverlayRoot() {
    const store = useStore();
    const charOpen = useUiSelector((s) => s.isCharPanelOpen());
    const pauseOpen = useUiSelector((s) => s.isPauseOpen());
    const settingsOpen = useUiSelector((s) => s.isSettingsOpen());
    const partyOpen = useUiSelector((s) => s.isPartyOpen());

    return (
        <>
            {charOpen && (
                <div className="ds-scrim" onClick={() => store.closeCharPanel()}>
                    <CharacterPanel />
                </div>
            )}
            {pauseOpen && (
                <div className="ds-scrim" onClick={() => store.pauseResume()}>
                    <PauseMenu />
                </div>
            )}
            {settingsOpen && (
                <div className="ds-scrim" onClick={() => store.closeSettings()}>
                    <SettingsPanel />
                </div>
            )}
            {partyOpen && (
                <div className="ds-scrim" onClick={() => store.closeParty()}>
                    <PartyPanel />
                </div>
            )}
        </>
    );
}
