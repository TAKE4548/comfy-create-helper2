import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerationMetadataPanel, type MetadataItemView } from '../GenerationMetadataPanel'
import type { PromptFieldView } from '../GenerationPromptFields'
import { SnapshotMetadataTab } from '../history/SnapshotMetadataTab'
import { getMetadataView } from '../../utils/promptRecord'
import { PROMPT_RECORD_KEY } from '../../utils/generationRecord'

vi.mock('../SnapshotTagAssociationsPanel', () => ({ SnapshotTagAssociationsPanel: () => null }))

const fields: PromptFieldView[] = [{ key: 'p', name: 'Prompt', role: 'positive', nodeId: '1', recorded: true, value: 'seed prompt', status: 'submitted' }]
const items: MetadataItemView[] = [
  { key: 'steps', name: 'Steps', recorded: true, value: 0 },
  { key: 'enabled', name: 'Enabled', recorded: true, value: false },
  { key: 'extra', name: 'Extension data', recorded: true, value: { list: [1, null, 'x'] } },
]
const base = {
  imageUrl: '/image.png', promptId: 'p1', header: { workflowId: 12, workflowName: 'Portrait', queuedAt: '2026-01-02T03:04:00Z', metadataSavedAt: '2026-01-02T03:04:02Z', completedAt: '2026-01-02T03:04:01Z', imageSavedAt: null, albums: ['Favorites'] },
  fields, parameters: items.slice(0, 2), extras: items.slice(2), actualSeed: '987654',
  loraRows: [{ key: 'l1', model: 'style.safetensors', role: 'LoRA', weight: '0.6', modelStrength: '0.7', clipStrength: '0.4' }],
  assets: [{ key: 'a1', name: 'Character', recorded: true, value: ['blue hair'] }], warning: null,
}

describe('GenerationMetadataPanel', () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'image/png' } })) })

  it('shows workflow facts and switches to counted parameter metadata', async () => {
    await act(async () => { render(<GenerationMetadataPanel {...base} />); await Promise.resolve() })
    expect(screen.getByText('Portrait')).toBeTruthy()
    expect(screen.getByText('Workflow ID')).toBeTruthy()
    expect(screen.getByText('Prompt ID')).toBeTruthy()
    expect(screen.getByText('p1')).toBeTruthy()
    expect(screen.getByText(/生成キュー登録/)).toBeTruthy()
    expect(screen.getByText(/メタ情報保存/)).toBeTruthy()
    expect(screen.getByText('生成完了時刻')).toBeTruthy()
    expect(screen.getByText((_, node) => node?.textContent === '生成完了時刻2026-01-02T03:04:01Z')).toBeTruthy()
    expect(screen.getByText((_, node) => node?.textContent === '画像保存時刻未記録')).toBeTruthy()
    expect(screen.getByText('アルバム（現在）')).toBeTruthy()
    expect(screen.getByText('Favorites')).toBeTruthy()
    const promptsTab = screen.getByRole('tab', { name: 'Prompts (1)' })
    const metadataTab = screen.getByRole('tab', { name: 'Parameters & Assets (5)' })
    expect(promptsTab.className).toContain('border-sky-400')
    expect(promptsTab.className).toContain('focus-visible:outline')
    expect(metadataTab.className).toContain('border-transparent')
    fireEvent.click(metadataTab)
    expect(metadataTab.className).toContain('border-sky-400')
    expect(promptsTab.className).toContain('border-transparent')
    expect(screen.getByRole('heading', { name: 'パラメータ (2)' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'その他 (1)' })).toBeTruthy()
    expect(screen.getByText('Steps')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText('false')).toBeTruthy()
  })

  it('shows 未記録 for absent completion time instead of substituting queued or image-saved time', async () => {
    const header = {
      workflowId: base.header.workflowId,
      workflowName: base.header.workflowName,
      queuedAt: '2026-01-02T03:04:00Z',
      metadataSavedAt: base.header.metadataSavedAt,
      imageSavedAt: '2026-01-02T03:05:00Z',
      albums: base.header.albums,
    }
    await act(async () => { render(<GenerationMetadataPanel {...base} header={header} />); await Promise.resolve() })

    expect(screen.getByText((_, node) => node?.textContent === '生成完了時刻未記録')).toBeTruthy()
    expect(screen.getByText((_, node) => node?.textContent === '画像保存時刻2026-01-02T03:05:00Z')).toBeTruthy()
  })

  it('passes the recorded completion time for an active Snapshot without substituting snapshot.created_at', async () => {
    const completedAt = '2026-01-02T03:04:01Z'
    const view = { ...getMetadataView(null), completedAt }
    const snapshot = {
      id: 7, workflow_id: 12, params: {}, image_path: '/snapshot.png',
      created_at: '2026-01-02T03:05:00Z',
    }
    await act(async () => {
      render(<SnapshotMetadataTab
        activeImage="/snapshot.png" activeSnapshotId={7} promptId="p1"
        isLoading={false} isServerMetaLoading={false} view={view}
        recordedMetadata={undefined} snapshot={snapshot} albums={[]} albumsError={false}
        onPersisted={() => {}} onEditingChange={() => {}}
      />)
      await Promise.resolve()
    })

    expect(screen.getByText((_, node) => node?.textContent === `生成完了時刻${completedAt}`)).toBeTruthy()
    expect(screen.getByText((_, node) => node?.textContent === '画像保存時刻2026-01-02T03:05:00Z')).toBeTruthy()
  })

  it('shows current-image local metadata while only the server completion timestamp is loading', async () => {
    const localRecord = {
      version: 1,
      workflow_id: 12,
      workflow_name: 'Local workflow A',
      completeness: 'complete',
      prompt_id: 'p-a',
      fields: [{ mapping_id: 1, node_id: '1', display_name: 'Prompt', role: 'positive', recorded: true, value: 'image A prompt', status: 'submitted' }],
      parameters: [],
      assets: [],
      queued_at: null,
    }
    const localView = getMetadataView({ [PROMPT_RECORD_KEY]: JSON.stringify(localRecord) })
    expect(localView.record).toBeTruthy()
    const props = {
      activeImage: '/a.png', activeSnapshotId: null, promptId: 'p-a',
      isLoading: false, isServerMetaLoading: true, view: localView,
      recordedMetadata: undefined, snapshot: undefined, albums: [], albumsError: false,
      onPersisted: () => {}, onEditingChange: () => {},
    }
    const { rerender } = render(<SnapshotMetadataTab {...props} />)

    expect(screen.getByRole('tab', { name: 'Prompts (1)' })).toBeTruthy()
    expect(screen.getByText('image A prompt')).toBeTruthy()
    expect(screen.queryByText('Loading metadata...')).toBeNull()

    rerender(<SnapshotMetadataTab {...props} activeImage="/b.png" promptId="p-b" view={getMetadataView(null)} />)
    expect(screen.getByText('Loading metadata...')).toBeTruthy()
    expect(screen.queryByText('image A prompt')).toBeNull()
  })

  it('shows LoRA strengths independently, assets and association content on the assets tab', async () => {
    await act(async () => { render(<GenerationMetadataPanel {...base} associationPanel={<button>タグセット編集</button>} />); await Promise.resolve() })
    fireEvent.click(screen.getByRole('tab', { name: 'Parameters & Assets (5)' }))
    expect(screen.getByText('style.safetensors')).toBeTruthy()
    expect(screen.getByText('モデル強度: 0.7')).toBeTruthy()
    expect(screen.getByText('CLIP強度: 0.4')).toBeTruthy()
    expect(screen.getByText('Character')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'タグセット編集' })).toBeTruthy()
    const associationButton = screen.getByRole('button', { name: 'タグセット編集' })
    fireEvent.click(screen.getByRole('tab', { name: 'Prompts (1)' }))
    expect(associationButton.isConnected).toBe(true)
    expect(document.getElementById('metadata-assets')?.hidden).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Parameters & Assets (5)' }))
    expect(screen.getByRole('button', { name: 'タグセット編集' })).toBe(associationButton)
    expect(document.getElementById('metadata-assets')?.hidden).toBe(false)
  })

  it('shows pixel size and reduced ratio and ignores stale image facts after switching images', async () => {
    const resolvers: ((response: Response) => void)[] = []
    const fetchMock = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>((resolve) => resolvers.push(resolve)))
    vi.stubGlobal('fetch', fetchMock)
    let view!: ReturnType<typeof render>
    await act(async () => { view = render(<GenerationMetadataPanel {...base} />); await Promise.resolve() })
    const { container, rerender } = view
    const image = container.querySelector('img')!
    Object.defineProperties(image, { naturalWidth: { value: 832, configurable: true }, naturalHeight: { value: 1216, configurable: true } })
    fireEvent.load(image)
    expect(screen.getByText((_, node) => node?.textContent === '画像サイズ: 832 × 1216 (13:19)')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/image.png', expect.objectContaining({ method: 'HEAD', cache: 'no-store' }))
    await act(async () => { rerender(<GenerationMetadataPanel {...base} imageUrl="/next.png" />); await Promise.resolve() })
    expect(fetchMock).toHaveBeenCalledWith('/next.png', expect.objectContaining({ signal: expect.anything() }))
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true)
    expect(screen.getByText((_, node) => node?.textContent === '画像サイズ: 未取得')).toBeTruthy()
    fireEvent.load(image)
    expect(screen.getByText((_, node) => node?.textContent === '画像サイズ: 未取得')).toBeTruthy()
    await act(async () => { resolvers[0]({ ok: true, headers: { get: () => 'image/jpeg' } } as Response); await Promise.resolve() })
    expect(screen.getByText((_, node) => node?.textContent === '形式: 未取得')).toBeTruthy()
    await act(async () => { resolvers[1]({ ok: true, headers: { get: () => 'image/webp' } } as Response); await Promise.resolve() })
    expect(screen.getByText((_, node) => node?.textContent === '形式: image/webp')).toBeTruthy()
  })

  it('handles MIME lookup failure and copies only a recorded actual seed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    let view!: ReturnType<typeof render>
    await act(async () => { view = render(<GenerationMetadataPanel {...base} />); await Promise.resolve() })
    expect(await screen.findByText((_, node) => node?.textContent === '形式: 未取得')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '実際のseedをコピー' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('987654'))
    await act(async () => { view.rerender(<GenerationMetadataPanel {...base} actualSeed={null} />); await Promise.resolve() })
    expect(screen.getByRole('button', { name: '実際のseedをコピー' }).hasAttribute('disabled')).toBe(true)
  })

  it('reports clipboard denial without replacing the facts', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    await act(async () => { render(<GenerationMetadataPanel {...base} />); await Promise.resolve() })
    fireEvent.click(screen.getByRole('button', { name: '実際のseedをコピー' }))
    expect(await screen.findByText('seedのコピーに失敗しました。')).toBeTruthy()
    expect(screen.getByText('987654')).toBeTruthy()
  })
})
