import React, { useEffect, useRef } from 'react';

/**
 * The one place a modal is allowed to exist.
 *
 * Before this component, every modal in the app was a bare `<div className="modal-overlay">`
 * with no `role`, no Escape handler and no focus management. A keyboard user who opened one
 * kept their focus on the button *behind* the scrim and tabbed straight through the obscured
 * page, and closing the dialog dropped them wherever the browser happened to be.
 *
 * Everything a modal owes a keyboard user is therefore here, once:
 *   - it is announced as a modal dialog named by the heading passed in as `labelledBy`;
 *   - focus moves into it on open and returns to the opener on close or unmount;
 *   - Escape closes it, and Tab cycles inside it in both directions;
 *   - a click on the backdrop closes it, a click inside it does not.
 */

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** `id` of the element that names this dialog - normally its `<h2>`. */
  labelledBy: string;
  /** Extra classes for the window, e.g. a narrower variant for long single-column forms. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Candidates for the Tab cycle. Deliberately does NOT filter on rendered geometry: an
 * element is focusable because of what it is, and the negative `tabindex` / disabled
 * checks below are the ones that decide it. Visibility is left to the browser's own
 * layout, which this component cannot read.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]',
  '[tabindex]',
].join(',');

const focusableWithin = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.tabIndex >= 0 && !el.hasAttribute('disabled'),
  );

export const Dialog: React.FC<DialogProps> = ({ isOpen, onClose, labelledBy, className, children }) => {
  const windowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const win = windowRef.current;

    // Captured ONCE, here, while `document.activeElement` is still the control that opened
    // the dialog. Re-reading it on the way out would find the close button, or <body> after
    // the dialog was removed, and "restore focus" would restore it to nothing.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    win?.focus();

    // The scrim covers the viewport, so the page behind it must not scroll under it. The
    // previous value is captured rather than reset to '' so an outer lock survives.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      // Stopped so a nested dialog does not see one Escape and close both.
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key !== 'Tab') return;

    const win = windowRef.current;
    if (!win) return;

    const items = focusableWithin(win);
    const active = document.activeElement as HTMLElement | null;
    const onWindow = active === win;
    const outside = !active || !win.contains(active);

    if (items.length === 0) {
      // Nothing to move to. Letting the browser have the key would send focus to the page
      // behind the scrim, which is precisely what this component exists to prevent.
      e.preventDefault();
      win.focus();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];

    if (e.shiftKey) {
      // Wrapping backwards off the first control, or off the window itself (the state the
      // user is in the instant the dialog opens).
      if (active === first || onWindow || outside) {
        e.preventDefault();
        last.focus();
      }
      return;
    }

    // Wrapping forwards off the last control, or off the window itself.
    if (active === last || onWindow || outside) {
      e.preventDefault();
      first.focus();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only the scrim itself closes. Without the identity check a click anywhere inside the
    // dialog bubbles up and dismisses it, throwing away whatever was typed into it.
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
      <div
        ref={windowRef}
        className={className ? `modal-window ${className}` : 'modal-window'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
};
