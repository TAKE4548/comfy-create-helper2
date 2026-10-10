import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JobManagementModal } from '../JobManagementModal'
import { generationApi } from '../../api/domains/generation'

const mocks = vi.hoisted(() => ({
  state: {
    queueRunning: [] as any[],
    queuePending: [] as any[],
    clientId: 'session-a',
    filterOwnSession: false,
    cancelJob: vi.fn(),
    clearPendingQueue: vi.fn(),
    cancelAllJobs: vi.fn(),
    generationSnapshot: { jobs: [] as any[] },
    fetchQueue: vi.fn(),
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
    vi.spyOn(generationApi, 'cancelJob').mockResolvedValue({ job_id: 'job-1', prompt_id: 'prompt-pending', status: 'cancelled', outcome: 'cancelled', message: 'cancelled' })
  })

  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('uses the accessible common mobile sheet wrapper and 44px control targets', () => {
    render(<JobManagementModal isOpen onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'ジョブ管理' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.className).toContain('max-w-[min(90vw,42.5rem)]')
    expect(dialog.querySelector('div[aria-hidden="true"]')).toHaveClass('md:hidden')
    expect(Array.from(dialog.querySelectorAll('button, select')).every((control) =>
      control.classList.contains('min-h-11')
    )).toBe(true)
  })

  it('defaults bulk scope to all and confirms before global queued clear even while own-session filter is on', async () => {
    mocks.state.filterOwnSession = true
    render(<JobManagementModal isOpen onClose={onClose} />)

    expect(screen.getByLabelText('一括取消範囲')).toHaveValue('all')
    fireEvent.click(screen.getByRole('button', { name: 'キューのみクリア' }))
    expect(mocks.state.clearPendingQueue).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '確認してキューのみクリア' }))

    await waitFor(() => expect(mocks.state.clearPendingQueue).toHaveBeenCalledWith('all'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: /取消確認/ })).not.toBeInTheDocument()
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
    expect(screen.getByText(/Studio・未分類は保護/)).toBeInTheDocument()
    expect(mocks.state.cancelAllJobs).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '確認してすべて中断' }))

    await waitFor(() => expect(mocks.state.cancelAllJobs).toHaveBeenCalledWith('normal'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Studio/未分類を保護するため通常実行中を維持', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/完了扱いではありません/)).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: '確認してキューのみクリア' }))

    await waitFor(() => expect(screen.getByText(/確認済み: 1件/)).toBeInTheDocument())
    expect(screen.getByText(/未確認: 2件/)).toBeInTheDocument()
    expect(screen.getByText(/対象: p1, p2/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('single cancellation sends only the selected row identifier and does not show a failure notice on success', async () => {
    vi.useFakeTimers()
    mocks.state.queuePending = [['pending', 'selected-prompt', 0, { client_id: 'session-b' }]]
    render(<JobManagementModal isOpen onClose={onClose} />)
    const buttons = screen.getAllByTitle('キューから削除')
    fireEvent.click(buttons[0])

    expect(generationApi.cancelJob).not.toHaveBeenCalled()
    expect(screen.getByText(/取消予約/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await vi.advanceTimersByTimeAsync(3000)
    expect(generationApi.cancelJob).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not call a bulk API until its inline confirmation is accepted', () => {
    render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'すべて中断' }))
    expect(mocks.state.cancelAllJobs).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '確認してすべて中断' })).toBeInTheDocument()
  })

  it.each([
    ['キューのみクリア', '確認してキューのみクリア'],
    ['すべて中断', '確認してすべて中断'],
  ])('canceling %s confirmation leaves queue state unchanged', (requestName, confirmName) => {
    render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: requestName }))
    expect(screen.getByRole('dialog', { name: '取消確認' })).toHaveTextContent(/待機中 1 件/)
    expect(mocks.state.clearPendingQueue).not.toHaveBeenCalled()
    expect(mocks.state.cancelAllJobs).not.toHaveBeenCalled()

    expect(screen.getByRole('button', { name: confirmName })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '戻る' }))

    expect(screen.queryByRole('dialog', { name: '取消確認' })).not.toBeInTheDocument()
    expect(mocks.state.clearPendingQueue).not.toHaveBeenCalled()
    expect(mocks.state.cancelAllJobs).not.toHaveBeenCalled()
    expect(mocks.state.queuePending).toHaveLength(1)
    expect(mocks.state.queueRunning).toHaveLength(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('canceling a running-job interrupt confirmation keeps the row and performs no mutation', () => {
    mocks.state.generationSnapshot = { jobs: [{ prompt_id: 'prompt-running', set_name: 'Portrait' }] }
    render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.click(screen.getByTitle('中断（生成を停止）'))
    expect(screen.getByRole('button', { name: '実行中ジョブを中断する' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '戻る' }))

    expect(mocks.state.cancelJob).not.toHaveBeenCalled()
    expect(mocks.state.queueRunning).toHaveLength(1)
    expect(screen.getByText('Portrait')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each([false, true])('normal bulk scope targets the same global set regardless of display filter (filter=%s)', async (filterOwnSession) => {
    mocks.state.filterOwnSession = filterOwnSession
    mocks.state.clearPendingQueue.mockResolvedValue(confirmedOperation('normal', 'queued'))
    render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('一括取消範囲'), { target: { value: 'normal' } })
    fireEvent.click(screen.getByRole('button', { name: 'キューのみクリア' }))
    fireEvent.click(screen.getByRole('button', { name: '確認してキューのみクリア' }))
    await waitFor(() => expect(mocks.state.clearPendingQueue).toHaveBeenCalledWith('normal'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('suppresses repeated clicks while an operation is pending', async () => {
    let resolveRequest: ((value: ReturnType<typeof confirmedOperation>) => void) | undefined
    mocks.state.clearPendingQueue.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))
    render(<JobManagementModal isOpen onClose={onClose} />)
    const button = screen.getByRole('button', { name: 'キューのみクリア' })
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: '確認してキューのみクリア' }))
    fireEvent.click(button)
    expect(mocks.state.clearPendingQueue).toHaveBeenCalledTimes(1)
    resolveRequest?.(confirmedOperation('all', 'queued'))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('keeps modal open and displays a message when queue lookup or cancellation throws', async () => {
    mocks.state.cancelAllJobs.mockRejectedValue(new Error('cancel timeout'))
    render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'すべて中断' }))
    fireEvent.click(screen.getByRole('button', { name: '確認してすべて中断' }))
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
    fireEvent.click(screen.getByRole('button', { name: '確認してキューのみクリア' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(longMessage)
    expect(screen.getByText('※ 自セッションのジョブのみを表示中')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('一括取消範囲'), { target: { value: 'normal' } })
    fireEvent.click(screen.getByRole('button', { name: 'すべて中断' }))
    fireEvent.click(screen.getByRole('button', { name: '確認してすべて中断' }))
    await waitFor(() => expect(mocks.state.cancelAllJobs).toHaveBeenCalledWith('normal'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('commits a queued-only cancellation once after 3000ms and refreshes the queue', async () => {
    vi.useFakeTimers()
    mocks.state.queuePending = [['pending', 'queued-prompt', 0, { client_id: 'session-b' }]]
    render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.click(screen.getByTitle('キューから削除'))
    expect(generationApi.cancelJob).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(2999) })
    expect(generationApi.cancelJob).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    await vi.waitFor(() => expect(generationApi.cancelJob).toHaveBeenCalledWith('queued-prompt', false, true))
    expect(generationApi.cancelJob).toHaveBeenCalledTimes(1)
    expect(mocks.state.fetchQueue).toHaveBeenCalledTimes(1)
  })

  it('undoes the reservation at 2999ms without changing the queue, then permits one new reservation', async () => {
    vi.useFakeTimers()
    const queuedRecord = ['pending', 'queued-prompt', 0, { client_id: 'session-b' }]
    mocks.state.queuePending = [queuedRecord]
    render(<JobManagementModal isOpen onClose={onClose} />)

    fireEvent.click(screen.getByTitle('キューから削除'))
    expect(screen.getByRole('status')).toHaveTextContent('取消予約（3秒後）')
    await act(async () => { await vi.advanceTimersByTimeAsync(2999) })
    expect(generationApi.cancelJob).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(1001) })
    expect(generationApi.cancelJob).not.toHaveBeenCalled()
    expect(mocks.state.cancelJob).not.toHaveBeenCalled()
    expect(mocks.state.queuePending).toEqual([queuedRecord])

    fireEvent.click(screen.getByTitle('キューから削除'))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    await vi.waitFor(() => expect(generationApi.cancelJob).toHaveBeenCalledWith('queued-prompt', false, true))
    expect(generationApi.cancelJob).toHaveBeenCalledTimes(1)
  })

  it.each(['close', 'backdrop', 'escape', 'unmount'] as const)('clears the queued cancellation timer on %s', async (action) => {
    vi.useFakeTimers()
    mocks.state.queuePending = [['pending', 'queued-prompt', 0, { client_id: 'session-b' }]]
    const view = render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.click(screen.getByTitle('キューから削除'))
    if (action === 'close') fireEvent.click(document.getElementById('close-job-management-modal-btn')!)
    else if (action === 'backdrop') fireEvent.click(screen.getByRole('dialog', { name: 'ジョブ管理' }).parentElement!)
    else if (action === 'escape') fireEvent.keyDown(document.getElementById('close-job-management-modal-btn')!, { key: 'Escape' })
    else view.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(generationApi.cancelJob).not.toHaveBeenCalled()
  })

  it('blocks backdrop and Escape dismissal while a committed queue operation is busy', async () => {
    let resolveRequest: ((value: ReturnType<typeof confirmedOperation>) => void) | undefined
    mocks.state.clearPendingQueue.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))
    render(<JobManagementModal isOpen onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'キューのみクリア' }))
    fireEvent.click(screen.getByRole('button', { name: '確認してキューのみクリア' }))
    fireEvent.keyDown(document.getElementById('close-job-management-modal-btn')!, { key: 'Escape' })
    fireEvent.click(screen.getByRole('dialog', { name: 'ジョブ管理' }).parentElement!)

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'ジョブ管理' })).toBeInTheDocument()

    resolveRequest?.({ ...confirmedOperation('all', 'queued'), upstream_clear: 'unconfirmed', message: 'partial' })
    await waitFor(() => expect(screen.getByText(/partial/)).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('requires inline confirmation for a running job and shows snapshot metadata', async () => {
    mocks.state.generationSnapshot = { jobs: [{
      prompt_id: 'prompt-running', set_name: 'Portrait', prompt_excerpt: 'blue jacket',
      node: { id: 'node-1', name: 'Sampler', value: 4, max: 20 },
    }] }
    render(<JobManagementModal isOpen onClose={onClose} />)
    expect(screen.getByText(/Portrait/)).toBeInTheDocument()
    expect(screen.getByText(/blue jacket/)).toBeInTheDocument()
    expect(screen.getByText(/Sampler · 4\/20/)).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('中断（生成を停止）'))
    expect(mocks.state.cancelJob).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '実行中ジョブを中断する' }))
    await waitFor(() => expect(mocks.state.cancelJob).toHaveBeenCalledWith('prompt-running'))
  })

  it('reports a queued job that started before the queued-only timer expired', async () => {
    vi.useFakeTimers()
    mocks.state.queuePending = [['pending', 'started-prompt', 0, { client_id: 'session-b' }]]
    vi.mocked(generationApi.cancelJob).mockRejectedValue(new Error('already running'))
    render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.click(screen.getByTitle('キューから削除'))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(generationApi.cancelJob).toHaveBeenCalledWith('started-prompt', false, true)
    expect(screen.getByText(/取消できません: started-prompt/)).toBeInTheDocument()
    expect(mocks.state.cancelJob).not.toHaveBeenCalled()
  })

  it('clears an inline bulk confirmation when the scope changes', () => {
    render(<JobManagementModal isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'キューのみクリア' }))
    expect(screen.getByRole('dialog', { name: '取消確認' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('一括取消範囲'), { target: { value: 'normal' } })
    expect(screen.queryByRole('dialog', { name: '取消確認' })).not.toBeInTheDocument()
  })
})
