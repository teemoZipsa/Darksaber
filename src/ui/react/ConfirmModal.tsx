/**
 * ConfirmModal — accessible, reusable confirmation dialog for the DOM overlay.
 *
 * Wraps the shared `.ds-modal` look with a focus-trapped `role="dialog"`,
 * Escape-to-cancel, and scrim-click-to-cancel. Destructive actions pass
 * `danger` to tint the confirm button and focus Cancel by default.
 */

import { useEffect, type ReactNode } from 'react';
import { t } from '../../i18n/LanguageManager';
import { AudioManager } from '../../engine/AudioManager';
import { useModalDialog } from './useModalDialog';

interface ConfirmModalProps {
    title: string;
    children?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmModal({
    title,
    children,
    confirmLabel,
    cancelLabel,
    danger = false,
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    const dialogRef = useModalDialog<HTMLDivElement>();

    const cancel = () => {
        AudioManager.playUi('ui.cancel');
        onCancel();
    };

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                cancel();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onCancel]);

    return (
        <div className="ds-modal" onClick={cancel}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                className="ds-modal__box"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="ds-modal__title">{title}</div>
                {children}
                <div className="ds-modal__btns">
                    <button
                        type="button"
                        className={`ds-btn is-active${danger ? ' ds-btn--danger' : ''}`}
                        {...(danger ? {} : { 'data-modal-initial-focus': true })}
                        onClick={onConfirm}
                    >
                        {confirmLabel ?? t('ui.confirm')}
                    </button>
                    <button
                        type="button"
                        className="ds-btn"
                        {...(danger ? { 'data-modal-initial-focus': true } : {})}
                        onClick={cancel}
                    >
                        {cancelLabel ?? t('ui.cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
}
