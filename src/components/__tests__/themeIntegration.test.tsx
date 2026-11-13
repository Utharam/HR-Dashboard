import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Header } from '../Header'
import { Sidebar } from '../Sidebar'
import { ThemeProvider } from '../../theme/ThemeContext'
import { INITIAL_DEPARTMENTS } from '../../data/initialData'

beforeEach(() => localStorage.clear())
const noop = () => {}

describe('console theme integration', () => {
  it('puts the theme control in the header action row', () => {
    const { container } = render(<ThemeProvider><Header activeTab="overview" searchQuery="" setSearchQuery={noop} selectedDept="ALL"
      setSelectedDept={noop} selectedLocation="ALL" setSelectedLocation={noop}
      departments={INITIAL_DEPARTMENTS} locations={['Bengaluru HQ']} onOpenAddModal={noop}
      onNavigateToExcel={noop} onToggleNav={noop} navOpen={false} /></ThemeProvider>)
    // Last in the cluster, not merely present on the page: the toggle belongs
    // to the action row wherever that row wraps to.
    expect(container.querySelector('.page-actions')).toContainElement(
      screen.getByRole('button', { name: /theme:/i }),
    )
  })

  it('offers sign out only when the console is hosted by a session', async () => {
    const onSignOut = vi.fn()
    const { rerender } = render(<Sidebar activeTab="overview" setActiveTab={noop} onExportExcel={noop} onResetData={noop} />)
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
    rerender(<Sidebar activeTab="overview" setActiveTab={noop} onExportExcel={noop} onResetData={noop} onSignOut={onSignOut} />)
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })
})
