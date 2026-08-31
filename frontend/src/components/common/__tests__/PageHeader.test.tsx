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
    const flexWrapContainers = container.querySelectorAll('.flex-wrap')
    expect(flexWrapContainers.length).toBeGreaterThanOrEqual(1)
  })
})
