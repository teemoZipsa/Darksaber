/**
 * ChangelogPanel — renders the release history for the Settings → Updates tab.
 * Entries come from `src/data/changelog.ts`; all visible copy resolves through
 * the shared translation table.
 */

import { t } from '../../../i18n/LanguageManager';
import { CHANGELOG } from '../../../data/changelog';

export function ChangelogPanel() {
    return (
        <div className="ds-changelog">
            {CHANGELOG.map((entry) => {
                return (
                    <div key={entry.version} className="ds-changelog__entry">
                        <div className="ds-changelog__head">
                            <span className="ds-changelog__version">v{entry.version}</span>
                            <span className="ds-changelog__date">{entry.date}</span>
                        </div>
                        <ul className="ds-changelog__list">
                            {entry.itemKeys.map((key) => <li key={key}>{t(key)}</li>)}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
}
