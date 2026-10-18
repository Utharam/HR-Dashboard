import React from 'react';
import { X } from 'lucide-react';

export type CalloutTone = 'success' | 'danger' | 'warning' | 'info';

export interface CalloutProps {
  tone: CalloutTone;
  children: React.ReactNode;
  onDismiss?: () => void;
  action?: { label: string; onClick: () => void };
}

/**
 * Colour comes from the `--tone-*` custom properties behind `.tone-*` in index.css, the
 * same way the persistence banner in App does it. No inline hex, no new tokens.
 */
const TONE_CLASS: Record<CalloutTone, string> = {
  success: 'tone-success',
  danger: 'tone-danger',
  warning: 'tone-warning',
  info: 'tone-info',
};

/**
 * An inline, non-blocking message. This is what replaced `window.alert`: the same
 * information, still visible long enough to read, dismissible, and carrying whatever
 * follow-up action the situation offers.
 *
 * Announced politely for `success` and assertively for the rest. Good news does not need
 * to cut across whatever the screen reader is currently saying; a warning that a change was
 * NOT saved does.
 */
export const Callout: React.FC<CalloutProps> = ({ tone, children, onDismiss, action }) => (
  <div className={`alert ${TONE_CLASS[tone]}`} role={tone === 'success' ? 'status' : 'alert'}>
    <div className="section-stack" style={{ flex: 1 }}>
      {children}
    </div>

    {action && (
      <button type="button" className="btn btn-sm" onClick={action.onClick}>
        {action.label}
      </button>
    )}

    {onDismiss && (
      <button type="button" className="btn btn-sm" onClick={onDismiss} aria-label="Dismiss this message">
        <X size={14} aria-hidden="true" />
        Dismiss
      </button>
    )}
  </div>
);
