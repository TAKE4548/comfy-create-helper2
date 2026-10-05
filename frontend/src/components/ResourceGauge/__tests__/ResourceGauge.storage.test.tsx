import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResourceGaugeChips } from '../ResourceGaugeChips'
import { ResourceGaugeHUD } from '../ResourceGaugeHUD'
import { useBrowserStorageUsage } from '../../../hooks/useBrowserStorageUsage'
import { useGenerationStore } from '../../../store/useGenerationStore'

vi.mock('../../../hooks/useBrowserStorageUsage', () => ({
  useBrowserStorageUsage: vi.fn(),
}))

vi.mock('../../../store/useGenerationStore', () => ({
  useGenerationStore: vi.fn(),
}))

const setFixtures = (
  storage: ReturnType<typeof useBrowserStorageUsage>,
  stats = {
    cpu_pct: 12,
    ram_pct: 56,
    gpu_pct: 34,
    vram_pct: 78,
    ram_used_gb: 5.6,
    ram_total_gb: 10,
    vram_used_gb: 7.8,
    vram_total_gb: 10,
  },
) => {
  vi.mocked(useBrowserStorageUsage).mockReturnValue(storage)
  vi.mocked(useGenerationStore).mockImplementation((selector: never) =>
    (selector as (state: { systemStats: typeof stats }) => typeof stats)({ systemStats: stats }),
  )
}

const usage = (localBytes: number, sessionBytes: number) => ({
  localStorage: { status: 'ok' as const, bytes: localBytes },
  sessionStorage: { status: 'ok' as const, bytes: sessionBytes },
})

describe('ResourceGauge storage display', () => {
  beforeEach(() => setFixtures(usage(2048, 0)))

  it('shows storage estimates, preserves hardware readings, and explains the estimate in the HUD', () => {
    render(<ResourceGaugeHUD />)

    expect(screen.getAllByText('12%')).toHaveLength(1)
    expect(screen.getAllByText('34%')).toHaveLength(1)
    expect(screen.getByText('5.6/10GB')).toBeInTheDocument()
    expect(screen.getByText('7.8/10GB')).toBeInTheDocument()
    expect(screen.getByText('localStorage')).toBeInTheDocument()
    expect(screen.getByText('2.0 KiB')).toBeInTheDocument()
    expect(screen.getByText('sessionStorage')).toBeInTheDocument()
    expect(screen.getByText('0.0 KiB')).toBeInTheDocument()
    expect(screen.getByText('localStorage').parentElement).toHaveTextContent('localStorage2.0 KiB')
    expect(screen.getByText('sessionStorage').parentElement).toHaveTextContent('sessionStorage0.0 KiB')

    const summary = screen.getByText('推定使用量の説明')
    expect(summary.tagName).toBe('SUMMARY')
    expect(summary).toHaveProperty('tabIndex', 0)
    fireEvent.click(summary)
    expect(screen.getByText(/現在のオリジン/)).toBeInTheDocument()
    expect(screen.getByText(/現在のタブ/)).toBeInTheDocument()
    expect(screen.getByText(/キーと値をUTF-16の各2 bytes/)).toBeInTheDocument()
  })

  it('shows each estimate in mobile chips, including unavailable values and no storage contents', () => {
    setFixtures({
      localStorage: { status: 'unavailable' },
      sessionStorage: { status: 'ok', bytes: 0 },
    })
    render(<ResourceGaugeChips />)

    expect(screen.getByText('CPU 12%')).toBeInTheDocument()
    expect(screen.getByText('RAM 56%')).toBeInTheDocument()
    expect(screen.getByText('GPU 34%')).toBeInTheDocument()
    expect(screen.getByText('VRAM 78%')).toBeInTheDocument()
    expect(screen.getByText('localStorage 取得不可')).toBeInTheDocument()
    expect(screen.getByText('sessionStorage 0.0 KiB')).toBeInTheDocument()
    expect(screen.getByText('推定使用量の説明')).toBeInTheDocument()
    expect(screen.queryByText(/secret|token|prompt/i)).not.toBeInTheDocument()
  })

  it('preserves unavailable and warning colors for hardware metrics', () => {
    setFixtures(usage(0, 0), {
      cpu_pct: 85,
      ram_pct: 95,
      gpu_pct: null,
      vram_pct: null,
      ram_used_gb: 9.5,
      ram_total_gb: 10,
      vram_used_gb: null,
      vram_total_gb: null,
    })
    render(<ResourceGaugeHUD />)

    expect(screen.getByText('CPU').parentElement).toHaveTextContent('85%')
    expect(screen.getByText('GPU').parentElement).toHaveTextContent('--')
    expect(screen.getByText('VRAM').parentElement).toHaveTextContent('--')
    expect(screen.getAllByText('85%').at(-1)).toHaveClass('text-amber-400')
    expect(screen.getAllByText('95%').at(-1)).toHaveClass('text-red-400')
    expect(screen.getByText('GPU').parentElement).toHaveTextContent('GPU--')
    expect(screen.getByText('VRAM').parentElement).toHaveTextContent('VRAM----')
  })
})
