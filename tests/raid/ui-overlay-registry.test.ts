import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createClosedOverlayState,
    hasBlockingOverlay,
    overlayFlagsSignature,
    OVERLAY_PANELS,
    type OverlayOpenState,
} from '../../src/ui/react/OverlayRegistry';

test('overlay registry exposes every DOM overlay in the signature order', () => {
    const closed = createClosedOverlayState();

    assert.equal(Object.keys(closed).length, OVERLAY_PANELS.length);
    assert.equal(hasBlockingOverlay(closed), false);

    for (const panel of OVERLAY_PANELS) {
        const state: OverlayOpenState = { ...closed, [panel.id]: true };
        const signatureParts = overlayFlagsSignature(state).split(',');

        assert.equal(signatureParts.length, OVERLAY_PANELS.length);
        assert.equal(signatureParts[OVERLAY_PANELS.indexOf(panel)], panel.signature);
        assert.equal(hasBlockingOverlay(state), panel.blocksWorld);
    }
});
