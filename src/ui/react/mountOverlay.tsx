/**
 * mountOverlay — boots the React DOM overlay into #ui-overlay and returns the
 * UiStore so GameManager can drive it with per-frame ticks.
 */

import { createRoot } from 'react-dom/client';
import type { GameManager } from '../../engine/GameManager';
import { UiStore } from './UiStore';
import { UiProvider } from './UiContext';
import { OverlayRoot } from './OverlayRoot';
import '../theme/darksaber-ui.css';

export function mountUiOverlay(gm: GameManager): UiStore {
    const el = document.getElementById('ui-overlay');
    if (!el) throw new Error('#ui-overlay element not found');

    const store = new UiStore(gm);
    const root = createRoot(el);
    root.render(
        <UiProvider store={store}>
            <OverlayRoot />
        </UiProvider>,
    );
    return store;
}
