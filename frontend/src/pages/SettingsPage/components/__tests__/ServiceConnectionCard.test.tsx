import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServiceConnectionCard } from '../ServiceConnectionCard'
import { configApi, llmPromptsApi } from '../../../../api/client'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { resolveComfyUrl } from '../../../../hooks/useComfyWebSocket'

vi.mock('../../../../api/client', () => ({
  configApi: { get: vi.fn() },
  llmPromptsApi: { getModels: vi.fn() },
}))
vi.mock('../../../../store/useGenerationStore', () => ({ useGenerationStore: vi.fn() }))
vi.mock('../../../../hooks/useComfyWebSocket', () => ({ resolveComfyUrl: vi.fn() }))

const mockedConfig = vi.mocked(configApi.get)
const mockedModels = vi.mocked(llmPromptsApi.getModels)
const mockedStore = vi.mocked(useGenerationStore)
const mockedResolve = vi.mocked(resolveComfyUrl)

function setup(comfyUrl: string | null = 'http://comfy.test:8188', configRequest?: Promise<unknown>) {
  const setComfyUrl = vi.fn()
  mockedStore.mockImplementation((selector: (state: { comfyUrl: string | null; setComfyUrl: typeof setComfyUrl }) => unknown) =>
    selector({ comfyUrl, setComfyUrl }),
  )
  mockedConfig.mockReturnValue((configRequest ?? Promise.resolve({ comfy_url: 'http://config-comfy:8188' })) as ReturnType<typeof configApi.get>)
  mockedModels.mockResolvedValue(['model-a'])
  mockedResolve.mockImplementation((url) => url ?? 'http://default-comfy:8188')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><ServiceConnectionCard /></QueryClientProvider>)
  return { setComfyUrl, client }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ServiceConnectionCard', () => {
  it('tracks async config while clean and preserves an edited draft', async () => {
    let resolveConfig!: (config: { comfy_url: string }) => void
    const configRequest = new Promise<{ comfy_url: string }>((resolve) => { resolveConfig = resolve })
    const { client } = setup(null, configRequest)
    const input = screen.getByLabelText(/comfyui url/i) as HTMLInputElement
    expect(input.value).toBe('http://default-comfy:8188')
    resolveConfig({ comfy_url: 'http://loaded-comfy:8188' })
    await waitFor(() => expect(input.value).toBe('http://loaded-comfy:8188'))
    fireEvent.change(input, { target: { value: 'http://my-draft:8188' } })
    client.setQueryData(['config'], { comfy_url: 'http://changed-comfy:8188' })
    expect(input.value).toBe('http://my-draft:8188')
  })

  it('saves a valid Comfy URL through the store and checks the effective URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    const { setComfyUrl } = setup()
    fireEvent.change(screen.getByLabelText(/comfyui url/i), { target: { value: 'https://new-comfy.test' } })
    fireEvent.click(screen.getByRole('button', { name: /urlを保存/i }))
    await waitFor(() => expect(setComfyUrl).toHaveBeenCalledWith('https://new-comfy.test'))
    fireEvent.click(screen.getByRole('button', { name: /接続を確認/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('http://comfy.test:8188', expect.objectContaining({ signal: expect.any(AbortSignal) })))
    expect(fetchMock).toHaveBeenCalledWith(`${window.location.origin}/health`, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    await waitFor(() => expect(mockedModels).toHaveBeenCalled())
  })

  it('rejects invalid URL input and reports HTTP failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    vi.stubGlobal('fetch', fetchMock)
    const { setComfyUrl } = setup(null)
    fireEvent.change(screen.getByLabelText(/comfyui url/i), { target: { value: 'file:///tmp/nope' } })
    fireEvent.click(screen.getByRole('button', { name: /urlを保存/i }))
    expect(setComfyUrl).not.toHaveBeenCalled()
    expect(await screen.findByText(/HTTPまたはHTTPS/i)).toBeInTheDocument()
    await waitFor(() => expect(mockedResolve).toHaveBeenCalledWith('http://config-comfy:8188'))
    fireEvent.click(screen.getByRole('button', { name: /接続を確認/i }))
    await waitFor(() => expect(screen.getByText(/HTTP 503/i)).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('http://config-comfy:8188', expect.any(Object))
    expect(screen.getByText(/LM Studio URLはbackendの.env/i)).toBeInTheDocument()
  })

  it('reports model lookup rejection and does not invent an LM Studio URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network timeout')))
    setup()
    mockedModels.mockRejectedValue(new Error('backend unavailable'))
    fireEvent.click(screen.getByRole('button', { name: /接続を確認/i }))
    await waitFor(() => expect(screen.getByText(/バックエンド経由のモデル確認に失敗/i)).toBeInTheDocument())
    expect(screen.getByText(/接続に失敗しました/i)).toBeInTheDocument()
    expect(screen.queryByText(/1234/)).not.toBeInTheDocument()
  })

  it('does not report an empty model list as connected and keeps backend status separate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    setup()
    mockedModels.mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: /接続を確認/i }))
    await waitFor(() => expect(screen.getByText(/モデルを取得できず接続確認不可/i)).toBeInTheDocument())
    expect(screen.getByText(/Backend: 接続済み/i)).toBeInTheDocument()
  })
})
