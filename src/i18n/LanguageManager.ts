import { I18N_STRINGS, type Language } from './translations';

export type { Language } from './translations';

const LANGUAGE_STORAGE_KEY = 'setting_language';

function isLanguage(value: string | null): value is Language {
    return value === 'ko' || value === 'en';
}

function readSavedLanguage(): Language {
    try {
        const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        return isLanguage(saved) ? saved : 'ko';
    } catch {
        return 'ko';
    }
}

function persistLanguage(language: Language): void {
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
        // Language still changes for the current session when storage is unavailable.
    }
}

function syncDocumentLanguage(language: Language): void {
    if (typeof document !== 'undefined') document.documentElement.lang = language;
}

export const i18n = {
    lang: 'ko' as Language,
    strings: I18N_STRINGS,

    listeners: [] as (() => void)[],

    init() {
        this.lang = readSavedLanguage();
        syncDocumentLanguage(this.lang);
    },

    subscribe(cb: () => void) {
        this.listeners.push(cb);
    },

    notify() {
        this.listeners.forEach(cb => cb());
    },

    setLanguage(l: Language) {
        this.lang = l;
        persistLanguage(l);
        syncDocumentLanguage(l);
        this.notify();
    },

    toggleLanguage() {
        this.setLanguage(this.lang === 'ko' ? 'en' : 'ko');
    },

    t(key: string): string {
        const dict = this.strings[this.lang] as Record<string, string>;
        return dict[key] || key;
    },

    format(key: string, vars: Record<string, string | number>): string {
        return this.t(key).replace(/\{(\w+)\}/g, (_, name: string) => {
            const value = vars[name];
            return value === undefined ? `{${name}}` : String(value);
        });
    }
};

export function t(key: string): string {
    return i18n.t(key);
}

export function formatT(key: string, vars: Record<string, string | number>): string {
    return i18n.format(key, vars);
}
