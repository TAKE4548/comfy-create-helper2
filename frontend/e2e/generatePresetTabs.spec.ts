import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { DESKTOP, MOBILE } from './support/viewports'

const stamp = '2026-10-27T00:00:00Z'
const workflow = { id: 1, name: 'W1', created_at: stamp, target_base_model_id: null, json_body: { '6': { class_type: 'CLIPTextEncode', inputs: { text: '' } } }, mappings: [{ id: 1, master_id: 1, node_id: '6', role: 'positive', param_name: 'text', input_type: 'textarea', display_name: 'Prompt' }] }
const mappingMasters = [{ id: 1, role: 'positive', param_name: 'text', input_type: 'textarea', display_name: 'Prompt', expected_class_types: ['CLIPTextEncode'], title_patterns: null, sort_order: 0 }]
const emptyState = { version: 1, epoch: 'preset-tabs', revision: 1, normal_group_id: null, jobs: [], batches: [], upstream: { http_ready: true, ws_connected: true, failure_since: null } }
const vram = { vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 8, vram_total_gb: 12 }

async function bootstrap(
  page: Page,
  viewport: { width: number; height: number } = DESKTOP,
  presetNames: string[] = ['A', 'B', 'C', 'D', 'E'],
  activeName = 'C',
) {
  await page.setViewportSize(viewport)
  const openIds = presetNames.map((_, i) => 101 + i)
  const activeIndex = Math.max(0, presetNames.indexOf(activeName))
  const activeId = 101 + activeIndex
  await page.addInitScript(({ openIdsJson, activeIdStr }) => {
    if (sessionStorage.getItem('preset-tabs-fixture-ready')) return
    sessionStorage.setItem('preset-tabs-fixture-ready', '1')
    localStorage.clear()
    localStorage.setItem('prompt-surgeon-workflow-id', '1')
    localStorage.setItem('prompt-surgeon-client-id', 'preset-tabs-session')
    localStorage.setItem('prompt-surgeon-filter-own', 'true')
    localStorage.setItem('prompt-surgeon-open-presets-1', openIdsJson)
    localStorage.setItem('prompt-surgeon-active-set-wf-1', activeIdStr)
  }, { openIdsJson: JSON.stringify(openIds), activeIdStr: String(activeId) })
  const unexpectedWrites: string[] = []
  let presets = presetNames.map((name, i) => ({ id: 101 + i, workflow_id: 1, name, param_values: { positive: `prompt-${name}` }, applied_assets: {}, batch_size: 1, seed_mode: 'fixed', seed: 42 + i, sort_order: i, created_at: stamp, updated_at: stamp }))
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
      const body = req.postDataJSON() as Record<string, unknown>
      const index = presets.findIndex((preset) => String(preset.id) === path.split('/').pop())
      if (index < 0 || body.base_updated_at !== presets[index].updated_at) return json({ detail: 'Preset was updated by another session. Please reload to get the latest changes.' }, 409)
      presets[index] = { ...presets[index], ...body, updated_at: new Date(Date.parse(presets[index].updated_at) + 3000).toISOString() }
      return json(presets[index])
    }
    unexpectedWrites.push(`${req.method()} ${path}`)
    return route.abort('failed')
  })
  await page.route((url) => url.pathname === '/view', (route) => route.abort('failed'))
  await page.goto('http://localhost:5173/')
  await expect(page.locator(`[data-preset-id="${activeId}"]`).getByRole('button', { name: `${presetNames[activeIndex]}を選択` })).toBeVisible()
  await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName(`${presetNames[activeIndex]}を選択`)
  return { unexpectedWrites }
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

test('[REQ-402/AC-3] Desktop 1280x800: 画面外タブを閉じる操作のスクロール追従', { tag: '@critical' }, async ({ browser }, info) => {
  test.setTimeout(30_000)
  annotate(info, 'REQ-402/AC-3', 'close-offscreen-tabs')
  info.annotations.push(
    { type: 'ac', description: 'REQ-402/AC-4' },
    { type: 'ac', description: 'REQ-435/AC-3' },
    { type: 'ac', description: 'REQ-435/AC-4' },
    { type: 'ac', description: 'REQ-435/AC-5' },
    { type: 'ac', description: 'REQ-435/AC-6' },
  )

  await test.step('[REQ-402/AC-3] close-left-offscreen', async () => {
    const page = await browser.newPage()
    try {
      const leftNames = ['Left-Offscreen-1', 'Left-Offscreen-2', 'Left-Offscreen-3', 'Left-Offscreen-4', 'Left-Offscreen-5', 'Left-Offscreen-6', 'A', 'B', 'C', 'D', 'E']
      const fixture = await bootstrap(page, DESKTOP, leftNames, 'C')
      const scroller = page.locator('#desktop-preset-tabs-bar .overflow-x-auto')
      await expect.poll(() => scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
      await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth })
      await closeMode(page, 'C', '左のタブをすべて閉じる')
      await expect(page.locator('[data-preset-id]')).toHaveCount(3)
      for (const name of ['C', 'D', 'E']) await expect(chip(page, name)).toBeVisible()
      expect(fixture.unexpectedWrites).toEqual([])
    } finally {
      await page.close()
    }
  })

  await test.step('[REQ-402/AC-4] close-right-offscreen', async () => {
    const page = await browser.newPage()
    try {
      const rightNames = ['A', 'B', 'C', 'D', 'E', 'Right-Offscreen-1', 'Right-Offscreen-2', 'Right-Offscreen-3', 'Right-Offscreen-4', 'Right-Offscreen-5', 'Right-Offscreen-6']
      const fixture = await bootstrap(page, DESKTOP, rightNames, 'C')
      const scroller = page.locator('#desktop-preset-tabs-bar .overflow-x-auto')
      await expect.poll(() => scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
      await closeMode(page, 'C', '右のタブをすべて閉じる')
      await expect(page.locator('[data-preset-id]')).toHaveCount(3)
      for (const name of ['A', 'B', 'C']) await expect(chip(page, name)).toBeVisible()
      expect(fixture.unexpectedWrites).toEqual([])
    } finally {
      await page.close()
    }
  })

  await test.step('[REQ-435/AC-3] Desktop 1280px/800px プリセットタブ・ActionBarが44px未満であること', async () => {
    for (const vp of [DESKTOP, { width: 800, height: 800 }]) {
      const page = await browser.newPage()
      try {
        const fixture = await bootstrap(page, vp, ['A', 'B', 'C'], 'B')
        const targets = [
          page.locator('#desktop-preset-tabs-bar'),
          page.locator('[data-preset-id]').first(),
          page.locator('#queue-open-btn'),
          page.locator('#generate-btn'),
          page.locator('#save-snapshot-btn'),
        ]
        for (const locator of targets) {
          await expect(locator).toBeVisible()
          const box = await locator.boundingBox()
          expect(box).not.toBeNull()
          expect(box!.height).toBeLessThan(44)
        }
        const tabBoxes = await page.locator('[data-preset-id]').evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect().height)
        )
        expect(tabBoxes.length).toBe(3)
        for (const h of tabBoxes) expect(h).toBeLessThan(44)
        expect(fixture.unexpectedWrites).toEqual([])
      } finally {
        await page.close()
      }
    }
  })

  await test.step('[REQ-435/AC-4][REQ-435/AC-5] Desktop 単一統合ボタン・右クリック同一メニュー・選択不変', async () => {
    const page = await browser.newPage()
    try {
      const fixture = await bootstrap(page, DESKTOP, ['A', 'B', 'C', 'D'], 'A')
      await expect(page.getByRole('button', { name: /のタブを閉じる/ })).toHaveCount(0)
      for (const name of ['A', 'B', 'C', 'D']) {
        await expect(page.getByRole('button', { name: `${name}のタブ操作` })).toHaveCount(1)
      }

      await page.getByRole('button', { name: 'Cを選択' }).click({ button: 'right' })
      const contextMenu = page.getByRole('menu')
      await expect(contextMenu).toBeVisible()
      const contextItems = await contextMenu.getByRole('menuitem').allInnerTexts()
      await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Aを選択')

      await page.keyboard.press('Escape')
      await expect(contextMenu).toHaveCount(0)

      await page.getByRole('button', { name: 'Cのタブ操作' }).click()
      const buttonMenu = page.getByRole('menu')
      await expect(buttonMenu).toBeVisible()
      const buttonItems = await buttonMenu.getByRole('menuitem').allInnerTexts()
      expect(buttonItems).toEqual(contextItems)
      expect(buttonItems).toContain('このタブを閉じる')
      await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Aを選択')
      expect(fixture.unexpectedWrites).toEqual([])
    } finally {
      await page.close()
    }
  })

  await test.step('[REQ-435/AC-6] 「このタブを閉じる」単件クローズと一括クローズの維持', async () => {
    const page = await browser.newPage()
    try {
      const fixture = await bootstrap(page, DESKTOP, ['A', 'B', 'C', 'D', 'E'], 'C')
      await closeMode(page, 'B', 'このタブを閉じる')
      await expect(page.locator('[data-preset-id]')).toHaveCount(4)
      await expect(chip(page, 'B')).toHaveCount(0)
      await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Cを選択')

      await closeMode(page, 'C', '右のタブをすべて閉じる')
      await expect(page.locator('[data-preset-id]')).toHaveCount(2)
      for (const name of ['A', 'C']) await expect(chip(page, name)).toBeVisible()
      expect(fixture.unexpectedWrites).toEqual([])
    } finally {
      await page.close()
    }
  })
})

test('[REQ-402/AC-12] Mobile 375x667: タブのタッチジェスチャー', { tag: '@critical' }, async ({ browser }, info) => {
  test.setTimeout(30_000)
  annotate(info, 'REQ-402/AC-12', 'mobile-tab-touch-gestures')
  info.annotations.push(
    { type: 'ac', description: 'REQ-402/AC-13' },
    { type: 'ac', description: 'REQ-435/AC-4' },
    { type: 'ac', description: 'REQ-435/AC-5' },
    { type: 'ac', description: 'REQ-435/AC-6' },
  )

  await test.step('[REQ-402/AC-12] gesture-preservation', async () => {
    const movingContext = await browser.newContext({ hasTouch: true, viewport: MOBILE })
    try {
      const movingPage = await movingContext.newPage()
      await bootstrap(movingPage, MOBILE)
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
    } finally {
      await movingContext.close()
    }

    const context = await browser.newContext({ hasTouch: true, viewport: MOBILE })
    try {
      const page = await context.newPage()
      const fixture = await bootstrap(page, MOBILE)
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
    } finally {
      await context.close()
    }
  })

  await test.step('[REQ-402/AC-13] tap-menu', async () => {
    const context = await browser.newContext({ hasTouch: true, viewport: MOBILE })
    try {
      const mobile = await context.newPage()
      const mobileFixture = await bootstrap(mobile, MOBILE)
      await mobile.getByRole('button', { name: 'Aを選択' }).click()
      const aMenu = mobile.getByRole('button', { name: 'Aのタブ操作' })
      await aMenu.click()
      await expect(mobile.getByRole('dialog')).toBeVisible()
      await mobile.getByRole('button', { name: '閉じる', exact: true }).click()
      expect(mobileFixture.unexpectedWrites).toEqual([])
    } finally {
      await context.close()
    }
  })

  await test.step('[REQ-435/AC-4][REQ-435/AC-5] Mobile 単一ボタン・500ms長押し下部シート・選択不変', async () => {
    const context = await browser.newContext({ hasTouch: true, viewport: MOBILE })
    try {
      const page = await context.newPage()
      const fixture = await bootstrap(page, MOBILE, ['A', 'B', 'C', 'D'], 'A')
      await expect(page.getByRole('button', { name: /のタブを閉じる/ })).toHaveCount(0)
      for (const name of ['A', 'B', 'C', 'D']) {
        await expect(page.getByRole('button', { name: `${name}のタブ操作` })).toHaveCount(1)
      }

      const targetSelect = page.getByRole('button', { name: 'Cを選択' })
      await targetSelect.scrollIntoViewIfNeeded()
      await page.waitForTimeout(150)
      const box = await targetSelect.boundingBox()
      if (!box) throw new Error('C tab is not visible')
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
      const holdTouch = (type: 'touchStart' | 'touchEnd') =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: type === 'touchEnd' ? [] : [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
        })
      await holdTouch('touchStart')
      await page.waitForTimeout(550)
      await holdTouch('touchEnd')

      const sheet = page.getByRole('dialog')
      await expect(sheet).toBeVisible()
      const longPressLabels = await sheet.locator('button').allInnerTexts()
      expect(longPressLabels).toContain('このタブを閉じる')
      await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Aを選択')

      await page.getByRole('button', { name: '閉じる', exact: true }).click()
      await expect(sheet).toHaveCount(0)

      await page.getByRole('button', { name: 'Cのタブ操作' }).click()
      await expect(sheet).toBeVisible()
      const tapLabels = await sheet.locator('button').allInnerTexts()
      expect(tapLabels).toEqual(longPressLabels)
      await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Aを選択')
      expect(fixture.unexpectedWrites).toEqual([])
    } finally {
      await context.close()
    }
  })

  await test.step('[REQ-435/AC-6] Mobile 下部シートの「このタブを閉じる」で単件クローズできること', async () => {
    const context = await browser.newContext({ hasTouch: true, viewport: MOBILE })
    try {
      const page = await context.newPage()
      const fixture = await bootstrap(page, MOBILE, ['A', 'B', 'C', 'D', 'E'], 'A')
      await page.getByRole('button', { name: 'Bのタブ操作' }).click()
      const sheet = page.getByRole('dialog')
      await expect(sheet).toBeVisible()
      await sheet.getByRole('button', { name: 'このタブを閉じる' }).click()

      await expect(sheet).toHaveCount(0)
      await expect(page.locator('[data-preset-id]')).toHaveCount(4)
      await expect(chip(page, 'B')).toHaveCount(0)
      await expect(page.locator('[data-preset-select][aria-current="true"]')).toHaveAccessibleName('Aを選択')
      expect(fixture.unexpectedWrites).toEqual([])
    } finally {
      await context.close()
    }
  })
})
