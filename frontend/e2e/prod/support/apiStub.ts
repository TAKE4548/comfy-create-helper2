import type { Page, Route } from '@playwright/test'

export interface StubRequest {
  method: string
  /** Path with the `/api` prefix removed, e.g. `/workflows/1` */
  path: string
  query: URLSearchParams
  body: unknown
}

export interface ApiStubOverride {
  status?: number
  body: unknown
}

export interface ApiStubOptions {
  /** Overrides only `/workflows` and `/workflows/1`. */
  workflow?: unknown
  /** Override default responses. Return undefined to fall through to defaults. Applied to every method. */
  override?: (req: StubRequest) => ApiStubOverride | Promise<ApiStubOverride | undefined> | undefined
  /** Observe every request. Does not affect responses. */
  observe?: (req: StubRequest) => void
}

const STAMP = '2026-10-27T00:00:00Z'

const workflow = {
  id: 1,
  name: 'W1',
  created_at: STAMP,
  target_base_model_id: null,
  json_body: { '6': { class_type: 'CLIPTextEncode', inputs: { text: '' } } },
  mappings: [
    {
      id: 1,
      master_id: 1,
      node_id: '6',
      role: 'positive',
      param_name: 'text',
      input_type: 'textarea',
      display_name: 'Prompt',
    },
  ],
}

const mappingMasters = [
  {
    id: 1,
    role: 'positive',
    param_name: 'text',
    input_type: 'textarea',
    display_name: 'Prompt',
    expected_class_types: ['CLIPTextEncode'],
    title_patterns: null,
    sort_order: 0,
  },
]

const defaultPreset = {
  id: 101,
  workflow_id: 1,
  name: 'Set 1',
  param_values: { positive: '' },
  applied_assets: {},
  batch_size: 1,
  seed_mode: 'fixed',
  seed: 42,
  sort_order: 0,
  created_at: STAMP,
  updated_at: STAMP,
}

const generationState = {
  version: 1,
  epoch: 'prod-measure',
  revision: 1,
  normal_group_id: null,
  jobs: [],
  batches: [],
  upstream: { http_ready: true, ws_connected: true, failure_since: null },
}

const statusBody = {
  fe: { running: true, status: 'running' },
  be: { running: true, status: 'running' },
  comfy: { running: false, status: 'stopped' },
}

/** Fixed GET responses keyed by path (query ignored). Array-typed endpoints must stay arrays. */
const FIXED_GET: Record<string, unknown> = {
  '/mapping-masters': mappingMasters,
  '/workflow-presets': [defaultPreset],
  '/generation/state': generationState,
  '/generation/upstream-queue': { running: [], pending: [] },
  '/status': statusBody,
  '/comfy/queue': { queue_running: [], queue_pending: [] },
  '/settings/vram': { vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 8, vram_total_gb: 12 },
  '/config': { comfy_url: 'http://127.0.0.1:8188' },
  '/translate/dictionary': { rules: [] },
  '/stage-masters': [],
  '/base-models': [],
  '/param-type-masters': [],
  '/loras': [],
  '/tag-sets': [],
  '/snapshots': [],
  '/workflows/1/bypass-profiles': [],
  '/workflows/1/param-sync-groups': [],
}

function defaultGet(path: string, workflowBody: unknown): unknown {
  if (path === '/workflows') return [workflowBody]
  if (path === '/workflows/1') return workflowBody
  if (path.startsWith('/comfy/object_info')) return {}
  if (Object.prototype.hasOwnProperty.call(FIXED_GET, path)) return FIXED_GET[path]
  // Any other GET is a list endpoint (provisional `[]`; observed via `observe` and recorded as apiPaths).
  return []
}

export async function installApiStub(page: Page, opts?: ApiStubOptions): Promise<void> {
  const workflowBody = opts?.workflow ?? workflow

  await page.addInitScript(() => {
    window.localStorage.setItem('prompt-surgeon-workflow-id', '1')
  })

  await page.routeWebSocket(
    (url: URL) => url.pathname === '/api/ws',
    (ws) => {
      ws.onMessage(() => {})
    },
  )

  await page.route(
    (url: URL) => url.pathname.startsWith('/api/'),
    async (route: Route) => {
      const request = route.request()
      const url = new URL(request.url())
      const raw = request.postData()
      let body: unknown = undefined
      if (raw) {
        try {
          body = JSON.parse(raw)
        } catch {
          body = raw
        }
      }
      const req: StubRequest = {
        method: request.method(),
        path: url.pathname.replace(/^\/api/, ''),
        query: url.searchParams,
        body,
      }

      opts?.observe?.(req)

      const overridden = opts?.override ? await opts.override(req) : undefined
      if (overridden !== undefined) {
        await route.fulfill({
          status: overridden.status ?? 200,
          contentType: 'application/json',
          body: JSON.stringify(overridden.body),
        })
        return
      }

      const payload = request.method() === 'GET' ? defaultGet(req.path, workflowBody) : {}
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      })
    },
  )
}
