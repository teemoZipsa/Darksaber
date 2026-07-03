/**
 * Single source of truth for DOM-backed overlay open flags.
 *
 * GameManager owns the actual visibility bits. React and world-input guards use
 * this registry so new overlays do not need separate hand-maintained flag lists.
 */

export const OVERLAY_PANELS = [
    { id: 'char', signature: 'char', blocksWorld: true },
    { id: 'pause', signature: 'pause', blocksWorld: true },
    { id: 'settings', signature: 'settings', blocksWorld: true },
    { id: 'party', signature: 'party', blocksWorld: true },
    { id: 'town', signature: 'town', blocksWorld: true },
    { id: 'create', signature: 'create', blocksWorld: true },
    { id: 'inventory', signature: 'inventory', blocksWorld: true },
    { id: 'journal', signature: 'journal', blocksWorld: true },
    { id: 'magic', signature: 'magic', blocksWorld: true },
] as const;

export type OverlayPanelId = typeof OVERLAY_PANELS[number]['id'];
export type OverlayOpenState = Record<OverlayPanelId, boolean>;

export function createClosedOverlayState(): OverlayOpenState {
    return Object.fromEntries(OVERLAY_PANELS.map((panel) => [panel.id, false])) as OverlayOpenState;
}

export function overlayFlagsSignature(state: OverlayOpenState): string {
    return OVERLAY_PANELS
        .map((panel) => (state[panel.id] ? panel.signature : ''))
        .join(',');
}

export function hasBlockingOverlay(state: OverlayOpenState): boolean {
    return OVERLAY_PANELS.some((panel) => panel.blocksWorld && state[panel.id]);
}
