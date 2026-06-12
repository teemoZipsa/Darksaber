import test from 'node:test';
import assert from 'node:assert/strict';
import { SettingsManager } from '../../src/engine/SettingsManager';
import { i18n, type Language } from '../../src/i18n/LanguageManager';

class MemoryStorage {
    private readonly values = new Map<string, string>();

    public getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    public setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

test('settings FPS limit label follows the active language', () => {
    const globalScope = globalThis as unknown as { localStorage?: unknown };
    const previousStorage = Object.getOwnPropertyDescriptor(globalScope, 'localStorage');
    const previousLang: Language = i18n.lang;
    Object.defineProperty(globalScope, 'localStorage', {
        configurable: true,
        value: new MemoryStorage(),
    });

    try {
        SettingsManager.setFPSLimit(0);
        i18n.lang = 'ko';
        assert.equal(SettingsManager.getFPSLimitLabel(), '무제한');
        i18n.lang = 'en';
        assert.equal(SettingsManager.getFPSLimitLabel(), 'Unlimited');
    } finally {
        i18n.lang = previousLang;
        if (previousStorage) Object.defineProperty(globalScope, 'localStorage', previousStorage);
        else Reflect.deleteProperty(globalScope, 'localStorage');
    }
});
