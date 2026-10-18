import { studioProject, studioItems } from './studioFixtures'
import { fixtureWorkflow, fixtureMasters, fixtureSnapshot, fixturePresets, fixtureCollectionCategories, fixtureCollectionModels, fixtureLoras, fixtureTagSets, fixtureHistorySnapshots, fixtureHistoryAlbums } from './fixtureData'
/**
 * Preview-only transport sandbox. Loaded before the real App via dynamic import.
 * All HTTP writes and all WebSocket connections are blocked; no production API is contacted.
 * Fixture coverage intentionally starts with the Generate empty state.
 */
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
})
const fixtures: Record<string, unknown> = {
  '/api/workflows': [{ id: fixtureWorkflow.id, name: fixtureWorkflow.name, created_at: fixtureWorkflow.created_at }],
  '/api/workflows/91001': fixtureWorkflow,
  '/api/mapping-masters': fixtureMasters,
  '/api/base-models': fixtureCollectionModels,
  '/api/lora-categories': fixtureCollectionCategories,
  '/api/tagset-categories': fixtureCollectionCategories,
  '/api/param-type-masters': [],
  '/api/loras': fixtureLoras,
  '/api/tag-sets': fixtureTagSets,
  '/api/albums': fixtureHistoryAlbums,
  '/api/snapshots': fixtureHistorySnapshots,
  '/api/dataset/projects': [studioProject],
  '/api/dataset/projects/93101/items': studioItems,

  '/api/config': { comfy_url: 'http://offline-prototype.invalid:8188' },
  '/api/generation/snapshot': fixtureSnapshot,
  '/api/generation/queue': { running: [], pending: [] },
}
export function installOfflineTransport() {
  // Only initialize sample selection if this isolated origin has none.
  if (!localStorage.getItem('prompt-surgeon-workflow-id')) {
    localStorage.setItem('prompt-surgeon-workflow-id', String(fixtureWorkflow.id))
  }
  const localPresets: Array<Record<string, any>> = fixturePresets.map(p => ({ ...p }))
  let nextPresetId = 92000
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null
    const path = new URL(request?.url ?? String(input), window.location.href).pathname
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const url = new URL(request?.url ?? String(input), window.location.href)
    // In-memory CRUD: resets on reload, never contacts backend or persists user data.
    if (path === '/api/workflow-presets' && method === 'GET') {
      return json(localPresets.filter(p => !url.searchParams.has('workflow_id') ||
        Number(url.searchParams.get('workflow_id')) === p.workflow_id))
    }
    if (path === '/api/workflow-presets' && method === 'POST') {
      const payload = JSON.parse(String(init?.body ?? '{}'))
      const now = new Date().toISOString()
      const preset = { ...payload, id: nextPresetId++, created_at: now, updated_at: now,
        sort_order: localPresets.length }
      localPresets.push(preset)
      return json(preset, 201)
    }
    const presetMatch = /^\/api\/workflow-presets\/(\d+)$/.exec(path)
    if (presetMatch && (method === 'PUT' || method === 'DELETE')) {
      const index = localPresets.findIndex(p => p.id === Number(presetMatch[1]))
      if (index < 0) return json({ detail: 'Preset not found' }, 404)
      if (method === 'DELETE') { localPresets.splice(index, 1); return json(null) }
      const payload = JSON.parse(String(init?.body ?? '{}'))
      localPresets[index] = { ...localPresets[index], ...payload, updated_at: new Date().toISOString() }
      return json(localPresets[index])
    }
    if (path === '/api/workflow-presets/reorder' && method === 'PUT') {
      const payload = JSON.parse(String(init?.body ?? '{}'))
      for (const [index, id] of (payload.ordered_ids ?? []).entries()) {
        const preset = localPresets.find(p => p.id === id)
        if (preset) preset.sort_order = index
      }
      return json(null)
    }
    if (path === '/api/workflow-presets/bulk' && method === 'DELETE') {
      const payload = JSON.parse(String(init?.body ?? '{}'))
      for (const id of payload.ids ?? []) {
        const index = localPresets.findIndex(p => p.id === id)
        if (index >= 0) localPresets.splice(index, 1)
      }
      return json(null)
    }
    if (method === 'GET' && /^\\/api\\/dataset\\/projects\\/93101\\/items\\/?$/.test(path)) return json(studioItems)
    if (method === 'GET' && /^\\/api\\/dataset\\/projects\\/?$/.test(path)) return json([studioProject])
    if (method !== 'GET' && method !== 'HEAD') {
      return json({ detail: 'Unsupported offline write: ' + method + ' ' + path }, 403)
    }
    const snapshotDetail = new RegExp('^/api/snapshots/([0-9]+)$').exec(path)
    if (snapshotDetail) {
      const snap = fixtureHistorySnapshots.find(x=>x.id===Number(snapshotDetail[1]))
      return snap ? json({...snap,params:{seed:42,steps:28,cfg:7},loras:[],tag_sets:[]}) : json({detail:'Snapshot not found'},404)
    }
    if (path === '/api/snapshots') {
      const workflowId = url.searchParams.get('workflow_id')
      return json(workflowId ? fixtureHistorySnapshots.filter(x=>x.workflow_id===Number(workflowId)) : fixtureHistorySnapshots)
    }
    const albumDetail = new RegExp('^/api/albums/([0-9]+)$').exec(path)
    if (albumDetail) {
      const album = fixtureHistoryAlbums.find(x=>x.id===Number(albumDetail[1]))
      return album ? json(album) : json({detail:'Album not found'},404)
    }
    if (path in fixtures) return json(fixtures[path])
    if (path === '/api/generation/snapshot' || path === '/api/generation/state') return json(fixtureSnapshot)
    if (path.startsWith('/api/')) {
      const url = new URL(request?.url ?? String(input), window.location.href)
      if (url.pathname === '/api/workflow-presets') return json(fixturePresets.filter(p => !url.searchParams.has('workflow_id') || Number(url.searchParams.get('workflow_id')) === p.workflow_id))
    }
    if (path.startsWith('/api/')) {
      // Unsupported fixture: explicit failure prevents misleading fake success.
      return json({ detail: 'No offline fixture for ' + path }, 404)
    }
    if (new URL(request?.url ?? String(input), window.location.href).origin !== window.location.origin) {
      return json({ detail: 'External requests disabled in UI prototype' }, 403)
    }
    return originalFetch(input, init)
  }
  class OfflineWebSocket extends EventTarget {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3
    readonly CONNECTING = 0
    readonly OPEN = 1
    readonly CLOSING = 2
    readonly CLOSED = 3
    readonly readyState = 3
    readonly bufferedAmount = 0
    readonly binaryType = 'blob'
    readonly extensions = ''
    readonly protocol = ''
    readonly url: string
    onopen: ((event: Event) => void) | null = null
    onclose: ((event: CloseEvent) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    constructor(url: string | URL) {
      super()
      this.url = String(url)
      // Deliberately disconnected; do not simulate successful backend connection.
    }
    send() { throw new Error('Offline prototype: WebSocket disabled') }
    close() {}
  }
  Object.defineProperty(window, 'WebSocket', { value: OfflineWebSocket, configurable: true })
  // XHR is used by some libraries; block it rather than accidentally reaching the backend.
  Object.defineProperty(window, 'XMLHttpRequest', {
    configurable: true,
    value: class {
      open() { throw new Error('Offline prototype: XMLHttpRequest disabled') }
      send() { throw new Error('Offline prototype: XMLHttpRequest disabled') }
      setRequestHeader() {}
      abort() {}
    },
  })
}
