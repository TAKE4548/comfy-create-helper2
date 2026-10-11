import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Clock } from 'lucide-react'
import { PageHeader } from '../PageHeader'

describe('Common PageHeader component', () => {
  it('renders title, icon, and badge properly', () => {
    render(
      <PageHeader
        title="History"
        icon={Clock}
        badge={<span data-testid="test-badge">Badge</span>}
      />
    )
    expect(screen.getByText('History')).toBeDefined()
    expect(screen.getByTestId('test-badge')).toBeDefined()
  })

  it('renders actions and children with responsive classes', () => {
    const { container } = render(
      <PageHeader
        title="History"
        actions={<button>Action Button</button>}
      >
        <div data-testid="child-filter">Filter Bar</div>
      </PageHeader>
    )
    expect(screen.getByText('Action Button')).toBeDefined()
    expect(screen.getByTestId('child-filter')).toBeDefined()
    const row = container.querySelector('.min-h-\\[50px\\]')
    expect(row).not.toBeNull()
  })

  it('renders right cluster with ResourceHoverMonitor and HeaderKebabMenu exactly once unless hideRightCluster is true', () => {
    const { unmount } = render(
      <PageHeader title="Workflows" />
    )
    expect(screen.getAllByTestId('resource-hover-monitor')).toHaveLength(1)
    expect(screen.getAllByTestId('header-kebab-menu-button')).toHaveLength(1)
    unmount()

    render(
      <PageHeader title="Workflows" hideRightCluster />
    )
    expect(screen.queryByTestId('resource-hover-monitor')).toBeNull()
    expect(screen.queryByTestId('header-kebab-menu-button')).toBeNull()
  })

  it('provides responsive single layout with scrollable actions wrapper', () => {
    const { container } = render(
      <PageHeader
        title="Generations"
        actions={<button>Generate</button>}
      />
    )
    const row = container.querySelector('.flex.flex-wrap.md\\:flex-nowrap')
    expect(row).not.toBeNull()

    const scrollRow = container.querySelector('.overflow-x-auto')
    expect(scrollRow).not.toBeNull()
    expect(screen.getAllByText('Generate')).toHaveLength(1)
  })
})
