import { Component, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LazyModalHost, type LazyModalMode } from '../LazyBoundary'

vi.mock('../../../utils/logger', () => ({
  logClientError: vi.fn(() => Promise.resolve()),
}))

interface ProbeLog {
  mounts: number
  unmounts: number
  throwOnRender: boolean
}

interface ProbeProps {
  isOpen: boolean
  probe: ProbeLog
}

type ModalModule = { default: ComponentType<ProbeProps> }

function ProbeModal({ isOpen, probe }: ProbeProps) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    probe.mounts += 1
    return () => {
      probe.unmounts += 1
    }
  }, [probe])
  if (probe.throwOnRender) throw new Error('probe render failure')
  if (!isOpen) return null
  return (
    <div data-testid="probe-modal">
      <span data-testid="probe-count">{count}</span>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        inc
      </button>
    </div>
  )
}

function newProbe(): ProbeLog {
  return { mounts: 0, unmounts: 0, throwOnRender: false }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeLoader() {
  const deferred = createDeferred<ModalModule>()
  const load = vi.fn(() => deferred.promise)
  return { load, deferred }
}

const CHUNK_ERROR = new TypeError('Failed to fetch dynamically imported module: http://localhost/assets/JobManagementModal.js')

interface HarnessProps {
  isOpen: boolean
  mode: LazyModalMode
  load: () => Promise<ModalModule>
  probe: ProbeLog
  onClose: () => void
}

function Harness({ isOpen, mode, load, probe, onClose }: HarnessProps) {
  return (
    <div>
      <input aria-label="入力欄" />
      <LazyModalHost<ProbeProps>
        isOpen={isOpen}
        mode={mode}
        load={load}
        modalProps={{ isOpen, probe }}
        onClose={onClose}
        label="テストモーダル"
      />
    </div>
  )
}

class OuterBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) return <div data-testid="outer-caught">caught</div>
    return this.props.children
  }
}

const LOADING_TEXT = 'テストモーダルを読み込み中…'
const ALERT_TEXT = 'テストモーダルを読み込めませんでした'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('LazyModalHost', () => {
  it('[REQ-309/AC-1] latch-not-loaded-until-open', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['AC-1'], layer: 'unit', caseId: 'latch-not-loaded-until-open' })
    const { load, deferred } = makeLoader()
    const probe = newProbe()
    const onClose = vi.fn()
    const { rerender } = render(
      <Harness isOpen={false} mode="latch" load={load} probe={probe} onClose={onClose} />
    )
    expect(load).toHaveBeenCalledTimes(0)
    expect(screen.queryByTestId('probe-modal')).toBeNull()

    rerender(<Harness isOpen={true} mode="latch" load={load} probe={probe} onClose={onClose} />)
    expect(load).toHaveBeenCalledTimes(1)
    expect(screen.getByText(LOADING_TEXT)).toBeTruthy()

    await act(async () => {
      deferred.resolve({ default: ProbeModal })
    })
    expect(screen.getByTestId('probe-modal')).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('[REQ-309/AC-3] latch-keeps-mounted-after-close', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['AC-3'], layer: 'unit', caseId: 'latch-keeps-mounted-after-close' })
    const { load, deferred } = makeLoader()
    const probe = newProbe()
    const onClose = vi.fn()
    const { rerender } = render(
      <Harness isOpen={true} mode="latch" load={load} probe={probe} onClose={onClose} />
    )
    await act(async () => {
      deferred.resolve({ default: ProbeModal })
    })
    fireEvent.click(screen.getByText('inc'))
    fireEvent.click(screen.getByText('inc'))
    expect(screen.getByTestId('probe-count').textContent).toBe('2')

    rerender(<Harness isOpen={false} mode="latch" load={load} probe={probe} onClose={onClose} />)
    expect(screen.queryByTestId('probe-modal')).toBeNull()
    expect(probe.unmounts).toBe(0)

    rerender(<Harness isOpen={true} mode="latch" load={load} probe={probe} onClose={onClose} />)
    expect(screen.getByTestId('probe-count').textContent).toBe('2')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('[REQ-309/AC-3] while-open-unmounts-on-close', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['AC-3'], layer: 'unit', caseId: 'while-open-unmounts-on-close' })
    const { load, deferred } = makeLoader()
    const probe = newProbe()
    const onClose = vi.fn()
    const { rerender } = render(
      <Harness isOpen={true} mode="while-open" load={load} probe={probe} onClose={onClose} />
    )
    await act(async () => {
      deferred.resolve({ default: ProbeModal })
    })
    fireEvent.click(screen.getByText('inc'))
    expect(screen.getByTestId('probe-count').textContent).toBe('1')

    rerender(<Harness isOpen={false} mode="while-open" load={load} probe={probe} onClose={onClose} />)
    expect(probe.unmounts).toBe(1)
    expect(screen.queryByTestId('probe-modal')).toBeNull()

    rerender(<Harness isOpen={true} mode="while-open" load={load} probe={probe} onClose={onClose} />)
    expect(await screen.findByTestId('probe-modal')).toBeTruthy()
    expect(screen.getByTestId('probe-count').textContent).toBe('0')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('[REQ-309/AC-3] close-while-loading', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['AC-3'], layer: 'unit', caseId: 'close-while-loading' })
    const { load, deferred } = makeLoader()
    const probe = newProbe()
    const onClose = vi.fn()
    const { rerender } = render(
      <Harness isOpen={true} mode="latch" load={load} probe={probe} onClose={onClose} />
    )
    expect(screen.getByText(LOADING_TEXT)).toBeTruthy()

    rerender(<Harness isOpen={false} mode="latch" load={load} probe={probe} onClose={onClose} />)
    expect(screen.queryByText(LOADING_TEXT)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()

    await act(async () => {
      deferred.resolve({ default: ProbeModal })
    })
    expect(screen.queryByTestId('probe-modal')).toBeNull()
    expect(screen.queryByText(LOADING_TEXT)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('[REQ-309/AC-3] rapid-toggle', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['AC-3'], layer: 'unit', caseId: 'rapid-toggle' })
    const { load, deferred } = makeLoader()
    const probe = newProbe()
    const onClose = vi.fn()
    const { rerender } = render(
      <Harness isOpen={false} mode="while-open" load={load} probe={probe} onClose={onClose} />
    )
    for (let i = 0; i < 10; i += 1) {
      rerender(<Harness isOpen={true} mode="while-open" load={load} probe={probe} onClose={onClose} />)
      rerender(<Harness isOpen={false} mode="while-open" load={load} probe={probe} onClose={onClose} />)
    }
    rerender(<Harness isOpen={true} mode="while-open" load={load} probe={probe} onClose={onClose} />)
    await act(async () => {
      deferred.resolve({ default: ProbeModal })
    })
    expect(screen.getAllByTestId('probe-modal')).toHaveLength(1)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('[REQ-309/AC-3] load-failure-local-alert', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['AC-3'], layer: 'unit', caseId: 'load-failure-local-alert' })
    const reload = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload },
    })
    try {
      const { load, deferred } = makeLoader()
      const probe = newProbe()
      const onClose = vi.fn()
      const { rerender } = render(
        <Harness isOpen={true} mode="latch" load={load} probe={probe} onClose={onClose} />
      )
      const input = screen.getByLabelText('入力欄') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'keep-me' } })

      await act(async () => {
        deferred.reject(CHUNK_ERROR)
      })
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain(ALERT_TEXT)
      expect(screen.getByLabelText('入力欄')).toBe(input)
      expect(input.value).toBe('keep-me')

      fireEvent.click(screen.getByText('ページを再読み込み'))
      expect(reload).toHaveBeenCalledTimes(1)

      fireEvent.click(screen.getByText('閉じる'))
      expect(onClose).toHaveBeenCalledTimes(1)

      rerender(<Harness isOpen={false} mode="latch" load={load} probe={probe} onClose={onClose} />)
      expect(screen.queryByRole('alert')).toBeNull()

      rerender(<Harness isOpen={true} mode="latch" load={load} probe={probe} onClose={onClose} />)
      expect(await screen.findByRole('alert')).toBeTruthy()
      expect(load).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    }
  })

  it('[REQ-309/AC-3] non-chunk-error-propagates', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['AC-3'], layer: 'unit', caseId: 'non-chunk-error-propagates' })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { load, deferred } = makeLoader()
    const probe = newProbe()
    const onClose = vi.fn()
    render(
      <OuterBoundary>
        <Harness isOpen={true} mode="latch" load={load} probe={probe} onClose={onClose} />
      </OuterBoundary>
    )
    probe.throwOnRender = true
    await act(async () => {
      deferred.resolve({ default: ProbeModal })
    })
    expect(await screen.findByTestId('outer-caught')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('[REQ-309/AC-3] host-state-machine-properties', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['AC-3'], layer: 'unit', caseId: 'host-state-machine-properties' })
    type Action = 'open' | 'close' | 'resolve' | 'reject'
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<LazyModalMode>('latch', 'while-open'),
        fc.array(fc.constantFrom<Action>('open', 'close', 'resolve', 'reject'), { maxLength: 10 }),
        async (mode, actions) => {
          cleanup()
          const { load, deferred } = makeLoader()
          const probe = newProbe()
          const onClose = vi.fn()
          let isOpen = false
          let settled = false
          const ui = (open: boolean) => (
            <OuterBoundary>
              <Harness isOpen={open} mode={mode} load={load} probe={probe} onClose={onClose} />
            </OuterBoundary>
          )
          const { rerender } = render(ui(false))
          for (const action of actions) {
            if (action === 'open') {
              isOpen = true
              rerender(ui(true))
            } else if (action === 'close') {
              isOpen = false
              rerender(ui(false))
            } else if (!settled && load.mock.calls.length > 0) {
              settled = true
              const outcome = action
              await act(async () => {
                if (outcome === 'resolve') deferred.resolve({ default: ProbeModal })
                else deferred.reject(CHUNK_ERROR)
              })
            }
            const modalCount = screen.queryAllByTestId('probe-modal').length
            const alertCount = screen.queryAllByRole('alert').length
            const fallbackCount = screen.queryAllByText(LOADING_TEXT).length
            expect(modalCount).toBeLessThanOrEqual(1)
            expect(screen.getByLabelText('入力欄')).toBeTruthy()
            if (mode === 'latch' && probe.mounts > 0) expect(probe.unmounts).toBe(0)
            if (mode === 'while-open' && !isOpen) expect(modalCount).toBe(0)
            if (!isOpen) {
              expect(fallbackCount).toBe(0)
              expect(alertCount).toBe(0)
            }
          }
          cleanup()
        }
      ),
      { numRuns: 40, verbose: true }
    )
  }, 60_000)
})
