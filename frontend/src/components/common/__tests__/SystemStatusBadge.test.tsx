import { render, screen } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { ManagerStatus } from '../../../api/domains/systemManager'
import type { GenerationSnapshot } from '../../../api/domains/generation'
import { resolveSystemStatus, SystemStatusBadge } from '../SystemStatusBadge'

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
})
