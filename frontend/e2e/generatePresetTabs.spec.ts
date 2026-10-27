import { test, expect, type Page, type TestInfo } from '@playwright/test'

const stamp = '2026-10-27T00:00:00Z'
const workflow = { id: 1, name: 'W1', created_at: stamp, target_base_model_id: null, json_body: { '6': { class_type: 'CLIPTextEncode', inputs: { text: '' } } }, mappings: [{ id: 1, master_id: 1, node_id: '6', role: 'positive', param_name: 'text', input_type: 'textarea', display_name: 'Prompt' }] }
const mappingMasters = [{ id: 1, role: 'positive', param_name: 'text', input_type: 'textarea', display_name: 'Prompt', expected_class_types: ['CLIPTextEncode'], title_patterns: null, sort_order: 0 }]
const emptyState = { version: 1, epoch: 'preset-tabs', revision: 1, normal_group_id: null, jobs: [], batches: [], upstream: { http_ready: true, ws_connected: true, failure_since: null } }
const vram = { vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 8, vram_total_gb: 12 }
type Behavior = 'ok' | '503' | 'abort' | 'deferred-503'

async function bootstrap(page: Page, width = 1024, behavior: Behavior = 'ok') {
  await page.setViewportSize({ width, height: 800 })
  await page.addInitScript(() => {
    if (sessionStorage.getItem('preset-tabs-fixture-ready')) return
    sessionStorage.setItem('preset-tabs-fixture-ready', '1')
    localStorage.clear()
    localStorage.setItem('prompt-surgeon-workflow-id', '1')
    localStorage.setItem('prompt-surgeon-client-id', 'preset-tabs-session')
    localStorage.setItem('prompt-surgeon-filter-own', 'true')
    localStorage.setItem('prompt-surgeon-open-presets-1', '[101,102,103,104,105]')
    localStorage.setItem('prompt-surgeon-active-set-wf-1', '103')
  })
  const unexpectedWrites: string[] = []
  const putBodies: unknown[] = []
  let puts = 0
  let phase = 'bootstrap'
  const timeline: Array<{ ms: number; phase: string; method: string; path: string; body?: unknown; status?: number; ackUpdatedAt?: string }> = []
  const startedAt = Date.now()
  let releasePut: (() => void) | undefined
  const putGate = new Promise<void>((resolve) => { releasePut = resolve })
  let presets = ['A', 'B', 'C', 'D', 'E'].map((name, i) => ({ id: 101 + i, workflow_id: 1, name, param_values: { positive: `prompt-${name}` }, applied_assets: {}, batch_size: 1, seed_mode: 'fixed', seed: 42 + i, sort_order: i, created_at: stamp, updated_at: stamp }))
  await page.routeWebSocket((url) => url.pathname === '/api/ws', (ws) => { ws.onMessage(() => {}) })
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname.replace(/^\/api/, '')
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (req.method() === 'GET') {
      if (path === '/workflows') return json([{ id: 1, name: 'W1', created_at: stamp }])
      if (path === '/workflows/1') return json(workflow)
      if (path === '/workflow-presets') return json(presets)
      if (path === '/mapping-masters') return json(mappingMasters)
      if (path === '/generation/state') return json(emptyState)
      if (path === '/generation/upstream-queue') return json({ running: [], pending: [] })
      if (path === '/settings/vram') return json(vram)
      if (path === '/config') return json({ comfy_url: 'http://127.0.0.1:8188' })
      if (path === '/translate/dictionary') return json({ rules: [] })
      if (path.startsWith('/comfy/object_info') || path.startsWith('/comfy/history')) return json({})
      if (path === '/comfy/queue') return json({ queue_running: [], queue_pending: [] })
      if (/^\/(loras|tag-sets|base-models|param-type-masters|stage-masters|snapshots)$/.test(path) || /\/workflows\/1\/(param-sync-groups|bypass-profiles)$/.test(path)) return json([])
      if (/\/(usages|status)$/.test(path) || /settings|config|health/.test(path) || /\/[0-9]+$/.test(path)) return json({})
      return json([])
    }
    if (req.method() === 'PUT' && /^\/workflow-presets\/\d+$/.test(path)) {
      puts += 1
      const body = req.postDataJSON() as Record<string, unknown>
      putBodies.push(body)
      const event = { ms: Date.now() - startedAt, phase, method: req.method(), path, body }
      timeline.push(event)
      const index = presets.findIndex((preset) => String(preset.id) === path.split('/').pop())
      if (behavior === 'deferred-503' && phase === 'action' && path.endsWith('/102')) {
        await putGate
        event.status = 503
        return json({ detail: 'Injected save failure' }, 503)
      }
      if (index < 0 || body.base_updated_at !== presets[index].updated_at) return json({ detail: 'Preset was updated by another session. Please reload to get the latest changes.' }, 409)
      if (behavior === 'abort') return route.abort('failed')
      if (behavior === '503') { event.status = 503; return json({ detail: 'Injected save failure' }, 503) }
      presets[index] = { ...presets[index], ...body, updated_at: new Date(Date.parse(presets[index].updated_at) + 3000).toISOString() }
      event.status = 200
      event.ackUpdatedAt = presets[index].updated_at
      return json(presets[index])
    }
    unexpectedWrites.push(`${req.method()} ${path}`)
    return route.abort('failed')
  })
  await page.route((url) => url.pathname === '/view', (route) => route.abort('failed'))
  await page.goto('http://localhost:5173/')
  for (const [i, name] of ['A', 'B', 'C', 'D', 'E'].entries()) {
    await expect(page.locator(`[data-preset-id="${101 + i}"]`).getByRole('button', { name: `${name}を選択` })).toBeVisible()
  }
  await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Cを選択')
  return { unexpectedWrites, putBodies, timeline, get puts() { return puts }, setPhase: (next: string) => { phase = next }, releasePut: () => releasePut?.() }
}

function annotate(info: TestInfo, ac: string, caseId: string) {
  info.annotations.push({ type: 'ac', description: ac }, { type: 'layer', description: 'e2e' }, { type: 'caseId', description: caseId })
}
const chip = (page: Page, name: string) => page.locator('[data-preset-id]').filter({ has: page.getByRole('button', { name: `${name}を選択` }) })
async function closeMode(page: Page, trigger: string, label: string) {
  await page.getByRole('button', { name: `${trigger}のタブ操作` }).click()
  const action = page.getByRole('menuitem', { name: label })
  if (await action.count()) await action.click()
  else await page.getByRole('button', { name: label }).click()
}

test('[REQ-402/AC-2] close-others', async ({ page }, info) => {
  annotate(info, 'REQ-402/AC-2', 'close-others')
  const fixture = await bootstrap(page)
  await closeMode(page, 'C', '他のタブを閉じる')
  await expect(page.locator('[data-preset-id]')).toHaveCount(1)
  await expect(chip(page, 'C')).toBeVisible()
  expect(fixture.unexpectedWrites).toEqual([])
})

test('[REQ-402/AC-3] close-left-offscreen', async ({ page }, info) => {
  annotate(info, 'REQ-402/AC-3', 'close-left-offscreen')
  const fixture = await bootstrap(page, 360)
  const scroller = page.locator('#desktop-preset-tabs-bar .overflow-x-auto')
  if (await scroller.count()) await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth })
  await closeMode(page, 'C', '左のタブをすべて閉じる')
  await expect(page.locator('[data-preset-id]')).toHaveCount(3)
  for (const name of ['C', 'D', 'E']) await expect(chip(page, name)).toBeVisible()
  expect(fixture.unexpectedWrites).toEqual([])
})

test('[REQ-402/AC-4] close-right-offscreen', async ({ page }, info) => {
  annotate(info, 'REQ-402/AC-4', 'close-right-offscreen')
  const fixture = await bootstrap(page, 1024)
  await closeMode(page, 'C', '右のタブをすべて閉じる')
  await expect(page.locator('[data-preset-id]')).toHaveCount(3)
  for (const name of ['A', 'B', 'C']) await expect(chip(page, name)).toBeVisible()
  expect(fixture.unexpectedWrites).toEqual([])
})

test('[REQ-402/AC-9] reopen-preserves-preset', async ({ page }, info) => {
  annotate(info, 'REQ-402/AC-9', 'reopen-preserves-preset')
  const fixture = await bootstrap(page)
  await closeMode(page, 'C', '他のタブを閉じる')
  await page.locator('#manage-presets-btn').click()
  await page.getByText('A', { exact: true }).last().click()
  await expect(chip(page, 'A')).toBeVisible()
  expect(fixture.unexpectedWrites).toEqual([])
})

test('[REQ-402/AC-10] reload-persists-tabs', async ({ page }, info) => {
  annotate(info, 'REQ-402/AC-10', 'reload-persists-tabs')
  const fixture = await bootstrap(page)
  await closeMode(page, 'C', '他のタブを閉じる')
  await page.reload()
  await expect(page.locator('[data-preset-id]')).toHaveCount(1)
  await expect(chip(page, 'C')).toBeVisible()
  await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Cを選択')
  expect(fixture.unexpectedWrites).toEqual([])
})

test('[REQ-402/AC-11] cancel-focus', async ({ page }, info) => {
  annotate(info, 'REQ-402/AC-11', 'cancel-focus')
  const fixture = await bootstrap(page)
  const trigger = page.getByRole('button', { name: 'Cのタブ操作' })
  await trigger.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(page.locator('[data-preset-id]')).toHaveCount(5)
  expect(fixture.unexpectedWrites).toEqual([])
})

test('[REQ-402/AC-12] gesture-preservation', async ({ browser }, info) => {
  test.setTimeout(20_000)
  annotate(info, 'REQ-402/AC-12', 'gesture-preservation')
  const movingContext = await browser.newContext({ hasTouch: true, viewport: { width: 360, height: 800 } })
  const movingPage = await movingContext.newPage()
  await bootstrap(movingPage, 360)
  await movingPage.getByRole('button', { name: 'Aを選択' }).click()
  const movingName = movingPage.getByRole('button', { name: 'Cを選択' })
  await movingName.scrollIntoViewIfNeeded()
  const movingBox = await movingName.boundingBox(); if (!movingBox) throw new Error('C tab is not visible')
  const movingCdp = await movingContext.newCDPSession(movingPage)
  await movingCdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  const moveTouch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y = movingBox.y + movingBox.height / 2) => movingCdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: movingBox.x + movingBox.width / 2, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] })
  await moveTouch('touchStart')
  await moveTouch('touchMove', movingBox.y + movingBox.height / 2 + 20)
  await movingPage.waitForTimeout(550)
  await moveTouch('touchEnd')
  await expect(movingPage.getByRole('dialog')).toHaveCount(0)
  await expect(movingPage.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Aを選択')
  await movingContext.close()

  const context = await browser.newContext({ hasTouch: true, viewport: { width: 360, height: 800 } })
  const page = await context.newPage()
  const fixture = await bootstrap(page, 360)
  await page.getByRole('button', { name: 'Aを選択' }).click()
  const name = page.getByRole('button', { name: 'Cを選択' })
  await name.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  const box = await name.boundingBox(); if (!box) throw new Error('C tab is not visible')
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  const scrollBefore = await page.evaluate(() => [window.scrollX, window.scrollY, document.querySelector<HTMLElement>('[data-preset-id]')?.parentElement?.scrollLeft ?? 0])
  const holdTouch = (type: 'touchStart' | 'touchEnd') => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1, radiusX: 1, radiusY: 1, force: 1 }] })
  await holdTouch('touchStart')
  await page.waitForTimeout(550)
  await holdTouch('touchEnd')
  const scrollAfter = await page.evaluate(() => [window.scrollX, window.scrollY, document.querySelector<HTMLElement>('[data-preset-id]')?.parentElement?.scrollLeft ?? 0])
  expect(scrollAfter).toEqual(scrollBefore)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Aを選択')
  await expect(page.locator('[data-preset-id]')).toHaveCount(5)
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await name.click()
  await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Cを選択')
  await page.getByRole('button', { name: 'Aを選択' }).click()
  await name.click({ button: 'right' })
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Aを選択')
  expect(fixture.unexpectedWrites).toEqual([])
  await context.close()
})

test('[REQ-402/AC-13] tap-menu', async ({ browser }, info) => {
  annotate(info, 'REQ-402/AC-13', 'tap-menu')
  const mobile = await browser.newPage()
  const mobileFixture = await bootstrap(mobile, 767)
  await mobile.getByRole('button', { name: 'Aを選択' }).click()
  const aMenu = mobile.getByRole('button', { name: 'Aのタブ操作' })
  await aMenu.click()
  await expect(mobile.getByRole('dialog')).toBeVisible()
  await mobile.getByRole('button', { name: '閉じる', exact: true }).click()
  expect(mobileFixture.unexpectedWrites).toEqual([])
  await mobile.close()
  const desktop = await browser.newPage()
  const desktopFixture = await bootstrap(desktop, 768)
  await desktop.getByRole('button', { name: 'Aを選択' }).click()
  await desktop.getByRole('button', { name: 'Aのタブ操作' }).click()
  await expect(desktop.getByRole('menu')).toBeVisible()
  await expect(desktop.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Aを選択')
  await desktop.keyboard.press('Escape')
  expect(desktopFixture.unexpectedWrites).toEqual([])
  await desktop.close()
})

test('[REQ-402/AC-7] [REQ-402/AC-8] save-abort-retains-draft-and-tabs', async ({ page }, info) => {
  test.setTimeout(20_000)
  annotate(info, 'REQ-402/AC-7', 'save-abort-retains-draft-and-tabs')
  info.annotations.push({ type: 'ac', description: 'REQ-402/AC-8' })
  const fixture = await bootstrap(page, 1024, 'deferred-503')
  fixture.setPhase('before-B-select')
  await page.getByRole('button', { name: 'Bを選択' }).click()
  fixture.setPhase('edit')
  await page.getByRole('button', { name: 'テキスト入力モード切替' }).click()
  const draft = page.locator('#prompt-positive textarea')
  await draft.fill('draft-before-close')
  fixture.setPhase('menu-open')
  await page.getByRole('button', { name: 'Cのタブ操作' }).click()
  fixture.setPhase('action')
  await page.getByRole('menuitem', { name: '左のタブをすべて閉じる' }).click()
  await expect.poll(() => fixture.timeline.some((event) => event.phase === 'action' && event.path.endsWith('/102'))).toBe(true)
  await expect(page.locator('[data-preset-id]')).toHaveCount(5)
  await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Bを選択')
  await expect(draft).toHaveValue('draft-before-close')
  fixture.releasePut()
  fixture.setPhase('post-503')
  const failureAlert = page.getByRole('alert')
  await expect(failureAlert).toBeVisible()
  await expect(failureAlert).toContainText('下書きは保持されています。もう一度タブを閉じて保存を再試行してください。')
  await expect(failureAlert).toContainText('API error 503')
  await expect(failureAlert).toContainText('Injected save failure')
  await expect(page.locator('[data-preset-id]')).toHaveCount(5)
  await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Bを選択')
  await expect(draft).toHaveValue('draft-before-close')
  const failedRequestCount = fixture.timeline.filter((event) => event.path.endsWith('/102')).length
  await page.waitForTimeout(1300)
  await expect(failureAlert).toContainText('下書きは保持されています。もう一度タブを閉じて保存を再試行してください。')
  expect(fixture.timeline.filter((event) => event.path.endsWith('/102'))).toHaveLength(failedRequestCount)
  expect(fixture.unexpectedWrites).toEqual([])
  expect(fixture.putBodies.length).toBeGreaterThan(0)
})

test('[REQ-402/AC-6] active-fallback', async ({ page }, info) => {
  annotate(info, 'REQ-402/AC-6', 'active-fallback')
  const fixture = await bootstrap(page)
  await page.getByRole('button', { name: 'Aを選択' }).click()
  await closeMode(page, 'C', '他のタブを閉じる')
  await expect(page.locator('[data-preset-id]')).toHaveCount(1)
  await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Cを選択')
  expect(fixture.unexpectedWrites).toEqual([])
})
