import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { ResourceHoverMonitor } from '../ResourceHoverMonitor'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import type { SystemStats } from '../../../../store/types'

const mockStats: SystemStats = {
  cpu_pct: 35.4,
  ram_pct: 62.1,
  ram_used_gb: 9.8,
  ram_total_gb: 16.0,
  gpu_pct: 45.0,
  vram_pct: 78.5,
  vram_used_gb: 6.3,
  vram_total_gb: 8.0,
  ts: 1234567890,
}

describe('ResourceHoverMonitor', () => {
  beforeEach(() => {
    useGenerationStore.setState({ systemStats: mockStats })
  })

  it('renders chips in strict order CPU -> RAM -> GPU -> VRAM on desktop', () => {
    const { container } = render(<ResourceHoverMonitor />)
    const chipsContainer = container.querySelector('.hidden.sm\\:flex')
    expect(chipsContainer).toBeTruthy()
    const text = chipsContainer?.textContent ?? ''
    
    const cpuIdx = text.indexOf('CPU')
    const ramIdx = text.indexOf('RAM')
    const gpuIdx = text.indexOf('GPU')
    const vramIdx = text.indexOf('VRAM')

    expect(cpuIdx).toBeGreaterThanOrEqual(0)
    expect(ramIdx).toBeGreaterThan(cpuIdx)
    expect(gpuIdx).toBeGreaterThan(ramIdx)
    expect(vramIdx).toBeGreaterThan(gpuIdx)
  })

  it('applies purple accent styling to VRAM chip', () => {
    const { container } = render(<ResourceHoverMonitor />)
    const chips = container.querySelectorAll('.hidden.sm\\:flex > span')
    expect(chips.length).toBe(4)
    const vramChip = chips[3]
    expect(vramChip.textContent).toContain('VRAM')
    expect(vramChip.className).toContain('text-purple-400')
  })

  it('expands 250px HoverCard on mouse enter and hides on mouse leave', () => {
    render(<ResourceHoverMonitor />)
    const monitor = screen.getByTestId('resource-hover-monitor')

    expect(screen.queryByTestId('resource-hover-card')).toBeNull()

    fireEvent.mouseEnter(monitor)
    const hoverCard = screen.getByTestId('resource-hover-card')
    expect(hoverCard).toBeTruthy()
    expect(hoverCard.className).toContain('w-[250px]')
    expect(hoverCard.textContent).toContain('6.3 / 8.0 GB')
    expect(hoverCard.textContent).toContain('9.8 / 16.0 GB')

    fireEvent.mouseLeave(monitor)
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()
  })

  it('safely handles null telemetry with fallback placeholders (RT-1)', () => {
    useGenerationStore.setState({ systemStats: null })
    render(<ResourceHoverMonitor />)
    const monitor = screen.getByTestId('resource-hover-monitor')

    const pill = screen.getByTestId('mobile-vram-pill')
    expect(pill.textContent).toContain('VRAM --%')
    expect(pill.textContent).toContain('◀')

    fireEvent.mouseEnter(monitor)
    const hoverCard = screen.getByTestId('resource-hover-card')
    expect(hoverCard.textContent).toContain('-- / -- GB')
    expect(hoverCard.textContent).toContain('--%')
  })

  it('renders mobile collapsed pill with 96px width and VRAM percentage', () => {
    render(<ResourceHoverMonitor />)
    const pill = screen.getByTestId('mobile-vram-pill')
    expect(pill.className).toContain('w-[96px]')
    expect(pill.textContent).toContain('VRAM 79%')
    expect(pill.textContent).toContain('◀')
  })

  it('expands mobile pill to 330px overlay with z-80 and all resources on click (AC-8)', () => {
    render(<ResourceHoverMonitor />)
    const pill = screen.getByTestId('mobile-vram-pill')
    fireEvent.click(pill)

    const overlay = screen.getByTestId('mobile-resource-overlay')
    expect(overlay).toBeTruthy()
    expect(overlay.className).toContain('w-[330px]')
    expect(overlay.className).toContain('z-[80]')
    expect(overlay.textContent).toContain('CPU 35%')
    expect(overlay.textContent).toContain('RAM 9.8G')
    expect(overlay.textContent).toContain('GPU 45%')
    expect(overlay.textContent).toContain('VRAM 6.3G')

    const closeBtn = screen.getByTestId('mobile-overlay-close')
    fireEvent.click(closeBtn)
    expect(screen.queryByTestId('mobile-resource-overlay')).toBeNull()
    expect(screen.getByTestId('mobile-vram-pill')).toBeTruthy()
  })
})