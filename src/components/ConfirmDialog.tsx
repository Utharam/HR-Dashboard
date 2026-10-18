import React, { useId } from 'react';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  isOpen: boolean;
  /** Asked as a question. Also the dialog's accessible name. */
  title: string;
  /** What is lost, stated plainly. A native confirmation prompt can never say this. */
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for anything irreversible; `primary` for a routine choice. */
  tone?: 'danger' | 'primary';
  /**
   * An optional THIRD outcome, rendered between Cancel and the confirm button.
   *
   * A dialog that has two destructive outcomes of different severity cannot express the
   * milder one as "cancel": routing a user who wanted to ADD to a register through the
   * Cancel button teaches them that cancelling means "no, and do not ask again", and the
   * first time it does they stop reading the dialog at all. Importing a roster is exactly
   * that case - replace or append - and append is what most people meant.
   */
  secondaryAction?: { label: string; onClick: () => void };
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The themed, keyboard-operable replacement for `window.confirm`.
 *
 * Three properties the native dialog could not provide:
 *   - Escape and a backdrop click are a REFUSAL, never an agreement. A key pressed to get
 *     out of a dialog must not be the one that deletes something.
 *   - The dialog is named by the question and shows the consequence as text, so the user
 *     decides with the same information the developer did.
 *   - Focus returns to the control that opened it, and Tab cannot leave the scrim.
 *
 * It does not close itself. `isOpen` belongs to the caller, which is what lets the same
 * component confirm a reset and confirm a single deletion.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  secondaryAction,
  onConfirm,
  onCancel,
}) => {
  // `useId` rather than a literal: this is a reusable primitive, and two instances open at
  // once must not end up pointing `aria-labelledby` or `aria-describedby` at the same element.
  const titleId = useId();
  const messageId = useId();

  return (
    <Dialog isOpen={isOpen} onClose={onCancel} labelledBy={titleId} describedBy={messageId}>
      <h2 id={titleId} className="omni-card-title" style={{ fontSize: 'var(--fs-2xl)' }}>
        {title}
      </h2>
      <p id={messageId} className="text-muted" style={{ marginTop: 'var(--space-3)' }}>
        {message}
      </p>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-6)',
          borderTop: '1px solid var(--border)',
          paddingTop: 'var(--space-4)',
        }}
      >
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          {cancelLabel}
        </button>
        {secondaryAction && (
          <button type="button" onClick={secondaryAction.onClick} className="btn btn-secondary">
            {secondaryAction.label}
          </button>
        )}
        <button
          type="button"
          onClick={onConfirm}
          className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
};
