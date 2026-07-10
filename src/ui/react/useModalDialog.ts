import { useLayoutEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
    '[data-modal-initial-focus]',
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

/** Gives a blocking panel initial focus, a contained Tab order, and focus restoration. */
export function useModalDialog<T extends HTMLElement>(active = true) {
    const rootRef = useRef<T>(null);

    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!active || !root) return;

        const previouslyFocused = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const initialFocus = getFocusableElements(root)[0] ?? root;
        initialFocus.focus({ preventScroll: true });

        const trapTab = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') return;
            const focusable = getFocusableElements(root);
            if (focusable.length === 0) {
                event.preventDefault();
                root.focus({ preventScroll: true });
                return;
            }

            const first = focusable[0]!;
            const last = focusable[focusable.length - 1]!;
            const activeElement = document.activeElement;
            if (event.shiftKey && (activeElement === root || activeElement === first || !root.contains(activeElement))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (activeElement === root || activeElement === last || !root.contains(activeElement))) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', trapTab, true);
        return () => {
            document.removeEventListener('keydown', trapTab, true);
            if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
        };
    }, [active]);

    return rootRef;
}
