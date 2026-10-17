import { render, screen, fireEvent, act } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { ManagerStatus } from '../../../api/domains/systemManager'
import { systemManagerApi } from '../../../api/domains/systemManager'
import type { GenerationSnapshot } from '../../../api/domains/generation'
import { resolveSystemStatus, SystemStatusBadge, buildSwitchUrl } from '../SystemStatusBadge'

const manager: ManagerStatus = {
  fe: { running: true, status: 'running' },
  be: { running: true, status: 'running' },
  comfy: { running: true, status: 'running' },
  action_in_progress: null,
}

const upstream: GenerationSnapshot['upstream'] = {
  http_ready: true,
  ws_connected: true,
  failure_since: null,
}

describe('SystemStatusBadge', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows CONNECTING until the manager status request settles', () => {
    expect(resolveSystemStatus({ upstream: null, reconnecting: false, manager: null, managerAvailable: false, managerLoading: true }).label)
      .toBe('CONNECTING')
  })

  it('shows OFFLINE only when the manager is unavailable and keeps upstream availability separate', () => {
    const result = resolveSystemStatus({ upstream, reconnecting: false, manager, managerAvailable: false })
    expect(result.label).toBe('OFFLINE')
    expect(result.generationAvailable).toBe(true)
  })

  it('waits for manager backend status but ignores the bundled FE process state', () => {
    expect(resolveSystemStatus({ upstream, reconnecting: false, manager: null, managerAvailable: true }).label)
      .toBe('CONNECTING')
    expect(resolveSystemStatus({
      upstream,
      reconnecting: false,
      manager: { ...manager, fe: { running: false, status: 'stopped' } },
      managerAvailable: true,
    }).label).toBe('READY')
  })

  it('shows CONNECTING while a backend or Comfy action is in progress, but ignores FE actions', () => {
    const backendAction = { ...manager, action_in_progress: { service: 'be', action: 'restart' } }
    expect(resolveSystemStatus({ upstream, reconnecting: false, manager: backendAction, managerAvailable: true }).label)
      .toBe('CONNECTING')
    const comfyAction = { ...manager, action_in_progress: { service: 'comfy', action: 'start' } }
    expect(resolveSystemStatus({ upstream, reconnecting: false, manager: comfyAction, managerAvailable: true }).label)
      .toBe('CONNECTING')
    const feAction = { ...manager, action_in_progress: { service: 'frontend', action: 'restart' } }
    expect(resolveSystemStatus({ upstream, reconnecting: false, manager: feAction, managerAvailable: true }).label)
      .toBe('READY')
  })

  it('shows STOPPED for a stopped Comfy service despite upstream WebSocket retries', () => {
    const result = resolveSystemStatus({
      upstream: { ...upstream, http_ready: false, ws_connected: false },
      reconnecting: true,
      manager: { ...manager, comfy: { running: false, status: 'stopped' } },
      managerAvailable: true,
    })
    expect(result.label).toBe('STOPPED')
  })

  it('shows STUCK only after more than 30 seconds of HTTP failure while Comfy is listening', () => {
    vi.setSystemTime(new Date('2026-10-10T00:00:30Z'))
    const props = {
      upstream: { http_ready: false, ws_connected: false, failure_since: '2026-10-10T00:00:00Z' },
      reconnecting: false,
      manager,
      managerAvailable: true,
    }
    expect(resolveSystemStatus(props).label).toBe('CONNECTING')
    vi.advanceTimersByTime(1)
    expect(resolveSystemStatus(props).label).toBe('STUCK')
    expect(resolveSystemStatus({ ...props, upstream: { ...props.upstream, failure_since: null } }).label)
      .toBe('CONNECTING')
    expect(resolveSystemStatus({
      ...props,
      upstream: { http_ready: true, ws_connected: true, failure_since: null },
    }).label).toBe('READY')
  })

  it('requires current upstream HTTP and WebSocket health for READY', () => {
    expect(resolveSystemStatus({ upstream: null, reconnecting: false, manager, managerAvailable: true }).label)
      .toBe('CONNECTING')
    expect(resolveSystemStatus({ upstream: { ...upstream, ws_connected: false }, reconnecting: false, manager, managerAvailable: true }).label)
      .toBe('CONNECTING')
    expect(resolveSystemStatus({ upstream: { ...upstream, http_ready: false }, reconnecting: false, manager, managerAvailable: true }).label)
      .toBe('CONNECTING')
    expect(resolveSystemStatus({ upstream, reconnecting: true, manager, managerAvailable: true }).label)
      .toBe('CONNECTING')
  })

  it('renders the aggregate and per-service states in the header badge', () => {
    render(<SystemStatusBadge upstream={upstream} reconnecting={false} manager={manager} managerAvailable />)
    expect(screen.getByText('READY')).toBeTruthy()
    expect(screen.getByLabelText(/Comfy.*running/i)).toBeTruthy()
  })

  it('renders slim variant by default without redundant inline service labels', () => {
    render(<SystemStatusBadge upstream={upstream} reconnecting={false} manager={manager} managerAvailable />)
    expect(screen.getByText('READY')).toBeTruthy()
    expect(screen.queryByText(/FE running · BE running/i)).toBeNull()
    const badge = screen.getByTestId('system-status-badge')
    expect(badge.getAttribute('title')).toContain('Comfy running (FastAPI中継 OK)')
  })

  it('renders full variant with inline service labels', () => {
    render(<SystemStatusBadge upstream={upstream} reconnecting={false} manager={manager} managerAvailable variant="full" />)
    expect(screen.getByText(/FE running · BE running · Comfy running/i)).toBeTruthy()
  })

  it('renders dot variant for mobile as 7px glowing dot without text', () => {
    render(<SystemStatusBadge upstream={upstream} reconnecting={false} manager={manager} managerAvailable variant="dot" />)
    expect(screen.queryByText('READY')).toBeNull()
    const dot = screen.getByTestId('system-status-badge')
    expect(dot.className).toContain('w-[7px]')
    expect(dot.className).toContain('h-[7px]')
    expect(dot.className).toContain('rounded-full')
  })

  describe('REQ-364: SystemStatusBadge popover and lifecycle controls', () => {
    it('[REQ-364/AC-1] displays dynamic DEV :${currentPort} tag on desktop in dev mode', () => {
      const { rerender } = render(
        <SystemStatusBadge
          upstream={upstream}
          reconnecting={false}
          manager={manager}
          managerAvailable
          isDev={true}
          currentPort="5173"
        />
      )
      expect(screen.getByText('DEV :5173')).toBeInTheDocument()

      rerender(
        <SystemStatusBadge
          upstream={upstream}
          reconnecting={false}
          manager={manager}
          managerAvailable
          isDev={true}
          currentPort="5174"
        />
      )
      expect(screen.getByText('DEV :5174')).toBeInTheDocument()
    })

    it('[REQ-364/AC-2] does not display DEV tag in prod mode or in dot variant', () => {
      const { rerender } = render(
        <SystemStatusBadge
          upstream={upstream}
          reconnecting={false}
          manager={manager}
          managerAvailable
          isDev={false}
          currentPort="5173"
        />
      )
      expect(screen.queryByText(/DEV :/i)).toBeNull()

      rerender(
        <SystemStatusBadge
          upstream={upstream}
          reconnecting={false}
          manager={manager}
          managerAvailable
          isDev={true}
          currentPort="5173"
          variant="dot"
        />
      )
      expect(screen.queryByText(/DEV :/i)).toBeNull()
    })

    it('[REQ-364/AC-3] opens popover when clicked and renders all sections', () => {
      render(
        <SystemStatusBadge
          upstream={upstream}
          reconnecting={false}
          manager={manager}
          managerAvailable
        />
      )
      expect(screen.queryByText('システム稼働モニタ')).toBeNull()

      fireEvent.click(screen.getByTestId('system-status-badge'))

      expect(screen.getByText('システム稼働モニタ')).toBeInTheDocument()
      expect(screen.getByText('Frontend')).toBeInTheDocument()
      expect(screen.getByText('FastAPI (BE)')).toBeInTheDocument()
      expect(screen.getByText('ComfyUI')).toBeInTheDocument()
      expect(screen.getByText('Manager')).toBeInTheDocument()
    })

    it('[REQ-364/AC-4] renders right-aligned vertical status format with dynamic ports', () => {
      render(
        <SystemStatusBadge
          upstream={upstream}
          reconnecting={false}
          manager={manager}
          managerAvailable
          isDev={true}
          currentPort="5173"
          backendPort="8000"
          comfyPort="8188"
          managerPort="8899"
        />
      )
      fireEvent.click(screen.getByTestId('system-status-badge'))

      expect(screen.getByTestId('service-status-Frontend').textContent).toContain('running (:5173)')
      expect(screen.getByTestId('service-status-FastAPI (BE)').textContent).toContain('running (:8000)')
      expect(screen.getByTestId('service-status-ComfyUI').textContent).toContain('running (:8188)')
      expect(screen.getByTestId('service-status-Manager').textContent).toContain('running (:8899)')
    })

    it('[REQ-364/AC-5] navigates to production port while preserving URL parts in DEV mode', () => {
      const loc = {
        protocol: 'http:',
        hostname: 'localhost',
        pathname: '/generate/workflow',
        search: '?tab=run',
        hash: '#step2',
      }
      expect(buildSwitchUrl('8000', loc)).toBe('http://localhost:8000/generate/workflow?tab=run#step2')

      const onNavigate = vi.fn()
      render(
        <SystemStatusBadge
          upstream={upstream}
          reconnecting={false}
          manager={manager}
          managerAvailable
          isDev={true}
          targetProdPort="8000"
          onNavigate={onNavigate}
        />
      )
      fireEvent.click(screen.getByTestId('system-status-badge'))
      const switchBtn = screen.getByRole('button', { name: /⇄ 本番用/i })
      fireEvent.click(switchBtn)

      expect(onNavigate).toHaveBeenCalledTimes(1)
      expect(onNavigate).toHaveBeenCalledWith(expect.stringContaining(':8000'))
    })

    it('[REQ-364/AC-6] navigates to development port while preserving URL parts in PROD mode', () => {
      const onNavigate = vi.fn()
      render(
        <SystemStatusBadge
          upstream={upstream}
          reconnecting={false}
          manager={manager}
          managerAvailable
          isDev={false}
          targetDevPort="5173"
          onNavigate={onNavigate}
        />
      )
      fireEvent.click(screen.getByTestId('system-status-badge'))
      const switchBtn = screen.getByRole('button', { name: /⇄ 開発用/i })
      fireEvent.click(switchBtn)

      expect(onNavigate).toHaveBeenCalledTimes(1)
      expect(onNavigate).toHaveBeenCalledWith(expect.stringContaining(':5173'))
    })

    it('[REQ-364/LC-1] shows start button and calls systemManagerApi.action in PROD when frontend is stopped', async () => {
      const actionSpy = vi.spyOn(systemManagerApi, 'action').mockResolvedValue({ status: 'ok', action: 'start' })
      const stoppedManager: ManagerStatus = {
        ...manager,
        fe: { running: false, status: 'stopped' },
      }
      render(
        <SystemStatusBadge
          upstream={upstream}
          reconnecting={false}
          manager={stoppedManager}
          managerAvailable
          isDev={false}
        />
      )
      fireEvent.click(screen.getByTestId('system-status-badge'))
      const startBtn = screen.getByRole('button', { name: /▶ 開発起動/i })
      expect(startBtn).toBeInTheDocument()

      await act(async () => {
        fireEvent.click(startBtn)
      })

      expect(actionSpy).toHaveBeenCalledWith('start', 'frontend')
      actionSpy.mockRestore()
    })

    it('[REQ-364/LC-2] disables action button while lifecycle action is in flight', async () => {
      let resolveAction!: (val: unknown) => void
      const pendingPromise = new Promise((resolve) => {
        resolveAction = resolve
      })
      const actionSpy = vi.spyOn(systemManagerApi, 'action').mockReturnValue(pendingPromise as any)
      const stoppedManager: ManagerStatus = {
        ...manager,
        fe: { running: false, status: 'stopped' },
      }
      render(
        <SystemStatusBadge
          upstream={upstream}
          reconnecting={false}
          manager={stoppedManager}
          managerAvailable
          isDev={false}
        />
      )
      fireEvent.click(screen.getByTestId('system-status-badge'))
      const startBtn = screen.getByRole('button', { name: /▶ 開発起動/i })
      expect(startBtn).not.toBeDisabled()

      act(() => {
        fireEvent.click(startBtn)
      })

      expect(startBtn).toBeDisabled()

      await act(async () => {
        resolveAction({ status: 'ok', action: 'start' })
      })

      expect(startBtn).not.toBeDisabled()
      actionSpy.mockRestore()
    })

    it('[REQ-364/LC-3] calls stop frontend action and navigates to prod URL in DEV mode', async () => {
      const actionSpy = vi.spyOn(systemManagerApi, 'action').mockResolvedValue({ status: 'ok', action: 'stop' })
      const onNavigate = vi.fn()
      render(
        <SystemStatusBadge
          upstream={upstream}
          reconnecting={false}
          manager={manager}
          managerAvailable
          isDev={true}
          targetProdPort="8000"
          onNavigate={onNavigate}
        />
      )
      fireEvent.click(screen.getByTestId('system-status-badge'))
      const stopBtn = screen.getByRole('button', { name: /■ 停止して本番へ/i })
      expect(stopBtn).toBeInTheDocument()

      await act(async () => {
        fireEvent.click(stopBtn)
      })

      expect(actionSpy).toHaveBeenCalledWith('stop', 'frontend')
      expect(onNavigate).toHaveBeenCalledWith(expect.stringContaining(':8000'))
      actionSpy.mockRestore()
    })

    describe('Red Team Scenarios (RT-1 ~ RT-3)', () => {
      it('[REQ-364/RT-1] preserves complex URL parameters, queries, and hashes during switch URL generation', () => {
        const testCases = [
          {
            loc: { protocol: 'http:', hostname: '127.0.0.1', pathname: '/generate', search: '?workflow=1&model=flux', hash: '#preview' },
            targetPort: '8000',
            expected: 'http://127.0.0.1:8000/generate?workflow=1&model=flux#preview',
          },
          {
            loc: { protocol: 'https:', hostname: 'localhost', pathname: '/', search: '', hash: '' },
            targetPort: '5173',
            expected: 'https://localhost:5173/',
          },
          {
            loc: { protocol: 'http:', hostname: 'localhost', pathname: '/dataset', search: '?query=%E3%83%86%E3%82%B9%E3%83%88&tag=cat&sort=desc', hash: '#item-99' },
            targetPort: '8000',
            expected: 'http://localhost:8000/dataset?query=%E3%83%86%E3%82%B9%E3%83%88&tag=cat&sort=desc#item-99',
          },
          {
            loc: { protocol: 'http:', hostname: 'localhost', pathname: '/settings', search: '?', hash: '#' },
            targetPort: '5173',
            expected: 'http://localhost:5173/settings?#',
          },
        ]

        for (const tc of testCases) {
          expect(buildSwitchUrl(tc.targetPort, tc.loc)).toBe(tc.expected)
        }
      })

      it('[REQ-364/RT-2] dynamically reflects custom ports for all services in badge and monitor without layout distortion', () => {
        render(
          <SystemStatusBadge
            upstream={upstream}
            reconnecting={false}
            manager={manager}
            managerAvailable
            isDev={true}
            currentPort="5174"
            backendPort="8080"
            comfyPort="8288"
            managerPort="8999"
          />
        )
        expect(screen.getByText('DEV :5174')).toBeInTheDocument()

        fireEvent.click(screen.getByTestId('system-status-badge'))
        expect(screen.getByTestId('service-status-Frontend').textContent).toContain('(:5174)')
        expect(screen.getByTestId('service-status-FastAPI (BE)').textContent).toContain('(:8080)')
        expect(screen.getByTestId('service-status-ComfyUI').textContent).toContain('(:8288)')
        expect(screen.getByTestId('service-status-Manager').textContent).toContain('(:8999)')
      })

      it('[REQ-364/RT-3] recovers from ServerManager action errors gracefully and disables controls when managerAvailable is false', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const actionSpy = vi.spyOn(systemManagerApi, 'action').mockRejectedValue(new Error('Network error 500'))
        const stoppedManager: ManagerStatus = {
          ...manager,
          fe: { running: false, status: 'stopped' },
        }

        // 1. Error during start action
        const { unmount } = render(
          <SystemStatusBadge
            upstream={upstream}
            reconnecting={false}
            manager={stoppedManager}
            managerAvailable={true}
            isDev={false}
          />
        )
        fireEvent.click(screen.getByTestId('system-status-badge'))
        const startBtn = screen.getByRole('button', { name: /▶ 開発起動/i })
        expect(startBtn).not.toBeDisabled()

        await act(async () => {
          fireEvent.click(startBtn)
        })

        // Re-enabled after failure without crashing
        expect(startBtn).not.toBeDisabled()
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start dev server', expect.any(Error))
        unmount()

        // 2. managerAvailable = false disables start and stop buttons
        render(
          <SystemStatusBadge
            upstream={upstream}
            reconnecting={false}
            manager={stoppedManager}
            managerAvailable={false}
            isDev={false}
          />
        )
        fireEvent.click(screen.getByTestId('system-status-badge'))
        const disabledStartBtn = screen.getByRole('button', { name: /▶ 開発起動/i })
        expect(disabledStartBtn).toBeDisabled()

        actionSpy.mockRestore()
        consoleErrorSpy.mockRestore()
      })
    })
  })
})
