import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { JobManagementModal } from '../JobManagementModal'
import { generationApi } from '../../api/domains/generation'
import { cleanupAllTestState } from '../../test/utils'

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
    releaseUnconfirmed: vi.fn(),
  },
}))

vi.mock('../../store/useGenerationStore', () => {
  const hook = Object.assign(() => mocks.state, {
    getState: () => mocks.state,
    setState: vi.fn(),
    getInitialState: () => mocks.state,
    subscribe: vi.fn(),
  })
  return {
    useGenerationStore: hook,
    _resetWebSocketForTesting: vi.fn(),
  }
})

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

const HOSTILE = '<img src=x onerror="window.__rt12=1"><script>window.__rt12=1</script>&lt;b&gt;'
const LONG_REASON = 'R'.repeat(4000)   // no whitespace: must wrap via overflow-wrap:anywhere
const LONG_EXCERPT = 'E'.repeat(4000)
const LONG_ID = `prompt-${'x'.repeat(300)}`

const expectNoInjectedMarkup = (root: HTMLElement) => {
  expect(root.querySelector('img, script, iframe, object, [onerror], [onload]')).toBeNull()
  expect((window as unknown as { __rt12?: number }).__rt12).toBeUndefined()
}

describe('JobManagementModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    cleanupAllTestState()
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

  afterEach(() => {
    cleanupAllTestState()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

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

  it('[REQ-335/AC-1] shows 状態未確認 section separately from 待機中 and never labels it 待機中', () => {
    mocks.state.queueRunning = []
    mocks.state.queuePending = []
    mocks.state.filterOwnSession = true
    mocks.state.generationSnapshot = { jobs: [
      { job_id: 'job-u', prompt_id: null, status: 'unconfirmed', session_id: 'session-a', set_name: 'Portrait', failure: { reason: '投入結果を確認できません', outcome: 'unconfirmed' }, release: null },
      { job_id: 'job-other', prompt_id: null, status: 'unconfirmed', session_id: 'session-b', failure: { reason: 'OTHER-SESSION-REASON', outcome: 'unconfirmed' }, release: null },
    ] }
    render(<JobManagementModal isOpen onClose={onClose} />)

    expect(screen.getByText('待機中のキュー (0)')).toBeInTheDocument()
    expect(screen.getByText('状態未確認の記録 (1)')).toBeInTheDocument()
    const row = screen.getByTestId('unconfirmed-job-row')
    expect(row.textContent).not.toContain('待機中')
    expect(row).toHaveTextContent('投入結果を確認できません')
    expect(screen.queryByText(/OTHER-SESSION-REASON/)).not.toBeInTheDocument()
  })

  it('[REQ-335/AC-2] single cancel of an unconfirmed row shows the unconfirmed message and keeps the row', async () => {
    mocks.state.queueRunning = []
    mocks.state.queuePending = []
    mocks.state.generationSnapshot = { jobs: [
      { job_id: 'job-u', prompt_id: 'prompt-u', status: 'unconfirmed', session_id: 'session-a', failure: { reason: 'timeout', outcome: 'unconfirmed' }, release: null },
    ] }
    mocks.state.cancelJob.mockResolvedValue({ job_id: 'job-u', prompt_id: 'prompt-u', status: 'unconfirmed', outcome: 'unconfirmed', message: 'still unknown' })
    render(<JobManagementModal isOpen onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: '取消を試行' }))

    await waitFor(() => expect(screen.getByText(/取消を確認できません（状態未確認のままです）/)).toBeInTheDocument())
    expect(screen.getByTestId('unconfirmed-job-row')).toBeInTheDocument()
  })

  it('[REQ-335/AC-2] bulk result with unconfirmed leftovers keeps the modal open with confirmed/unconfirmed counts', async () => {
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

    await waitFor(() => expect(screen.getByText(/確認済み: 1件、未確認: 2件/)).toBeInTheDocument())
    expect(screen.getByText(/状態未確認の記録」欄から解除できます/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('[REQ-335/AC-3] release requires confirmation that states it is not an upstream cancellation and reports per-item outcome', async () => {
    mocks.state.queueRunning = []
    mocks.state.queuePending = []
    mocks.state.generationSnapshot = { jobs: [
      { job_id: 'job-u', prompt_id: 'prompt-u', status: 'unconfirmed', session_id: 'session-a', failure: { reason: 'timeout', outcome: 'unconfirmed' }, release: null },
      { job_id: 'job-r', prompt_id: 'prompt-r', status: 'released', session_id: 'session-a', failure: null, release: { released_at: '2026-10-25T00:00:00Z', released_by_session: 'session-a', reason: 'user_release', upstream_check: 'not_checked', late_prompt_id: null } },
    ] }
    mocks.state.releaseUnconfirmed.mockResolvedValue({
      items: [
        { job_id: 'job-u', prompt_id: 'prompt-u', status: 'released', outcome: 'released', message: 'ok' },
        { job_id: 'job-x', prompt_id: 'prompt-x', status: 'unconfirmed', outcome: 'not_released', message: 'state changed' },
      ],
    })
    render(<JobManagementModal isOpen onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: '記録を解除' }))
    expect(screen.getByRole('dialog', { name: '解除確認' })).toHaveTextContent('ComfyUI側の取消ではありません')
    fireEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(screen.queryByRole('dialog', { name: '解除確認' })).not.toBeInTheDocument()
    expect(mocks.state.releaseUnconfirmed).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '記録を解除' }))
    fireEvent.click(screen.getByRole('button', { name: '確認して解除' }))

    await waitFor(() => expect(screen.getByText(/解除しました: 1件（上流の取消確認ではありません）/)).toBeInTheDocument())
    expect(screen.getByText(/解除できなかった記録: 1件/)).toBeInTheDocument()
    expect(mocks.state.releaseUnconfirmed).toHaveBeenCalledTimes(1)
    expect(mocks.state.releaseUnconfirmed).toHaveBeenCalledWith(['job-u'])
    expect(screen.getByText('解除済みの記録 (1)')).toBeInTheDocument()
    expect(screen.getByText(/prompt-r · 解除済み（上流の取消確認ではありません）/)).toBeInTheDocument()
  })

  it('[REQ-335/AC-1] RT-12 renders hostile HTML-like reason, set name, excerpt and ids as literal escaped text', () => {
    mocks.state.queueRunning = []
    mocks.state.queuePending = []
    mocks.state.generationSnapshot = { jobs: [
      { job_id: 'job-x', prompt_id: HOSTILE, status: 'unconfirmed', session_id: 'session-a',
        set_name: HOSTILE, prompt_excerpt: HOSTILE, failure: { reason: HOSTILE, outcome: 'unconfirmed' }, release: null },
    ] }
    render(<JobManagementModal isOpen onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'ジョブ管理' })
    const row = screen.getByTestId('unconfirmed-job-row')
    expectNoInjectedMarkup(dialog)
    expect(row.textContent).toContain(HOSTILE)          // shown as literal text, not parsed as markup
    expect(row.textContent).not.toContain('待機中')
    expect(screen.getByText('状態未確認の記録 (1)')).toBeInTheDocument()
  })

  it('[REQ-335/AC-1] RT-12 keeps very long unbroken reason, excerpt and ids wrapped or truncated inside width-bounded rows', () => {
    // jsdom has no layout engine: assert the wrap/truncate class contract, not measured overflow.
    mocks.state.queueRunning = []
    mocks.state.queuePending = []
    mocks.state.generationSnapshot = { jobs: [
      { job_id: 'job-long', prompt_id: LONG_ID, status: 'unconfirmed', session_id: 'session-a',
        set_name: null, prompt_excerpt: LONG_EXCERPT, failure: { reason: LONG_REASON, outcome: 'unconfirmed' }, release: null },
      { job_id: 'job-rel', prompt_id: `released-${LONG_ID}`, status: 'released', session_id: 'session-a', failure: null,
        release: { released_at: '2026-10-25T00:00:00Z', released_by_session: 'session-a', reason: 'user_release', upstream_check: 'not_checked', late_prompt_id: null } },
    ] }
    render(<JobManagementModal isOpen onClose={onClose} />)

    const row = screen.getByTestId('unconfirmed-job-row')
    expect(row).toHaveClass('min-w-0')
    for (const text of [LONG_REASON, LONG_EXCERPT]) {
      const el = within(row).getByText(text)
      expect(el).toHaveClass('break-words', '[overflow-wrap:anywhere]')
      expect(el).not.toHaveClass('truncate')               // important text is wrapped, never cut
    }
    expect(within(row).getByText(LONG_ID)).toHaveClass('min-w-0', 'flex-1', 'truncate')
    expect(row.parentElement).toHaveClass('overflow-y-auto', 'overscroll-contain')
    expect(screen.getByText(new RegExp(`released-${LONG_ID}`))).toHaveClass('min-w-0', 'break-words')
  })

  it('[REQ-335/AC-3] RT-12 keeps the release dialog and result messages escaped and non-echoing for hostile ids and upstream messages', async () => {
    mocks.state.queueRunning = []
    mocks.state.queuePending = []
    mocks.state.generationSnapshot = { jobs: [
      { job_id: 'job-x', prompt_id: HOSTILE, status: 'unconfirmed', session_id: 'session-a',
        failure: { reason: HOSTILE, outcome: 'unconfirmed' }, release: null },
    ] }
    mocks.state.cancelJob.mockResolvedValue({ job_id: 'job-x', prompt_id: HOSTILE, status: 'unconfirmed', outcome: 'unconfirmed', message: `${HOSTILE}${LONG_REASON}` })
    mocks.state.releaseUnconfirmed.mockResolvedValue({
      items: [{ job_id: 'job-x', prompt_id: HOSTILE, status: 'released', outcome: 'released', message: HOSTILE }],
    })
    render(<JobManagementModal isOpen onClose={onClose} />)
    const modal = screen.getByRole('dialog', { name: 'ジョブ管理' })

    fireEvent.click(screen.getByRole('button', { name: '取消を試行' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('取消を確認できません（状態未確認のままです）'))
    expect(screen.getByRole('status').textContent).toContain(HOSTILE)
    expect(screen.getByRole('status')).toHaveClass('break-words', '[overflow-wrap:anywhere]')
    expectNoInjectedMarkup(modal)

    fireEvent.click(screen.getByRole('button', { name: '記録を解除' }))
    const confirm = screen.getByRole('dialog', { name: '解除確認' })
    expect(confirm).toHaveTextContent('ComfyUI側の取消ではありません')
    expect(confirm.textContent).not.toContain('<img')        // count only: user-supplied text is never echoed
    expectNoInjectedMarkup(modal)

    fireEvent.click(screen.getByRole('button', { name: '確認して解除' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('解除しました: 1件（上流の取消確認ではありません）'))
    expect(mocks.state.releaseUnconfirmed).toHaveBeenCalledWith(['job-x'])
    expect(screen.getByRole('status').textContent).not.toContain('<img')
    expectNoInjectedMarkup(modal)
  })
})
