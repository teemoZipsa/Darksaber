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
