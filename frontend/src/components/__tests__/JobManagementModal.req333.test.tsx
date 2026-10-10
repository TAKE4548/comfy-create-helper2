import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JobManagementModal } from '../JobManagementModal'

const mocks = vi.hoisted(() => ({
  state: {
    queueRunning: [] as any[],
    queuePending: [] as any[],
    clientId: 'session-a',
    filterOwnSession: false,
    cancelJob: vi.fn(),
    clearPendingQueue: vi.fn(),
    cancelAllJobs: vi.fn(),
  },
}))

vi.mock('../../store/useGenerationStore', () => ({ useGenerationStore: () => mocks.state }))

const confirmedOperation = (scope: 'all' | 'normal', mode: 'queued' | 'all' = 'all') => ({
  scope,
  mode,
  message: 'confirmed',
  items: [],
  upstream_clear: 'confirmed',
  upstream_interrupt: mode === 'queued' ? 'not_requested' : 'confirmed',
  epoch: 'epoch-1',
  revision: 2,
})

describe('JobManagementModal REQ-333-T30', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.queueRunning = [['running', 'prompt-running', 0, { client_id: 'session-b' }]]
    mocks.state.queuePending = [['pending', 'prompt-pending', 0, { client_id: 'session-b' }]]
    mocks.state.clientId = 'session-a'
    mocks.state.filterOwnSession = false
    vi.stubGlobal('confirm', vi.fn(() => true))
    mocks.state.clearPendingQueue.mockResolvedValue(confirmedOperation('all', 'queued'))
    mocks.state.cancelAllJobs.mockResolvedValue(confirmedOperation('all'))
    mocks.state.cancelJob.mockResolvedValue({ job_id: 'job-1', prompt_id: 'prompt-running', status: 'cancelled', outcome: 'cancelled', message: 'cancelled' })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('defaults bulk scope to all and confirms before global queued clear even while own-session filter is on', async () => {
    mocks.state.filterOwnSession = true
    render(<JobManagementModal isOpen onClose={onClose} />)

    expect(screen.getByLabelText('一括取消範囲')).toHaveValue('all')
    fireEvent.click(screen.getByRole('button', { name: 'キューのみクリア' }))

    await waitFor(() => expect(mocks.state.clearPendingQueue).toHaveBeenCalledWith('all'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('全セッション'))
  })

  it('passes normal scope independent of the display filter and stays open when protected work skips interruption', async () => {
    mocks.state.filterOwnSession = true
    mocks.state.cancelAllJobs.mockResolvedValue({
      ...confirmedOperation('normal'),
      message: 'Studio/未分類を保護するため通常実行中を維持',
      upstream_interrupt: 'skipped',
    })
    render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('一括取消範囲'), { target: { value: 'normal' } })
    fireEvent.click(screen.getByRole('button', { name: 'すべて中断' }))

    await waitFor(() => expect(mocks.state.cancelAllJobs).toHaveBeenCalledWith('normal'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Studio/未分類を保護するため通常実行中を維持', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/完了扱いではありません/)).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Studio'))
  })

  it('keeps the modal open and reports confirmed versus unconfirmed results for partial completion', async () => {
    mocks.state.clearPendingQueue.mockResolvedValue({
      ...confirmedOperation('all', 'queued'),
      message: 'partial',
      items: [
        { job_id: 'j1', prompt_id: 'p1', status: 'cancelled', outcome: 'cancelled', message: 'cancelled' },
        { job_id: 'j2', prompt_id: 'p2', status: 'unconfirmed', outcome: 'unconfirmed', message: 'timeout' },
      ],
      upstream_clear: 'unconfirmed',
    })
    render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'キューのみクリア' }))

    await waitFor(() => expect(screen.getByText(/確認済み: 1件/)).toBeInTheDocument())
    expect(screen.getByText(/未確認: 2件/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('single cancellation sends only the selected row identifier and does not show a failure notice on success', async () => {
    mocks.state.queuePending = [['pending', 'selected-prompt', 0, { client_id: 'session-b' }]]
    render(<JobManagementModal isOpen onClose={onClose} />)
    const buttons = screen.getAllByTitle('キューから削除')
    fireEvent.click(buttons[0])

    await waitFor(() => expect(mocks.state.cancelJob).toHaveBeenCalledWith('selected-prompt'))
    expect(mocks.state.cancelJob).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/失敗|未確認/)).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not call the API when native confirmation is rejected', () => {
    vi.mocked(confirm).mockReturnValue(false)
    render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'すべて中断' }))
    expect(mocks.state.cancelAllJobs).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each([false, true])('normal bulk scope targets the same global set regardless of display filter (filter=%s)', async (filterOwnSession) => {
    mocks.state.filterOwnSession = filterOwnSession
    mocks.state.clearPendingQueue.mockResolvedValue(confirmedOperation('normal', 'queued'))
    render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('一括取消範囲'), { target: { value: 'normal' } })
    fireEvent.click(screen.getByRole('button', { name: 'キューのみクリア' }))
    await waitFor(() => expect(mocks.state.clearPendingQueue).toHaveBeenCalledWith('normal'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('suppresses repeated clicks while an operation is pending', async () => {
    let resolveRequest: ((value: ReturnType<typeof confirmedOperation>) => void) | undefined
    mocks.state.clearPendingQueue.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))
    render(<JobManagementModal isOpen onClose={onClose} />)
    const button = screen.getByRole('button', { name: 'キューのみクリア' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(mocks.state.clearPendingQueue).toHaveBeenCalledTimes(1)
    resolveRequest?.(confirmedOperation('all', 'queued'))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('keeps modal open and displays a message when queue lookup or cancellation throws', async () => {
    mocks.state.cancelAllJobs.mockRejectedValue(new Error('cancel timeout'))
    render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'すべて中断' }))
    await waitFor(() => expect(screen.getByText('cancel timeout')).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps a long partial-result message available while a separate scope can still drive the next action', async () => {
    const longMessage = '取消結果の一部が未確認です。詳細を確認してから必要な範囲を選び直してください。'.repeat(8)
    mocks.state.filterOwnSession = true
    mocks.state.clearPendingQueue.mockResolvedValue({
      ...confirmedOperation('all', 'queued'),
      message: longMessage,
      upstream_clear: 'unconfirmed',
    })
    mocks.state.cancelAllJobs.mockResolvedValue({
      ...confirmedOperation('normal'),
      message: longMessage,
      upstream_interrupt: 'unconfirmed',
    })
    render(<JobManagementModal isOpen onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'キューのみクリア' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(longMessage)
    expect(screen.getByText('※ 自セッションのジョブのみを表示中')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('一括取消範囲'), { target: { value: 'normal' } })
    fireEvent.click(screen.getByRole('button', { name: 'すべて中断' }))
    await waitFor(() => expect(mocks.state.cancelAllJobs).toHaveBeenCalledWith('normal'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
