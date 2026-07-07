import test from 'node:test';
import assert from 'node:assert/strict';
import { SettingsManager } from '../../src/engine/SettingsManager';

class MemoryStorage {
    private readonly values = new Map<string, string>();
    public get length(): number { return this.values.size; }
    public getItem(key: string): string | null { return this.values.get(key) ?? null; }
    public setItem(key: string, value: string): void { this.values.set(key, value); }
    public removeItem(key: string): void { this.values.delete(key); }
    public clear(): void { this.values.clear(); }
    public key(index: number): string | null { return Array.from(this.values.keys())[index] ?? null; }
}

class ThrowingStorage {
    public get length(): number { throw new Error('storage blocked'); }
    public getItem(_key: string): string | null { throw new Error('storage blocked'); }
    public setItem(_key: string, _value: string): void { throw new Error('storage blocked'); }
    public removeItem(_key: string): void { throw new Error('storage blocked'); }
    public clear(): void { throw new Error('storage blocked'); }
    public key(_index: number): string | null { throw new Error('storage blocked'); }
}

const storage = new MemoryStorage();
(globalThis as unknown as { localStorage: Storage }).localStorage = storage as unknown as Storage;

test('settings keybindings default action menu to qwer/asdf order', () => {
    storage.clear();
    SettingsManager.init();

    assert.equal(SettingsManager.getKeybinding('action.move'), 'KeyQ');
    assert.equal(SettingsManager.getKeybinding('action.tool'), 'KeyW');
    assert.equal(SettingsManager.getKeybinding('action.attack'), 'KeyE');
    assert.equal(SettingsManager.getKeybinding('action.magic'), 'KeyR');
    assert.equal(SettingsManager.getKeybinding('action.defend'), 'KeyA');
    assert.equal(SettingsManager.getKeybinding('action.rest'), 'KeyS');
    assert.equal(SettingsManager.getKeybinding('action.fanfare'), 'KeyD');
    assert.equal(SettingsManager.getKeybinding('action.open'), 'KeyF');
});

test('settings keybindings swap conflicting keys and ignore reserved keys', () => {
    storage.clear();
    SettingsManager.init();

    SettingsManager.setKeybinding('world.inventory', 'KeyP');
    assert.equal(SettingsManager.getKeybinding('world.inventory'), 'KeyP');
    assert.equal(SettingsManager.getKeybinding('world.party'), 'KeyI');

    SettingsManager.setKeybinding('world.inventory', 'Escape');
    assert.equal(SettingsManager.getKeybinding('world.inventory'), 'KeyP');

    SettingsManager.resetKeybindings();
    assert.equal(SettingsManager.getKeybinding('world.inventory'), 'KeyI');
    assert.equal(SettingsManager.getKeybinding('world.party'), 'KeyP');
});

test('settings manager tolerates blocked localStorage', () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = new ThrowingStorage() as unknown as Storage;
    try {
        assert.doesNotThrow(() => SettingsManager.init());
        assert.doesNotThrow(() => SettingsManager.setGrid(true));
        assert.doesNotThrow(() => SettingsManager.setBgmVolume(0.25));
        assert.doesNotThrow(() => SettingsManager.setKeybinding('world.inventory', 'KeyP'));
        assert.equal(SettingsManager.getGrid(), true);
        assert.equal(SettingsManager.getBgmVolume(), 0.25);
        assert.equal(SettingsManager.getKeybinding('world.inventory'), 'KeyP');
    } finally {
        (globalThis as unknown as { localStorage: Storage }).localStorage = storage as unknown as Storage;
        storage.clear();
        SettingsManager.init();
    }
});
