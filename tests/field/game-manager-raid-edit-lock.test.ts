import assert from 'node:assert/strict';
import test from 'node:test';
import { GameManager } from '../../src/engine/GameManager';
import { i18n } from '../../src/i18n/LanguageManager';

interface VisibilityToggle {
    isVisible(): boolean;
    toggle(): void;
}

interface RaidEditLockHarness {
    networkAuthContext: { accessToken: string; characterId: string } | null;
    worldEngine: {
        isRaidLifecycleActive(): boolean;
        addSystemLog(message: string): void;
    };
    partyUI: VisibilityToggle;
    inventoryUI: VisibilityToggle;
    charUI: VisibilityToggle;
    magicLoadoutOpen: boolean;
    isRaidPreparationEditingLocked(): boolean;
    togglePartyPanel(): void;
    toggleMagicLoadout(): void;
}

function visibility(initiallyVisible = false): VisibilityToggle & { toggleCount: number } {
    let visible = initiallyVisible;
    return {
        toggleCount: 0,
        isVisible: () => visible,
        toggle() {
            visible = !visible;
            this.toggleCount += 1;
        },
    };
}

function createHarness(options: {
    authenticated?: boolean;
    raidLifecycleActive?: boolean;
    partyVisible?: boolean;
    magicVisible?: boolean;
} = {}): RaidEditLockHarness & { logs: string[] } {
    const manager = Object.create(GameManager.prototype) as RaidEditLockHarness & { logs: string[] };
    manager.logs = [];
    manager.networkAuthContext = options.authenticated === false
        ? null
        : { accessToken: 'token', characterId: 'hero' };
    manager.worldEngine = {
        isRaidLifecycleActive: () => options.raidLifecycleActive !== false,
        addSystemLog: (message) => manager.logs.push(message),
    };
    manager.partyUI = visibility(options.partyVisible);
    manager.inventoryUI = visibility();
    manager.charUI = visibility();
    manager.magicLoadoutOpen = options.magicVisible === true;
    return manager;
}

test('authoritative raid editing stays locked across the full raid lifecycle', () => {
    const finalizing = createHarness({ authenticated: true, raidLifecycleActive: true });
    assert.equal(finalizing.isRaidPreparationEditingLocked(), true);

    const hub = createHarness({ authenticated: true, raidLifecycleActive: false });
    assert.equal(hub.isRaidPreparationEditingLocked(), false);

    const localDevRaid = createHarness({ authenticated: false, raidLifecycleActive: true });
    assert.equal(localDevRaid.isRaidPreparationEditingLocked(), false);
});

test('party and magic panels refuse new entry during an authoritative raid', () => {
    const previousLanguage = i18n.lang;
    i18n.lang = 'en';
    try {
        const manager = createHarness();

        manager.togglePartyPanel();
        manager.toggleMagicLoadout();

        assert.equal(manager.partyUI.isVisible(), false);
        assert.equal(manager.magicLoadoutOpen, false);
        assert.deepEqual(manager.logs, [
            'Party formation, equipment, sockets, and magic settings cannot be changed during a server raid.',
            'Party formation, equipment, sockets, and magic settings cannot be changed during a server raid.',
        ]);
    } finally {
        i18n.lang = previousLanguage;
    }
});

test('an already-open edit panel can still be closed after the raid lock engages', () => {
    const party = createHarness({ partyVisible: true });
    party.togglePartyPanel();
    assert.equal(party.partyUI.isVisible(), false);
    assert.deepEqual(party.logs, []);

    const magic = createHarness({ magicVisible: true });
    magic.toggleMagicLoadout();
    assert.equal(magic.magicLoadoutOpen, false);
    assert.deepEqual(magic.logs, []);
});

test('local DEV raids retain party and magic panel access', () => {
    const manager = createHarness({ authenticated: false });

    manager.togglePartyPanel();
    assert.equal(manager.partyUI.isVisible(), true);
    manager.togglePartyPanel();
    manager.toggleMagicLoadout();

    assert.equal(manager.magicLoadoutOpen, true);
    assert.deepEqual(manager.logs, []);
});
