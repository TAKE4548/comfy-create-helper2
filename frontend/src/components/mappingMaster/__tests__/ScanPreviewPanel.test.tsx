import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../../test/mocks/server'
import { ScanPreviewPanel } from '../ScanPreviewPanel'
import type { ScanPreviewRequest, ScanPreviewResponse, ScanPreviewCandidate } from '../../../api/types'

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const cand = (id: string, label: 'exact' | 'contains' | 'no_selector' = 'exact'): ScanPreviewCandidate => ({
  node_id: id, node_title: `Title${id}`, class_type: 'KSampler', input_name: 'steps',
  stage_rank: label === 'exact' ? 1 : label === 'contains' ? 2 : 3, stage_label: label,
  entry_priority: 0, pattern_priority: 0,
})

const req = (wid: number): ScanPreviewRequest => ({
  workflow_id: wid,
  variants: [{ client_key: 'a', stage_id: 1, role: 'r', is_enabled: true, entries: [], patterns: null }],
})

const workflowsHandler = (list = [{ id: 7, name: 'WF-A', created_at: '' }, { id: 8, name: 'WF-B', created_at: '' }]) =>
  http.get('/api/workflows', () => HttpResponse.json(list))

function renderPanel(buildRequest: (id: number) => ScanPreviewRequest | null = (id) => req(id)) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ScanPreviewPanel buildRequest={buildRequest} rowLabels={{ a: 'Rough / steps' }} />
    </QueryClientProvider>,
  )
}

async function waitOptions(n: number) {
  const sel = await screen.findByLabelText('プレビュー対象ワークフロー')
  await waitFor(() => expect(sel.querySelectorAll('option')).toHaveLength(n))
  return sel
}

const runButton = () => screen.getByRole('button', { name: /プレビュー実行|判定中/ })

const mkResp = (key: string): ScanPreviewResponse => ({
  workflow_id: 7,
  results: [{ client_key: key, variant_id: null, stage_id: 1, stage_key: 's', role: key, is_enabled: true, status: 'not_found', confirmed: null, candidates: [] }],
})

describe('ScanPreviewPanel', () => {
  it('[REQ-419/AC-9] preview renders per-variant result with stage labels and warnings', async () => {
    const body: ScanPreviewResponse = {
      workflow_id: 7,
      results: [
        { client_key: 'a', variant_id: 1, stage_id: 1, stage_key: 's', role: 'r1', is_enabled: true, status: 'ok', confirmed: cand('11'), candidates: [cand('11')] },
        { client_key: 'b', variant_id: null, stage_id: 1, stage_key: 's', role: 'r2', is_enabled: true, status: 'duplicated', confirmed: null, candidates: [cand('21', 'no_selector'), cand('22', 'no_selector')] },
        { client_key: 'c', variant_id: null, stage_id: 1, stage_key: 's', role: 'r3', is_enabled: true, status: 'not_found', confirmed: null, candidates: [] },
        { client_key: 'd', variant_id: null, stage_id: 1, stage_key: 's', role: 'r4', is_enabled: false, status: 'disabled', confirmed: null, candidates: [] },
      ],
    }
    server.use(workflowsHandler(), http.post('/api/mapping-masters/scan-preview', () => HttpResponse.json(body)))
    renderPanel()
    await waitOptions(2)
    fireEvent.click(runButton())
    const a = await screen.findByTestId('scan-preview-result-a')
    expect(within(a).getByText('Rough / steps')).toBeInTheDocument()
    expect(within(a).getAllByText('ノードID: 11')).toHaveLength(2)
    expect(within(a).getAllByText('完全一致').length).toBeGreaterThan(0)
    const b = screen.getByTestId('scan-preview-result-b')
    expect(within(b).getByText('duplicated: 候補が複数あり確定できません')).toBeInTheDocument()
    expect(within(b).getAllByRole('listitem')).toHaveLength(2)
    expect(within(b).getAllByText('セレクタなし')).toHaveLength(2)
    const c = screen.getByTestId('scan-preview-result-c')
    expect(within(c).getByText('not_found: 候補がありません')).toBeInTheDocument()
    expect(within(c).getByText('候補なし')).toBeInTheDocument()
    const d = screen.getByTestId('scan-preview-result-d')
    expect(within(d).getByText('r4')).toBeInTheDocument()
    expect(within(d).getByText('無効（判定対象外）')).toBeInTheDocument()
    expect(within(d).queryByText('候補なし')).toBeNull()
  })

  it('[REQ-419/AC-9] preview sends the unsaved draft', async () => {
    let received: unknown = null
    server.use(workflowsHandler(), http.post('/api/mapping-masters/scan-preview', async ({ request }) => {
      received = await request.json()
      return HttpResponse.json({ workflow_id: 8, results: [] })
    }))
    const build = vi.fn((id: number) => req(id))
    renderPanel(build)
    const sel = await waitOptions(2)
    fireEvent.change(sel, { target: { value: '8' } })
    fireEvent.click(runButton())
    await waitFor(() => expect(received).not.toBeNull())
    expect(build).toHaveBeenCalledWith(8)
    expect(received).toEqual(req(8))
    expect((received as ScanPreviewRequest).workflow_id).toBe(8)
  })

  it('[REQ-419/AC-9] preview failure keeps draft and ignores stale responses', async () => {
    server.use(workflowsHandler(), http.post('/api/mapping-masters/scan-preview', () => new HttpResponse('boom', { status: 500 })))
    const build = vi.fn((id: number) => req(id))
    renderPanel(build)
    await waitOptions(2)
    fireEvent.click(runButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('プレビューに失敗しました')

    server.use(http.post('/api/mapping-masters/scan-preview', () => HttpResponse.error()))
    fireEvent.click(runButton())
    await waitFor(() => expect(screen.getByRole('button', { name: 'プレビュー実行' })).toBeEnabled())
    expect(await screen.findByRole('alert')).toHaveTextContent('プレビューに失敗しました')

    server.use(http.post('/api/mapping-masters/scan-preview', () => new HttpResponse('nf', { status: 404 })))
    fireEvent.click(runButton())
    expect(await screen.findByText(/ワークフローが見つかりません/)).toBeInTheDocument()

    // stale: first call delayed; switching workflow invalidates it; second call returns first
    let n = 0
    server.use(http.post('/api/mapping-masters/scan-preview', async () => {
      n += 1
      if (n === 1) { await delay(300); return HttpResponse.json(mkResp('first')) }
      return HttpResponse.json(mkResp('second'))
    }))
    fireEvent.click(runButton())
    await waitFor(() => expect(n).toBe(1))
    fireEvent.change(screen.getByLabelText('プレビュー対象ワークフロー'), { target: { value: '8' } })
    fireEvent.click(runButton())
    expect(await screen.findByTestId('scan-preview-result-second')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 500))
    expect(screen.queryByTestId('scan-preview-result-first')).toBeNull()
    expect(screen.getByTestId('scan-preview-result-second')).toBeInTheDocument()
  })

  it('[REQ-419/AC-9] preview is disabled when no workflow is registered', async () => {
    server.use(workflowsHandler([]))
    renderPanel()
    expect(await screen.findByText('登録済みワークフローがありません')).toBeInTheDocument()
    expect(screen.getByLabelText('プレビュー対象ワークフロー')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'プレビュー実行' })).toBeDisabled()
  })

  it('[REQ-419/AC-10] preview never calls persistence endpoints', async () => {
    const seen: Array<{ method: string; path: string }> = []
    const listener = ({ request }: { request: Request }) => {
      seen.push({ method: request.method, path: new URL(request.url).pathname })
    }
    server.events.on('request:start', listener)
    server.use(workflowsHandler(), http.post('/api/mapping-masters/scan-preview', () => HttpResponse.json({ workflow_id: 7, results: [] })))
    renderPanel()
    await waitOptions(2)
    fireEvent.click(runButton())
    await waitFor(() => expect(seen.some((s) => s.path === '/api/mapping-masters/scan-preview')).toBe(true))
    server.events.removeListener('request:start', listener)
    const writes = seen.filter((s) => ['POST', 'PUT', 'DELETE', 'PATCH'].includes(s.method))
    expect(writes.length).toBeGreaterThan(0)
    for (const w of writes) expect(w.path).toBe('/api/mapping-masters/scan-preview')
  })
})
