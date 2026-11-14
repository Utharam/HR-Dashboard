import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Header } from '../Header'
import { ThemeProvider } from '../../theme/ThemeContext'

beforeEach(() => localStorage.clear())

/**
 * The slim header (design decision D1) owns exactly one control cluster: the
 * theme toggle. These tests pin that the toggle keeps its place in it - the
 * sign-out test that used to live here moved to AdminSection.test.tsx with the
 * control itself, which now lives on the Admin & Settings page.
 */
describe('console theme integration', () => {
  it('puts the theme control in the header action row', () => {
    const { container } = render(
      <ThemeProvider>
        <Header activeTab="overview" onToggleNav={() => {}} navOpen={false} />
      </ThemeProvider>,
    )
    // Last in the cluster, not merely present on the page: the toggle belongs
    // to the action row wherever that row wraps to.
    expect(container.querySelector('.page-actions')).toContainElement(
      screen.getByRole('button', { name: /theme:/i }),
    )
  })
})
