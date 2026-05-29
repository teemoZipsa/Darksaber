/**
 * UiContext — React glue for the UiStore.
 *
 * Two subscription hooks:
 *  - useUiSelector: re-renders only when the selected value changes (by equality).
 *    Use for cheap flags like "is the panel open" so closed UI doesn't re-render
 *    every frame.
 *  - useUiVersion: re-renders every frame tick. Use inside an open panel whose
 *    content reflects in-place-mutating game state (HP/MP/EXP change on the same
 *    object, so reference-equality selectors would miss them).
 */

import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { UiStore } from './UiStore';

const StoreContext = createContext<UiStore | null>(null);

export function UiProvider({ store, children }: { store: UiStore; children: ReactNode }) {
    return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): UiStore {
    const store = useContext(StoreContext);
    if (!store) throw new Error('UiStore is not provided (missing <UiProvider>)');
    return store;
}

/**
 * Subscribe to a derived slice of store state. The component only re-renders when
 * `isEqual(prev, next)` is false (default: Object.is). Implements the memoization
 * that useSyncExternalStoreWithSelector would provide, without the extra dependency.
 */
export function useUiSelector<T>(
    selector: (store: UiStore) => T,
    isEqual: (a: T, b: T) => boolean = Object.is,
): T {
    const store = useStore();
    const lastVersion = useRef(-1);
    const lastValue = useRef<T>(undefined as T);
    const hasValue = useRef(false);

    const getSnapshot = (): T => {
        const version = store.getVersion();
        if (hasValue.current && version === lastVersion.current) {
            return lastValue.current;
        }
        lastVersion.current = version;
        const next = selector(store);
        if (hasValue.current && isEqual(lastValue.current, next)) {
            return lastValue.current; // keep stable reference → no re-render
        }
        lastValue.current = next;
        hasValue.current = true;
        return next;
    };

    return useSyncExternalStore(store.subscribe, getSnapshot);
}

/** Subscribe to the raw frame counter — re-renders on every tick while mounted. */
export function useUiVersion(): number {
    const store = useStore();
    return useSyncExternalStore(store.subscribe, store.getVersion);
}
