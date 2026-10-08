import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CollapsibleSection } from '../CollapsibleSection'

describe('CollapsibleSection', () => {
  it('renders title, badge and default open content', () => {
    render(
      <CollapsibleSection
        title="Test Section"
        badge=<span data-testid="test-badge">Badge</span>
        id="test-sec"
        defaultOpen={true}
      >
        <div data-testid="test-content">Section Content</div>
      </CollapsibleSection>
    )

    expect(screen.getByText('Test Section')).toBeInTheDocument()
    expect(screen.getByTestId('test-badge')).toBeInTheDocument()
    expect(screen.getByTestId('test-content')).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: /Test Section/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('toggles visibility and aria-expanded on button click', () => {
    render(
      <CollapsibleSection
        title="Toggle Section"
        id="toggle-sec"
        defaultOpen={false}
      >
        <div data-testid="toggle-content">Toggle Content</div>
      </CollapsibleSection>
    )

    const trigger = screen.getByRole('button', { name: /Toggle Section/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('toggle-content')).not.toBeInTheDocument()

    // Open
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('toggle-content')).toBeInTheDocument()

    // Close
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('toggle-content')).not.toBeInTheDocument()
  })

})
