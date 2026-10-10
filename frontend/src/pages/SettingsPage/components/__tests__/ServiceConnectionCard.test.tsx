import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServiceConnectionCard } from '../ServiceConnectionCard'
import { configApi } from '../../../../api/client'
import { ManagerActionOutcomeUnknownError, systemManagerApi } from '../../../../api/domains/systemManager'
import { useManagerStatus } from '../../../../hooks/useManagerStatus'
import type { ManagerStatus } from '../../../../api/domains/systemManager'

vi.mock('../../../../api/client', () => ({ configApi: { get: vi.fn() } }))
vi.mock('../../../../api/domains/systemManager', () => ({
  ManagerActionOutcomeUnknownError: class ManagerActionOutcomeUnknownError extends Error {
    readonly outcome = 'unconfirmed'
  },
  systemManagerApi: { status: vi.fn(), action: vi.fn(), logs: vi.fn() },
}))
vi.mock('../../../../hooks/useManagerStatus', () => ({ useManagerStatus: vi.fn() }))

const mockedConfig = vi.mocked(configApi.get)
const mockedAction = vi.mocked(systemManagerApi.action)
const mockedLogs = vi.mocked(systemManagerApi.logs)
const mockedManager = vi.mocked(useManagerStatus)

const readyStatus: ManagerStatus = {
  fe: { running: true, status: 'running' },
  be: { running: true, status: 'running' },
  comfy: { running: false, status: 'stopped' },
  action_in_progress: null,
}

function setup(managerStatus: ManagerStatus | null = readyStatus, available = true) {
  const refetch = vi.fn().mockResolvedValue(undefined)
  mockedConfig.mockResolvedValue({ comfy_url: 'http://comfy-config:8188' } as Awaited<ReturnType<typeof configApi.get>>)
  mockedManager.mockReturnValue({ status: managerStatus, available, refetch })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rendered = render(<QueryClientProvider client={client}><ServiceConnectionCard /></QueryClientProvider>)
  return { refetch, client, rerender: rendered.rerender }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('ServiceConnectionCard', () => {
  it('shows current Manager service state and the backend-owned Comfy URL read-only', async () => {
    setup()
    expect(screen.getByRole('article', { name: 'Supervisor' })).toHaveTextContent('接続中')
    expect(screen.getByRole('article', { name: 'Windows Backend' })).toHaveTextContent('稼働中')
    expect(screen.getByRole('article', { name: 'ComfyUI' })).toHaveTextContent('停止中')
    expect(screen.getByText('Frontend: 稼働中')).toBeInTheDocument()
    expect(screen.getByText('Backend: 稼働中')).toBeInTheDocument()
    expect(screen.getByText('ComfyUI: 停止中')).toBeInTheDocument()
    expect(await screen.findByText('http://comfy-config:8188')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /urlを保存/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/comfyui url/i)).not.toBeInTheDocument()
  })

  it('routes Comfy and Backend restart actions through Manager and re-queries status', async () => {
    const { refetch } = setup()
    mockedAction.mockResolvedValue({ status: 'ok', action: 'restart' })
    fireEvent.click(screen.getByRole('button', { name: 'ComfyUIを再起動' }))
    expect(mockedAction).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('ComfyUI')
    fireEvent.click(screen.getByRole('button', { name: '確認して実行' }))
    await waitFor(() => expect(mockedAction).toHaveBeenCalledWith('restart', 'comfy'))
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/要求を受け付けました/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Backendを再起動' }))
    expect(mockedAction).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '確認して実行' }))
    await waitFor(() => expect(mockedAction).toHaveBeenCalledWith('restart', 'backend'))
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(2))
    expect(screen.getByText(/ポート8000の復帰を待ち/)).toBeInTheDocument()
    const emergencyLink = screen.getByRole('link', { name: /緊急画面/i })
    expect(emergencyLink).toHaveAttribute('href', `http://${window.location.hostname}:8899`)
    expect(emergencyLink).toHaveAttribute('target', '_blank')
  })

  it('shows a truthful timeout or failure without optimistic state changes', async () => {
    setup()
    mockedAction.mockRejectedValue(new Error('Manager request timed out'))
    fireEvent.click(screen.getByRole('button', { name: 'ComfyUIを停止' }))
    fireEvent.click(screen.getByRole('button', { name: '確認して実行' }))
    expect(await screen.findByText(/操作に失敗しました: Manager request timed out/)).toBeInTheDocument()
    expect(screen.getByText('ComfyUI: 停止中')).toBeInTheDocument()
  })

  it('shows an unconfirmed outcome and refreshes status without resending', async () => {
    const runningStatus = { ...readyStatus, comfy: { running: true, status: 'running' } }
    const { refetch } = setup(runningStatus)
    mockedAction.mockRejectedValue(new ManagerActionOutcomeUnknownError('gateway timeout'))

    fireEvent.click(screen.getByRole('button', { name: 'ComfyUIを再起動' }))
    fireEvent.click(screen.getByRole('button', { name: '確認して実行' }))

    expect(await screen.findByText(/要求結果未確認/)).toBeInTheDocument()
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
    expect(mockedAction).toHaveBeenCalledTimes(1)
    expect(mockedAction).toHaveBeenCalledWith('restart', 'comfy')
    expect(screen.getByText('ComfyUI: 稼働中')).toBeInTheDocument()
    expect(screen.queryByText(/要求を受け付けました/)).toBeNull()
    expect(screen.queryByText(/操作に失敗しました/)).toBeNull()
    expect(screen.getByRole('button', { name: 'ComfyUIを再起動' })).toBeEnabled()
  })

  it('loads the selected service log and displays the returned latest content', async () => {
    setup()
    mockedLogs.mockResolvedValue({ service: 'backend', filename: 'backend.log', exists: true, lines: ['line 1', 'latest line'], content: 'line 1\nlatest line' })
    expect(mockedLogs).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('サービスログ'))
    await waitFor(() => expect(mockedLogs).toHaveBeenCalledWith('backend', 200))
    mockedLogs.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '最新ログを表示' }))
    await waitFor(() => expect(mockedLogs).toHaveBeenCalledWith('backend', 200))
    expect(await screen.findByText('backend.log')).toBeInTheDocument()
    expect(screen.getByLabelText('サービスログ内容')).toHaveTextContent('latest line')
  })

  it('disables all Manager actions and log retrieval when Manager is unavailable', () => {
    setup(null, false)
    expect(screen.getByText(/8899が復旧すると操作とログを利用できます/)).toBeInTheDocument()
    for (const name of ['ComfyUIを起動', 'ComfyUIを停止', 'ComfyUIを再起動', 'Backendを再起動']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
    expect(screen.getByText('サービスログ')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '最新ログを表示' })).toBeNull()
  })

  it('keeps controls disabled while Manager reports an action in progress', () => {
    setup({ ...readyStatus, action_in_progress: { service: 'backend', action: 'restart' } })
    expect(screen.getByText(/Backend の restart を実行中/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ComfyUIを起動' })).toBeDisabled()
  })

  it('guards duplicate start requests while an action is pending', async () => {
    setup()
    let resolveAction!: (value: { status: 'ok'; action: string }) => void
    mockedAction.mockImplementation(() => new Promise((resolve) => { resolveAction = resolve }))
    const start = screen.getByRole('button', { name: 'ComfyUIを起動' })
    fireEvent.click(start)
    fireEvent.click(start)
    expect(mockedAction).toHaveBeenCalledTimes(1)
    await act(async () => { resolveAction({ status: 'ok', action: 'start' }) })
    await waitFor(() => expect(screen.getByRole('button', { name: 'ComfyUIを起動' })).toBeEnabled())
  })

  it('keeps missing service fields unknown instead of showing stopped', () => {
    setup({ fe: readyStatus.fe, be: undefined, comfy: readyStatus.comfy } as unknown as ManagerStatus)
    expect(screen.getByRole('article', { name: 'Windows Backend' })).toHaveTextContent('不明')
    expect(screen.getByRole('article', { name: 'Windows Backend' })).not.toHaveTextContent('停止中')
  })

  it('cancels stop confirmation without sending an action and starts logs only when expanded', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'ComfyUIを停止' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('ComfyUI')
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(mockedAction).not.toHaveBeenCalled()
    expect(mockedLogs).not.toHaveBeenCalled()
  })

  it('normalizes Manager aliases and re-enables controls after the action clears', () => {
    const inProgress = { ...readyStatus, action_in_progress: { service: 'fe', action: 'start' } }
    const { rerender, client } = setup(inProgress)
    expect(screen.getByText('Frontend の start を実行中です。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ComfyUIを起動' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Backendを再起動' })).toBeDisabled()

    mockedManager.mockReturnValue({ status: readyStatus, available: true, refetch: vi.fn() })
    rerender(<QueryClientProvider client={client}><ServiceConnectionCard /></QueryClientProvider>)
    expect(screen.queryByRole('status', { name: /実行中/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'ComfyUIを起動' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Backendを再起動' })).toBeEnabled()
  })
})
