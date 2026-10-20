import React from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme/ThemeContext'
import { nextMode } from '../theme/theme'

const ICON = {
  dark: Moon,
  light: Sun,
  system: Monitor,
} as const

/**
 * One small control, one per surface, always top-right. It is a button rather
 * than a switch because the state has three values and clicking it performs an
 * action: the accessible name says both where you are and what happens next.
 */
export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { mode, cycle } = useTheme()
  const Icon = ICON[mode]
  const label = `Theme: ${mode} (switch to ${nextMode(mode)})`

  return (
    <>
      <button
        type="button"
        className={`theme-toggle${className ? ` ${className}` : ''}`}
        onClick={cycle}
        aria-label={label}
        title={label}
      >
        <Icon size={16} aria-hidden="true" />
      </button>
      {/* Changing a focused button's accessible name is not reliably announced;
          this live region is. It deliberately has no `role="status"`: that role
          is also used by success Callouts, and two status landmarks make
          `getByRole('status')` ambiguous for every consumer. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">{`Theme: ${mode}`}</span>
    </>
  )
}
