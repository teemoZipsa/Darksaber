/** PartyTabs — one tab per active party member; click to switch the active one. */

import type { Character } from '../../../character/Character';
import { useStore } from '../UiContext';

export function PartyTabs({ party, activeIndex }: { party: Character[]; activeIndex: number }) {
    const store = useStore();
    if (party.length <= 1) return null;

    return (
        <div role="tablist" style={{ display: 'flex', gap: 6, padding: '0 16px 12px' }}>
            {party.map((char, i) => (
                <button
                    key={char.id}
                    type="button"
                    role="tab"
                    className="ds-btn"
                    aria-selected={i === activeIndex}
                    disabled={char.isDead}
                    onClick={() => store.switchTo(i)}
                    style={char.isDead ? { color: 'var(--ds-danger)', opacity: 0.6 } : undefined}
                >
                    {char.name}
                </button>
            ))}
        </div>
    );
}
