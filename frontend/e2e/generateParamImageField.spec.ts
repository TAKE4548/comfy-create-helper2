import { test, expect, type Page } from '@playwright/test'

const WORKFLOW_LIST = [{ id: 1, name: 'W1', created_at: '2026-01-01T00:00:00Z' }]
const WORKFLOW = {
  id: 1,
  name: 'W1',
  json_body: {},
  mappings: [
    {
      id: 101,
      workflow_id: 1,
      master_id: 501,
      variant_id: null,
      node_id: '10',
      param_name: 'image',
      role: 'ref_image',
      display_name: 'Reference Image',
      input_type: 'image',
      is_active: true,
    },
  ],
  target_base_model_id: null,
  created_at: '2026-01-01T00:00:00Z',
}
const VRAM = { vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 8, vram_total_gb: 12 }
const EMPTY_SNAPSHOT = {
  version: 1,
  epoch: 'epoch-empty',
  revision: 1,
  normal_group_id: 'normal-group-empty',
  jobs: [],
  batches: [],
  upstream: { http_ready: true, ws_connected: true, failure_since: null },
}
const HISTORY_URL = '/view?filename=img1.png&subfolder=&type=output'

// Stub only backend API calls (pathname starts with /api/); never Vite module requests like /src/api/*.
async function stubApi(page: Page): Promise<void> {
  await page.routeWebSocket((url) => url.pathname === '/api/ws', () => {})
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname.replace(/^\/api/, '')
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (path.startsWith('/ref-images')) return json({})
    if (req.method() !== 'GET') return json({})
    if (path === '/workflows') return json(WORKFLOW_LIST)
    if (path === '/workflows/1') return json(WORKFLOW)
    if (path === '/settings/vram') return json(VRAM)
    if (path === '/generation/state') return json(EMPTY_SNAPSHOT)
    if (path === '/generation/upstream-queue') return json({ running: [], pending: [] })
    if (path === '/translate/dictionary') return json({ rules: [] })
    if (path.startsWith('/comfy/history')) return json({})
    if (/\/(usages|status)$/.test(path) || /\/[0-9]+$/.test(path) || /settings|config|health/.test(path)) return json({})
    return json([])
  })
  await page.route((url) => url.pathname === '/view', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#27272a"/></svg>',
    })
  })
}

async function openGenerate(page: Page, width: number, height: number): Promise<void> {
  await page.addInitScript(({ images }) => {
    localStorage.clear()
    localStorage.setItem('prompt-surgeon-workflow-id', '1')
    localStorage.setItem('prompt-surgeon-client-id', 'test-session')
    localStorage.setItem('prompt-surgeon-filter-own', 'true')
    localStorage.setItem('prompt-surgeon-batch-images', JSON.stringify(images))
    try {
      indexedDB.deleteDatabase('REACT_QUERY_OFFLINE_CACHE')
    } catch {}
  }, { images: [HISTORY_URL] })
  await stubApi(page)
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await expect(page.locator('#workflow-actions-btn')).toBeVisible()
}

test.describe('Generate image param field', () => {
  test.setTimeout(30000)

  test('[REQ-427/AC-3] 360x780: image field fits viewport, buttons are 44px+, picker opens as bottom sheet', async ({ page }) => {
    await openGenerate(page, 360, 780)
    await page.getByRole('button', { name: 'パラメータ' }).click()
    const field = page.getByTestId('image-param-ref_image').filter({ visible: true })
    await expect(field).toBeVisible()
    await expect(field.getByText('未指定')).toBeVisible()

    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )
    expect(noOverflow).toBe(true)

    const buttons = field.locator('button')
    const count = await buttons.count()
    expect(count).toBe(2)
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }

    await field.getByRole('button', { name: '履歴/スナップショットから選択' }).click()
    const dialog = page.getByRole('dialog', { name: '参照画像を選択' })
    await expect(dialog).toBeVisible()
    const dbox = await dialog.boundingBox()
    expect(dbox).not.toBeNull()
    expect(Math.abs(dbox!.y + dbox!.height - 780)).toBeLessThanOrEqual(2)
  })

  test('[REQ-427/AC-3] 1280x800: image field with placeholder is visible, picker opens as centered dialog', async ({ page }) => {
    await openGenerate(page, 1280, 800)
    const field = page.getByTestId('image-param-ref_image').filter({ visible: true })
    await expect(field).toBeVisible()
    await expect(field.getByText('未指定')).toBeVisible()

    await field.getByRole('button', { name: '履歴/スナップショットから選択' }).click()
    const dialog = page.getByRole('dialog', { name: '参照画像を選択' })
    await expect(dialog).toBeVisible()
    const dbox = await dialog.boundingBox()
    expect(dbox).not.toBeNull()
    const centerX = dbox!.x + dbox!.width / 2
    expect(Math.abs(centerX - 640)).toBeLessThanOrEqual(4)
    expect(dbox!.y + dbox!.height).toBeLessThan(800 - 4)
    expect(dbox!.y).toBeGreaterThan(0)
  })
})
