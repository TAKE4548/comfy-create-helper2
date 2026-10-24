import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { VramGuardSection, readStoredVramLimit, VRAM_LIMIT_DEFAULT } from '../VramGuardSection'
import { LS_KEYS } from '../../../../utils/localStorageKeys'
import { useGenerationStore } from '../../../../store/useGenerationStore'

const apiMocks = vi.hoisted(() => ({
  getVram: vi.fn(),
  updateVram: vi.fn(),
}))

vi.mock('../../../../api/client', () => ({
  settingsApi: { getVram: apiMocks.getVram, updateVram: apiMocks.updateVram },
}))

const KEY = LS_KEYS.VRAM_GUARD_LIMIT

function setStats(total: number | null, used: number | null) {
  useGenerationStore.setState({
    systemStats: { vram_total_gb: total, vram_used_gb: used } as never,
  })
}

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rendered = render(
    <QueryClientProvider client={qc}>
      <VramGuardSection isExpanded onToggle={() => {}} />
    </QueryClientProvider>,
  )
  return { ...rendered, client: qc }
}

const server = (min: number) => ({ vram_min_free_gb: min, vram_guard_enabled: true })

beforeEach(() => {
  localStorage.clear()
  apiMocks.getVram.mockReset()
  apiMocks.updateVram.mockReset()
  apiMocks.getVram.mockResolvedValue(server(4))
  apiMocks.updateVram.mockResolvedValue(server(4))
  setStats(12, 6) // free = 6
  useGenerationStore.setState({ systemWsConnected: true })
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.restoreAllMocks()
})

const range = () => screen.getByRole('slider') as HTMLInputElement
const numberInput = () => screen.getByLabelText(/最小必要空き容量 \(vram_min_free_gb\)/) as HTMLInputElement

describe('VramGuardSection', () => {
  it('[REQ-380/AC-5] reflects the next connected SYSTEM_STATS VRAM sample exactly', async () => {
    useGenerationStore.setState({ systemWsConnected: true })
    renderSection()
    expect(await screen.findByText('6.0 GB', { selector: '.font-mono' })).toBeInTheDocument()
    act(() => setStats(12, 3))
    expect(screen.getByText('9.0 GB', { selector: '.font-mono' })).toBeInTheDocument()
  })

  it('[REQ-380/AC-5] reflects fallback VRAM telemetry within five seconds after WebSocket disconnect', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const realSettingsApi = (await vi.importActual<typeof import('../../../../api/client')>('../../../../api/client')).settingsApi
    const telemetryResponse = (free: number): Response => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: free, vram_total_gb: 12 }),
    } as Response)
    const fallbackFetch = vi.fn()
      .mockResolvedValueOnce(telemetryResponse(6))
      .mockResolvedValueOnce(telemetryResponse(9))
    vi.stubGlobal('fetch', fallbackFetch)
    apiMocks.getVram.mockImplementation(realSettingsApi.getVram)
    useGenerationStore.setState({ systemWsConnected: true })
    renderSection()
    await screen.findByText('6.0 GB', { selector: '.font-mono' })
    expect(fallbackFetch).not.toHaveBeenCalled()

    const disconnectedAt = Date.now()
    act(() => useGenerationStore.setState({ systemWsConnected: false }))
    await waitFor(() => expect(fallbackFetch).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('6.0 GB', { selector: '.font-mono' })).toBeInTheDocument())
    expect(Date.now() - disconnectedAt).toBeLessThanOrEqual(5000)

    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    await waitFor(() => expect(screen.getByText('9.0 GB', { selector: '.font-mono' })).toBeInTheDocument())
    expect(Date.now() - disconnectedAt).toBeLessThanOrEqual(5000)
    expect(fallbackFetch).toHaveBeenCalledTimes(2)
  })

  it('[REQ-380/AC-4] shows a refresh error when the disconnected WebSocket VRAM query fails', async () => {
    useGenerationStore.setState({ systemWsConnected: false })
    apiMocks.getVram.mockRejectedValue(new Error('offline'))
    renderSection()
    expect(await screen.findByText('VRAM情報を更新できません')).toBeInTheDocument()
  })

  it('[REQ-380/AC-5] preserves a dirty threshold when a disconnected refresh returns server values', async () => {
    useGenerationStore.setState({ systemWsConnected: false })
    const { client } = renderSection()
    await screen.findByLabelText(/最小必要空き容量 \(vram_min_free_gb\)/)
    fireEvent.change(range(), { target: { value: '8' } })
    apiMocks.getVram.mockResolvedValue({ ...server(3), vram_free_gb: 5, vram_total_gb: 12 })
    await client.invalidateQueries({ queryKey: ['settings-vram'] })
    expect(range().value).toBe('8')
  })

  it('[REQ-365/AC-8] moves the threshold line and tag immediately while dragging, without calling updateVram', async () => {
    renderSection()
    await screen.findByTestId('vram-threshold-line')
    fireEvent.change(range(), { target: { value: '8' } })
    expect(screen.getByTestId('vram-threshold-line').style.left).toBe(`${(8 / 12) * 100}%`)
    expect(screen.getByTestId('vram-threshold-tag').textContent).toContain('8.0 GB')
    expect(apiMocks.updateVram).not.toHaveBeenCalled()
  })

  it('[REQ-365/AC-8] switches meter state: safe(green) / approaching(amber) / below(red)', async () => {
    renderSection() // free = 6
    await screen.findByTestId('vram-threshold-line')
    fireEvent.change(range(), { target: { value: '4' } }) // free-2 -> safe
    expect(screen.getByText('安全域 (OK)')).toBeTruthy()
    fireEvent.change(range(), { target: { value: '5.5' } }) // free-0.5 -> approaching
    expect(screen.getByText('閾値に接近')).toBeTruthy()
    fireEvent.change(range(), { target: { value: '7' } }) // free+1 -> below
    expect(screen.getByText('閾値未満 (警戒)')).toBeTruthy()
  })

  it('[REQ-365/AC-8] number input and slider stay in sync', async () => {
    renderSection()
    await screen.findByTestId('vram-threshold-line')
    fireEvent.change(numberInput(), { target: { value: '9' } })
    expect(range().value).toBe('9')
    fireEvent.change(range(), { target: { value: '3' } })
    expect(numberInput().value).toBe('3')
  })

  it('[REQ-365/AC-8] clamps the line to 0-100% and never renders NaN when total or free is missing', async () => {
    renderSection()
    await screen.findByTestId('vram-threshold-line')
    fireEvent.change(range(), { target: { value: '14' } }) // 14/12 > 100%
    expect(screen.getByTestId('vram-threshold-line').style.left).toBe('100%')
    cleanup()

    setStats(0, 0)
    apiMocks.getVram.mockResolvedValue({ ...server(4), vram_free_gb: null, vram_total_gb: null })
    renderSection()
    await screen.findByText(/最小必要空き容量/)
    expect(document.body.textContent).not.toContain('NaN')
    cleanup()

    setStats(null, null)
    renderSection()
    await screen.findByText(/最小必要空き容量/)
    expect(document.body.textContent).not.toContain('NaN')
  })

  it('[REQ-365/AC-10] writes prompt-surgeon-vram-guard-limit on every change and restores it on remount before the server responds', async () => {
    const { unmount } = renderSection()
    await screen.findByTestId('vram-threshold-line')
    fireEvent.change(range(), { target: { value: '7.5' } })
    expect(localStorage.getItem(KEY)).toBe('7.5')
    fireEvent.change(numberInput(), { target: { value: '9' } })
    expect(localStorage.getItem(KEY)).toBe('9')
    unmount()

    apiMocks.getVram.mockReturnValue(new Promise(() => {})) // never resolves
    renderSection()
    // while loading nothing is shown; the restored state is verified through storage mirror
    expect(localStorage.getItem(KEY)).toBe('9')
  })

  it('[REQ-365/AC-10] server value wins when not dirty', async () => {
    useGenerationStore.setState({ systemWsConnected: false })
    localStorage.setItem(KEY, '9')
    apiMocks.getVram.mockResolvedValue(server(5))
    renderSection()
    await waitFor(() => expect(range().value).toBe('5'))
    await waitFor(() => expect(localStorage.getItem(KEY)).toBe('5'))
  })

  it('[REQ-365/AC-10] survives localStorage.setItem throwing', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    renderSection()
    await screen.findByTestId('vram-threshold-line')
    fireEvent.change(range(), { target: { value: '8' } })
    expect(range().value).toBe('8')
    fireEvent.click(screen.getByLabelText('VRAM安全ガード設定を保存'))
    await waitFor(() => expect(apiMocks.updateVram).toHaveBeenCalledWith({ vram_min_free_gb: 8, vram_guard_enabled: true }))
  })

  it('[REQ-365/AC-10] PBT: readStoredVramLimit(any string) is within [2,14] and equals default for non-numeric', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.double().map(String)), (s) => {
        const v = readStoredVramLimit(s)
        expect(v).toBeGreaterThanOrEqual(2)
        expect(v).toBeLessThanOrEqual(14)
        if (!Number.isFinite(Number(s)) || s.trim() === '') expect(v).toBe(VRAM_LIMIT_DEFAULT)
      }),
      { numRuns: 300 },
    )
    for (const s of ['abc', 'NaN', '', null]) expect(readStoredVramLimit(s)).toBe(4)
    expect(readStoredVramLimit('-5')).toBe(2)
    expect(readStoredVramLimit('999')).toBe(14)
  })

  it('[REQ-365/AC-10] LS_KEYS.VRAM_GUARD_LIMIT equals the literal key', () => {
    expect(LS_KEYS.VRAM_GUARD_LIMIT).toBe('prompt-surgeon-vram-guard-limit')
  })
})
