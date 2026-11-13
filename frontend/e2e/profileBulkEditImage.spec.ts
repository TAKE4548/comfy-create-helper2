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
const REF_ID = `${'a'.repeat(64)}.png`
const TOKEN = `refimg:${REF_ID}`
const REF_READ = { ref_id: REF_ID, token: TOKEN, width: 64, height: 64, size_bytes: 100 }
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#27272a"/></svg>'

function makePreset(id: number, name: string) {
  return {
    id,
    workflow_id: 1,
    name,
    param_values: {},
    applied_assets: {},
    batch_size: 1,
    seed_mode: 'random',
    seed: 1,
    sort_order: id,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

interface PutRecord {
  id: number
  body: { param_values?: Record<string, string> }
}

// Stub only backend API calls (pathname starts with /api/); never Vite module requests like /src/api/*.
async function stubApi(page: Page): Promise<{ puts: PutRecord[] }> {
  const puts: PutRecord[] = []
  const presets = [makePreset(11, 'Preset A'), makePreset(12, 'Preset B')]
  await page.routeWebSocket((url) => url.pathname === '/api/ws', () => {})
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname.replace(/^\/api/, '')
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (/^\/ref-images\/[^/]+\/thumbnail$/.test(path)) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG })
    }
    if (path.startsWith('/ref-images')) return json(REF_READ, 201)

    const put = /^\/workflow-presets\/(\d+)$/.exec(path)
    if (put && req.method() === 'PUT') {
      const id = Number(put[1])
      const body = req.postDataJSON()
      puts.push({ id, body })
      const base = presets.find((p) => p.id === id)!
      return json({ ...base, ...body, param_values: body.param_values ?? base.param_values, updated_at: '2026-01-01T00:01:00Z' })
    }
    if (req.method() !== 'GET') return json({})
    if (path === '/workflow-presets') return json(presets)
    if (path === '/snapshots') {
      return json([{ id: 7, image_path: '/view?filename=s.png', thumbnail_path: '/view?filename=s.png' }])
    }
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
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG })
  })
  return { puts }
}

async function openBulkEditParams(page: Page, width: number, height: number, mobile: boolean) {
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
  const api = await stubApi(page)
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await expect(page.locator('#workflow-actions-btn')).toBeVisible()

  await page.locator(mobile ? '#manage-presets-btn-mobile' : '#manage-presets-btn').filter({ visible: true }).click()
  const manager = page.getByRole('dialog', { name: 'プリセット管理' })
  await expect(manager).toBeVisible()
  await manager.getByTitle('一括操作モード').click()
  await manager.getByRole('button', { name: 'すべて選択' }).click()
  await manager.getByRole('button', { name: '一括編集', exact: true }).click()

  const bulk = page.getByRole('heading', { name: 'プロファイル一括編集' })
  await expect(bulk).toBeVisible()
  // The mobile layout has another 'パラメータ' button earlier in the DOM; the bulk-edit tab is the last one.
  await page.getByRole('button', { name: 'パラメータ', exact: true }).last().click()
  return { ...api, bulk }
}

async function pickSnapshot(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'スナップショット' }).click()
  await page.getByTestId('ref-picker-snapshot-7').click()
}

test.describe('Profile bulk edit image param', () => {
  test.setTimeout(45000)

  test('[REQ-427/AC-3] 360x780: image field fits, hit areas are 44px+, picker is in front and Escape closes only the picker', async ({ page }) => {
    const { bulk } = await openBulkEditParams(page, 360, 780, true)
    const field = page.getByTestId('image-param-bulk-ref_image')
    await expect(field).toBeVisible()
    await expect(field.getByText('未指定')).toBeVisible()

    const noOverflow = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="image-param-bulk-ref_image"]') as HTMLElement
      let node: HTMLElement | null = el
      while (node) {
        if (node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflowX === 'visible') return false
        node = node.parentElement
      }
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth
    })
    expect(noOverflow).toBe(true)

    const card = field.locator('xpath=..')
    const label = card.locator('label').first()
    const lbox = await label.boundingBox()
    expect(lbox).not.toBeNull()
    expect(lbox!.height).toBeGreaterThanOrEqual(44)
    expect(lbox!.width).toBeGreaterThanOrEqual(44)

    await label.click()
    const buttons = field.locator('button')
    expect(await buttons.count()).toBe(2)
    for (let i = 0; i < 2; i++) {
      await expect(buttons.nth(i)).toBeEnabled()
      const box = await buttons.nth(i).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
    }

    await field.getByRole('button', { name: '履歴/スナップショットから選択' }).click()
    const dialog = page.getByRole('dialog', { name: '参照画像を選択' })
    await expect(dialog).toBeVisible()
    // The picker must be in front of the bulk-edit modal: the element at its center belongs to the picker.
    const inFront = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return !!hit && el.contains(hit)
    })
    expect(inFront).toBe(true)

    // Known limitation (shared Modal, not owned by this card): while focus is inside the dialog its React
    // onKeyDown stops propagation, so the window-level Escape handlers never run. Blur first so the
    // window handlers (this modal's guard + the picker Modal) are exercised in a real browser.
    await page.evaluate(() => (document.activeElement as HTMLElement).blur())
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(bulk).toBeVisible()

    await field.getByRole('button', { name: '履歴/スナップショットから選択' }).click()
    await expect(dialog).toBeVisible()
    await pickSnapshot(page)
    await expect(dialog).toBeHidden()
    await expect(field.getByAltText('選択中の参照画像')).toBeVisible()
    await expect(bulk).toBeVisible()
  })

  test('[REQ-427/AC-8] 1280x800: chosen image shows a thumbnail and applying to 2 presets sends 2 PUTs with the same token', async ({ page }) => {
    const { puts } = await openBulkEditParams(page, 1280, 800, false)
    const field = page.getByTestId('image-param-bulk-ref_image')
    await expect(field.getByText('未指定')).toBeVisible()

    await field.locator('xpath=..').locator('label').first().click()
    await field.getByRole('button', { name: '履歴/スナップショットから選択' }).click()
    await pickSnapshot(page)

    const thumb = field.getByAltText('選択中の参照画像')
    await expect(thumb).toBeVisible()
    await expect(thumb).toHaveAttribute('src', `/api/ref-images/${REF_ID}/thumbnail`)
    await expect
      .poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true)

    await page.getByRole('button', { name: /件に適用/ }).click()
    await page.getByRole('button', { name: '適用する' }).click()

    await expect.poll(() => puts.length).toBe(2)
    expect(puts.map((p) => p.id).sort()).toEqual([11, 12])
    for (const p of puts) {
      expect(p.body.param_values?.ref_image).toBe(TOKEN)
    }
  })
})
