/**
 * OverlayRoot — top of the React DOM overlay tree.
 *
 * Renders nothing until a DOM-backed panel is open. For the pilot that is the
 * character panel; future panels each add their own open-flag branch here.
 * Uses selectors for open flags so closed overlay branches do not re-render
 * unless a visible flag changes.
 */

import { useStore, useUiSelector } from './UiContext';
import { CharacterPanel } from './character/CharacterPanel';
import { PauseMenu } from './PauseMenu';
import { SettingsPanel } from './settings/SettingsPanel';
import { PartyPanel } from './party/PartyPanel';
import { TownScreen } from './town/TownScreen';
import { CharacterCreation } from './charcreate/CharacterCreation';
import { InventoryPanel } from './inventory/InventoryPanel';
import { StoryJournalPanel } from './quest/StoryJournalPanel';
import { MagicLoadoutPanel } from './magic/MagicLoadoutPanel';

export function OverlayRoot() {
    const store = useStore();
    const charOpen = useUiSelector((s) => s.isOverlayOpen('char'));
    const pauseOpen = useUiSelector((s) => s.isOverlayOpen('pause'));
    const settingsOpen = useUiSelector((s) => s.isOverlayOpen('settings'));
    const partyOpen = useUiSelector((s) => s.isOverlayOpen('party'));
    const townOpen = useUiSelector((s) => s.isOverlayOpen('town'));
    const charCreateOpen = useUiSelector((s) => s.isOverlayOpen('create'));
    const inventoryOpen = useUiSelector((s) => s.isOverlayOpen('inventory'));
    const questJournalOpen = useUiSelector((s) => s.isOverlayOpen('journal'));
    const magicLoadoutOpen = useUiSelector((s) => s.isOverlayOpen('magic'));

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
            {inventoryOpen && (
                <div className="ds-scrim" onClick={() => store.closeInventory()}>
                    <InventoryPanel inv={store.getWorldInventory()} />
                </div>
            )}
            {magicLoadoutOpen && (
                <div className="ds-scrim" onClick={() => store.closeMagicLoadout()}>
                    <MagicLoadoutPanel />
                </div>
            )}
            {townOpen && <TownScreen />}
            {questJournalOpen && (
                <div className="ds-scrim" onClick={() => store.closeQuestJournal()}>
                    <StoryJournalPanel />
                </div>
            )}
            {charCreateOpen && <CharacterCreation />}
        </>
    );
}
