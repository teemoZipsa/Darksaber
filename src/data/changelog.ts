/**
 * Changelog data for the Settings → Updates tab.
 *
 * Entries are ordered newest-first (index 0 is the current build). User-facing
 * copy is stored as translation keys so every line follows the same `t()` path as
 * the rest of the UI. Add a new object at the top for each release and bump
 * `version`.
 */

export interface ChangelogEntry {
    version: string;
    /** ISO date (YYYY-MM-DD) shown next to the version. */
    date: string;
    itemKeys: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
    {
        version: '0.1.1',
        date: '2026-07-20',
        itemKeys: [
            'changelog.0_1_1.settingsUpdates',
            'changelog.0_1_1.confirmDialogs',
            'changelog.0_1_1.confirmActions',
            'changelog.0_1_1.keyboardAccess',
            'changelog.0_1_1.reduceMotion',
            'changelog.0_1_1.localization',
            'changelog.0_1_1.responsiveStates',
        ],
    },
    {
        version: '0.1.0',
        date: '2026-06-04',
        itemKeys: [
            'changelog.0_1_0.overlayMigration',
            'changelog.0_1_0.domPanels',
        ],
    },
];

/** Version of the current (top) changelog entry, used for the "new updates" badge. */
export const CURRENT_VERSION = CHANGELOG[0]?.version ?? '0.0.0';
