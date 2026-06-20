import { I18N_STRINGS, type Language } from './translations';

export type { Language } from './translations';

export const i18n = {
    lang: 'ko' as Language,
    strings: I18N_STRINGS,

    listeners: [] as (() => void)[],

    subscribe(cb: () => void) {
        this.listeners.push(cb);
    },

    notify() {
        this.listeners.forEach(cb => cb());
    },

    setLanguage(l: Language) {
        this.lang = l;
        this.notify();
    },

    toggleLanguage() {
        this.lang = this.lang === 'ko' ? 'en' : 'ko';
        this.notify();
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
