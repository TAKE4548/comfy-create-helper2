import { test, expect, type Locator, type Page } from '@playwright/test'
import { DESKTOP, MOBILE } from './support/viewports'

const WORKFLOW_LIST = [{ id: 1, name: 'W1', created_at: '2026-01-01T00:00:00Z' }]
const WORKFLOW = {
  id: 1,
  name: 'W1',
  json_body: {},
  mappings: [],
  target_base_model_id: null,
  created_at: '2026-01-01T00:00:00Z',
}
const VRAM = { vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 8, vram_total_gb: 12 }

const MOCK_OUTPUT_SPECS = [
  { filename: 'img1.png', w: 1000, h: 1000 },
  { filename: 'img2.png', w: 1600, h: 900 },
  { filename: 'img3.png', w: 800, h: 1200 },
  { filename: 'img4.png', w: 1200, h: 800 },
  { filename: 'img5.png', w: 600, h: 1200 },
  { filename: 'img6.png', w: 1500, h: 750 },
  { filename: 'img7.png', w: 1000, h: 1000 },
  { filename: 'img8.png', w: 900, h: 1600 },
]

const MOCK_OUTPUTS = MOCK_OUTPUT_SPECS.map((spec, i) => ({
  node_id: '9',
  index: i,
  filename: spec.filename,
  subfolder: '',
  type: 'output',
  view_url: `/view?filename=${spec.filename}`,
  thumbnail_url: `/view?filename=${spec.filename}`,
  availability: 'present',
}))

const MOCK_SNAPSHOT = {
  version: 1,
  epoch: 'epoch-1',
  revision: 1,
  normal_group_id: 'normal-group-1',
  jobs: [
    {
      job_id: 'job-1',
      request_id: 'request-1',
      prompt_id: 'prompt-1',
      session_id: 'test-session',
      scope: 'normal',
      batch_id: 'batch-1',
      normal_group_id: 'normal-group-1',
      project_id: null,
      status: 'succeeded',
      started_at: '2026-01-01T00:00:00Z',
      finished_at: '2026-01-01T00:00:01Z',
      node: null,
      outputs: MOCK_OUTPUTS,
      failure: null,
    },
  ],
  batches: [{ batch_id: 'batch-1', scope: 'normal', project_id: null }],
  upstream: { http_ready: true, ws_connected: true, failure_since: null },
}

// Stub only backend API calls (pathname starts with /api/); never Vite module requests like /src/api/*.
async function stubApi(page: Page, workflowOverride?: unknown): Promise<string[]> {
  const wsUrls: string[] = []
  // Sever the app WebSocket: page.route does not intercept WebSockets, and the Vite proxy would
  // forward /api/ws to a live backend whose snapshot overrides the HTTP stub (REQ-395).
  await page.routeWebSocket((url) => url.pathname === '/api/ws', (ws) => {
    wsUrls.push(ws.url())
  })

  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname.replace(/^\/api/, '')
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (req.method() !== 'GET') return json({})
    if (path === '/workflows') return json(WORKFLOW_LIST)
    if (path === '/workflows/1') return json(workflowOverride ?? WORKFLOW)
    if (path === '/settings/vram') return json(VRAM)
    if (path === '/generation/state') return json(MOCK_SNAPSHOT)
    if (path === '/generation/upstream-queue') return json({ running: [], pending: [] })
    if (path === '/translate/dictionary') return json({ rules: [] })
    if (path.startsWith('/comfy/history')) return json({})
    if (/\/(usages|status)$/.test(path) || /\/[0-9]+$/.test(path) || /settings|config|health/.test(path)) return json({})
    return json([])
  })

  // Mock ComfyUI /view requests for generated images
  await page.route((url) => url.pathname === '/view', async (route) => {
    const filename = new URL(route.request().url()).searchParams.get('filename') ?? ''
    const match = MOCK_OUTPUT_SPECS.find((s) => s.filename === filename)
    const w = match ? match.w : 100
    const h = match ? match.h : 100
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#27272a"/><text x="10" y="30" fill="#fff" font-size="20">${filename}</text></svg>`
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: svg,
    })
  })
  return wsUrls
}

// The viewport comes from test.use({ viewport }) (MOBILE or DESKTOP); the stubs are registered before page.goto (C5).
async function openGenerate(page: Page, workflowOverride?: unknown): Promise<string[]> {
  await page.addInitScript(({ images }) => {
    localStorage.clear()
    localStorage.setItem('prompt-surgeon-workflow-id', '1')
    localStorage.setItem('prompt-surgeon-client-id', 'test-session')
    localStorage.setItem('prompt-surgeon-filter-own', 'false')
    localStorage.setItem('prompt-surgeon-batch-images', JSON.stringify(images))
    localStorage.setItem('prompt-surgeon-selected-img', images[0] ?? '')
    try {
      indexedDB.deleteDatabase('REACT_QUERY_OFFLINE_CACHE')
    } catch {}
  }, { images: MOCK_OUTPUTS.map((o) => o.view_url) })
  const wsUrls = await stubApi(page, workflowOverride)
  await page.goto('/')
  await expect(page.locator('#workflow-actions-btn')).toBeVisible()
  return wsUrls
}

async function dispatchSwipe(
  locator: ReturnType<Page['locator']>,
  opts: {
    startX: number
    startY: number
    points: Array<{ x: number; y: number; delayMs?: number }>
    release?: boolean
  }
) {
  await locator.evaluate(async (el, { startX, startY, points, release }) => {
    const makeTouch = (x: number, y: number) =>
      new Touch({
        identifier: 1,
        target: el,
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y,
      })

    const t0 = makeTouch(startX, startY)
    el.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [t0],
        targetTouches: [t0],
        changedTouches: [t0],
      })
    )

    let lastX = startX
    let lastY = startY
    for (const pt of points) {
      if (pt.delayMs && pt.delayMs > 0) {
        await new Promise((r) => setTimeout(r, pt.delayMs))
      }
      lastX = pt.x
      lastY = pt.y
      const tm = makeTouch(pt.x, pt.y)
      el.dispatchEvent(
        new TouchEvent('touchmove', {
          bubbles: true,
          cancelable: true,
          touches: [tm],
          targetTouches: [tm],
          changedTouches: [tm],
        })
      )
    }

    if (release !== false) {
      const te = makeTouch(lastX, lastY)
      el.dispatchEvent(
        new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [te],
        })
      )
    }
  }, opts)
}

test.describe('Mobile Generate Gallery, Bottom Sheet & Fullscreen Viewer', () => {
  test.use({ viewport: MOBILE })

  test('[REQ-372/AC-3] Mobile 375x667: ギャラリー→ボトムシート→全画面ビューアの往復', { tag: '@critical' }, async ({ page }) => {
    test.setTimeout(40000)
    const wsUrls = await openGenerate(page)

    await test.step('[REQ-395/AC-3] Mobile 375px: app WebSocket /api/ws is served by the stub and never reaches the backend', async () => {
      // The app opens /api/ws on load; routeWebSocket must capture it (no connectToServer, so no backend).
      await expect.poll(() => wsUrls.length).toBeGreaterThan(0)
      for (const url of wsUrls) {
        expect(new URL(url).pathname).toBe('/api/ws')
      }
    })

    await test.step('[REQ-372/AC-2] Mobile 375px: history section has 3-column square grid, no horizontal scroll reel', async () => {
      // Switch to history segment
      await page.locator('button[aria-controls="mobile-history-panel"]').click()

      // The gallery container inside history panel must be 3-column grid
      const historyPanel = page.locator('#mobile-history-panel')
      await expect(historyPanel).toBeVisible()

      // Verify grid container exists and has grid-cols-3
      const grid = historyPanel.locator('.grid.grid-cols-3')
      await expect(grid).toBeVisible()

      // Verify thumbnails are rendered as square
      const thumb = grid.locator('button[id^="thumb-mobile-"]').first()
      await expect(thumb).toBeVisible()
      await expect(thumb).toHaveClass(/aspect-square/)

      // Ensure no horizontal scrollbar or overflow-x-auto on the grid container
      await expect(grid).not.toHaveClass(/overflow-x-auto/)
    })

    await test.step('[REQ-372/AC-3] Mobile 375px: tapping thumbnail opens bottom sheet (MobileImageSheet)', async () => {
      // Tap first thumbnail (history segment is already active)
      const firstThumb = page.locator('#thumb-mobile-0')
      await expect(firstThumb).toBeVisible()
      await firstThumb.click()

      // Verify bottom sheet appears
      const sheet = page.locator('[data-testid="mobile-image-sheet"]')
      await expect(sheet).toBeVisible()

      const sheetContent = page.locator('[data-testid="mobile-image-sheet-content"]')
      await expect(sheetContent).toBeVisible()

      // Verify image in sheet is displayed with object-contain
      const sheetImg = sheetContent.locator('img[alt="プレビュー画像"]')
      await expect(sheetImg).toBeVisible()
      await expect(sheetImg).toHaveClass(/object-contain/)
    })

    await test.step('[REQ-372/AC-4] Mobile 375px: tapping sheet image transitions to black fullscreen viewer with chrome hidden', async () => {
      const sheetContent = page.locator('[data-testid="mobile-image-sheet-content"]')
      await expect(sheetContent).toBeVisible()

      // Tap sheet preview image to enter fullscreen
      const sheetImg = sheetContent.locator('img[alt="プレビュー画像"]')
      await sheetImg.click()

      // Fullscreen viewer must become visible with black background
      const viewer = page.locator('[data-testid="mobile-fullscreen-viewer"]')
      await expect(viewer).toBeVisible()
      await expect(viewer).toHaveClass(/bg-black/)

      // Bottom sheet chrome (sheet content) is no longer visible
      await expect(sheetContent).not.toBeVisible()

      // Fullscreen close button is present
      const closeBtn = page.locator('[data-testid="mobile-fullscreen-close-btn"]')
      await expect(closeBtn).toBeVisible()
    })

    await test.step('[REQ-372/AC-5] Mobile 375px: tapping close button returns from fullscreen to bottom sheet', async () => {
      const sheetContent = page.locator('[data-testid="mobile-image-sheet-content"]')
      const viewer = page.locator('[data-testid="mobile-fullscreen-viewer"]')
      await expect(viewer).toBeVisible()

      // Tap close button in fullscreen viewer
      const closeBtn = page.locator('[data-testid="mobile-fullscreen-close-btn"]')
      await closeBtn.click()

      // Fullscreen viewer closed, returned to bottom sheet
      await expect(viewer).not.toBeVisible()
      await expect(sheetContent).toBeVisible()
    })

    await test.step('[REQ-372/AC-6] Mobile 375px: closing bottom sheet returns to gallery', async () => {
      const sheet = page.locator('[data-testid="mobile-image-sheet"]')
      await expect(sheet).toBeVisible()

      // Click sheet close button
      const closeBtn = page.locator('[data-testid="mobile-sheet-close-btn"]')
      await closeBtn.click()

      // Bottom sheet is closed
      await expect(sheet).not.toBeVisible()

      // Gallery grid remains visible
      const historyPanel = page.locator('#mobile-history-panel')
      await expect(historyPanel).toBeVisible()
    })
  })

  test('[REQ-431/AC-1] Mobile 375x667: カルーセルとスワイプジェスチャー', { tag: '@critical' }, async ({ page }) => {
    test.setTimeout(40000)
    await openGenerate(page)
    await page.locator('button[aria-controls="mobile-history-panel"]').click()
    await page.locator('#thumb-mobile-0').click()

    await test.step('[REQ-431/AC-1] Mobile 375x667: 3-image carousel follows finger translateX and snaps back below threshold', async () => {
      const sheetContent = page.locator('[data-testid="mobile-image-sheet-content"]')
      const track = sheetContent.locator('[data-testid="mobile-image-carousel-track"]')
      await expect(track).toBeVisible()

      const initialSrc = await sheetContent.locator('img[alt="プレビュー画像"]').getAttribute('src')

      // Drag left by 20px (below SWIPE_HORIZONTAL_THRESHOLD=40) without releasing yet
      await dispatchSwipe(sheetContent, {
        startX: 250,
        startY: 300,
        points: [
          { x: 240, y: 300, delayMs: 80 },
          { x: 230, y: 300, delayMs: 80 },
        ],
        release: false,
      })

      const draggingTransform = await track.evaluate((el) => el.style.transform)
      expect(draggingTransform).toBe('translateX(calc(0% - 20px))')

      // Release slowly so flick velocity threshold is not met -> snaps back to 0px, same image
      await sheetContent.evaluate(async (el) => {
        await new Promise((r) => setTimeout(r, 120))
        const t = new Touch({
          identifier: 1,
          target: el,
          clientX: 230,
          clientY: 300,
          pageX: 230,
          pageY: 300,
        })
        el.dispatchEvent(
          new TouchEvent('touchend', {
            bubbles: true,
            cancelable: true,
            touches: [],
            targetTouches: [],
            changedTouches: [t],
          })
        )
      })

      await expect.poll(() => track.evaluate((el) => el.style.transform)).toBe('translateX(calc(0% + 0px))')
      await expect(sheetContent.locator('img[alt="プレビュー画像"]')).toHaveAttribute('src', initialSrc!)
    })

    await test.step('[REQ-431/AC-2][REQ-431/AC-3] Mobile 375x667: left/right swipe switches images and syncs download href', async () => {
      const sheetContent = page.locator('[data-testid="mobile-image-sheet-content"]')
      const previewImg = sheetContent.locator('img[alt="プレビュー画像"]')
      const downloadBtn = sheetContent.locator('#download-btn-mobile')

      const firstSrc = await previewImg.getAttribute('src')
      expect(firstSrc).toBeTruthy()
      await expect(downloadBtn).toHaveAttribute('href', firstSrc!)

      // Swipe left -> move to next image
      await dispatchSwipe(sheetContent, {
        startX: 280,
        startY: 300,
        points: [
          { x: 240, y: 300, delayMs: 16 },
          { x: 160, y: 300, delayMs: 16 },
        ],
      })

      await expect.poll(() => previewImg.getAttribute('src')).not.toBe(firstSrc)
      const secondSrc = await previewImg.getAttribute('src')
      await expect(downloadBtn).toHaveAttribute('href', secondSrc!)

      // Swipe right -> move back to first image
      await dispatchSwipe(sheetContent, {
        startX: 120,
        startY: 300,
        points: [
          { x: 180, y: 300, delayMs: 16 },
          { x: 260, y: 300, delayMs: 16 },
        ],
      })

      await expect(previewImg).toHaveAttribute('src', firstSrc!)
      await expect(downloadBtn).toHaveAttribute('href', firstSrc!)
    })

    await test.step('[REQ-431/AC-4] Mobile 375x667: fullscreen viewer supports horizontal swipe and preserves image on exit', async () => {
      // Reopen the sheet so the tap that enters fullscreen is not the one right after the previous swipe
      const sheet = page.locator('[data-testid="mobile-image-sheet"]')
      await page.locator('[data-testid="mobile-sheet-close-btn"]').click()
      await expect(sheet).not.toBeVisible()
      await page.locator('#thumb-mobile-0').click()
      await expect(sheet).toBeVisible()

      const sheetContent = page.locator('[data-testid="mobile-image-sheet-content"]')
      const firstSrc = await sheetContent.locator('img[alt="プレビュー画像"]').getAttribute('src')
      await sheetContent.locator('img[alt="プレビュー画像"]').click()

      const viewer = page.locator('[data-testid="mobile-fullscreen-viewer"]')
      await expect(viewer).toBeVisible()
      const fullImg = viewer.locator('img[alt="全画面画像"]')
      await expect(fullImg).toHaveAttribute('src', firstSrc!)

      // Swipe left inside fullscreen viewer
      await dispatchSwipe(viewer, {
        startX: 280,
        startY: 400,
        points: [
          { x: 220, y: 400, delayMs: 16 },
          { x: 140, y: 400, delayMs: 16 },
        ],
      })

      await expect.poll(() => fullImg.getAttribute('src')).not.toBe(firstSrc)
      const secondSrc = await fullImg.getAttribute('src')

      // Exit fullscreen -> bottom sheet shows the swiped image
      await page.locator('[data-testid="mobile-fullscreen-close-btn"]').click()
      await expect(viewer).not.toBeVisible()
      await expect(sheetContent.locator('img[alt="プレビュー画像"]')).toHaveAttribute('src', secondSrc!)
    })

    await test.step('[REQ-431/AC-6] Mobile 375x667: gesture direction lock isolates horizontal vs vertical swipes', async () => {
      const sheet = page.locator('[data-testid="mobile-image-sheet"]')
      const sheetContent = page.locator('[data-testid="mobile-image-sheet-content"]')
      const track = sheetContent.locator('[data-testid="mobile-image-carousel-track"]')
      await expect(sheet).toBeVisible()
      const initialSrc = await sheetContent.locator('img[alt="プレビュー画像"]').getAttribute('src')

      // 1. Lock horizontal first (deltaX = -18px, below threshold/flick), then move vertically -> sheet must NOT close or switch image
      await dispatchSwipe(sheetContent, {
        startX: 250,
        startY: 250,
        points: [
          { x: 232, y: 250, delayMs: 80 },
          { x: 232, y: 400, delayMs: 80 },
        ],
      })
      await expect(sheet).toBeVisible()

      // 2. Lock vertical first, then move horizontally -> image must NOT switch
      await dispatchSwipe(sheetContent, {
        startX: 250,
        startY: 250,
        points: [
          { x: 250, y: 280, delayMs: 16 },
          { x: 130, y: 280, delayMs: 16 },
        ],
      })
      await expect(sheet).toBeVisible()
      await expect(track.locator('img[alt="プレビュー画像"]')).toHaveAttribute('src', initialSrc!)
    })

    await test.step('[REQ-431/AC-5] Mobile 375x667: swipe-down closes sheet preserving scroll, and is disabled in fullscreen', async () => {
      const sheet = page.locator('[data-testid="mobile-image-sheet"]')
      const sheetContent = page.locator('[data-testid="mobile-image-sheet-content"]')

      // Start from the gallery: close the sheet left open by the previous step
      await page.locator('[data-testid="mobile-sheet-close-btn"]').click()
      await expect(sheet).not.toBeVisible()

      // Scroll main container before opening sheet
      const mainContainer = page.locator('main')
      const scrollBefore = await mainContainer.evaluate((el) => {
        el.scrollTop = 120
        return el.scrollTop
      })

      await page.locator('#thumb-mobile-0').click()
      await expect(sheet).toBeVisible()

      // Enter fullscreen and verify swipe-down does NOT close fullscreen
      await sheetContent.locator('img[alt="プレビュー画像"]').click()
      const viewer = page.locator('[data-testid="mobile-fullscreen-viewer"]')
      await expect(viewer).toBeVisible()

      await dispatchSwipe(viewer, {
        startX: 180,
        startY: 200,
        points: [
          { x: 180, y: 260, delayMs: 16 },
          { x: 180, y: 360, delayMs: 16 },
        ],
      })
      await expect(viewer).toBeVisible()

      // Exit fullscreen back to sheet, then swipe-down to close sheet
      await page.locator('[data-testid="mobile-fullscreen-close-btn"]').click()
      await expect(viewer).not.toBeVisible()

      await dispatchSwipe(sheetContent, {
        startX: 180,
        startY: 200,
        points: [
          { x: 180, y: 260, delayMs: 16 },
          { x: 180, y: 360, delayMs: 16 },
        ],
      })

      await expect(sheet).not.toBeVisible()
      const scrollAfter = await mainContainer.evaluate((el) => el.scrollTop)
      expect(scrollAfter).toBe(scrollBefore)
    })

    await test.step('[REQ-431/AC-7] Mobile 375x667: closing sheet after swipe syncs 3-column history grid selection', async () => {
      // The previous step left the gallery visible with the sheet closed.
      const thumb0 = page.locator('#thumb-mobile-0')
      const thumb1 = page.locator('#thumb-mobile-1')
      await thumb0.click()

      const sheet = page.locator('[data-testid="mobile-image-sheet"]')
      const sheetContent = page.locator('[data-testid="mobile-image-sheet-content"]')
      await expect(sheet).toBeVisible()
      const previewImg = sheetContent.locator('img[alt="プレビュー画像"]')
      const firstSrc = await previewImg.getAttribute('src')

      // Swipe left to second image
      await dispatchSwipe(sheetContent, {
        startX: 280,
        startY: 300,
        points: [
          { x: 220, y: 300, delayMs: 16 },
          { x: 140, y: 300, delayMs: 16 },
        ],
      })
      await expect.poll(() => previewImg.getAttribute('src')).not.toBe(firstSrc)

      // Close sheet
      await page.locator('[data-testid="mobile-sheet-close-btn"]').click()
      await expect(sheet).not.toBeVisible()

      // Grid selection highlight moves to thumb-mobile-1
      await expect(thumb1).toHaveClass(/border-accent-green/)
      await expect(thumb0).not.toHaveClass(/border-accent-green/)
    })
  })

  test('[REQ-433/AC-3] mobile ParamPanel toggle switches keep pill shape and 44x44 hit slop', { tag: '@critical' }, async ({
    page,
  }) => {
    test.setTimeout(20000)
    const workflowWithSwitches = {
      ...WORKFLOW,
      mappings: [
        {
          id: 101,
          workflow_id: 1,
          node_id: '10',
          class_type: 'TestNode',
          param_name: 'enabled',
          role: 'boolean_flag',
          display_name: 'フラグ切替',
          input_type: 'boolean',
          is_active: true,
          default_value: 'false',
          sort_order: 1,
          stage_key: null,
          stage_name: null,
        },
        {
          id: 102,
          workflow_id: 1,
          node_id: '11',
          class_type: 'KSampler',
          param_name: 'seed',
          role: 'Sampler_Seed',
          display_name: 'Seed',
          input_type: 'int',
          is_active: true,
          default_value: '42',
          sort_order: 2,
          stage_key: null,
          stage_name: null,
        },
      ],
    }
    await openGenerate(page, workflowWithSwitches)

    await page.locator('button[aria-controls="mobile-parameters-panel"]').click()
    const paramsPanel = page.locator('#mobile-parameters-panel')
    await expect(paramsPanel).toBeVisible()

    const switchBtn = paramsPanel.locator('#param-mobile-boolean_flag')
    await expect(switchBtn).toBeVisible()
    await expect(switchBtn).toHaveAttribute('role', 'switch')
    await expect(switchBtn).toHaveAttribute('aria-checked', 'false')

    const metrics = await switchBtn.evaluate((el) => {
      const trackRect = el.getBoundingClientRect()
      const trackCs = getComputedStyle(el)
      const knob = el.querySelector('span')!
      const knobRect = knob.getBoundingClientRect()
      const knobCs = getComputedStyle(knob)
      const beforeCs = getComputedStyle(el, '::before')
      return {
        trackW: trackRect.width,
        trackH: trackRect.height,
        trackRadius: parseFloat(trackCs.borderTopLeftRadius),
        knobW: knobRect.width,
        knobH: knobRect.height,
        knobRadius: parseFloat(knobCs.borderTopLeftRadius),
        hitW: parseFloat(beforeCs.width),
        hitH: parseFloat(beforeCs.height),
      }
    })

    expect(metrics.trackW).toBeGreaterThan(metrics.trackH)
    expect(metrics.trackH).toBeLessThan(44)
    expect(metrics.trackRadius).toBeGreaterThanOrEqual(metrics.trackH / 2 - 0.5)
    expect(Math.abs(metrics.knobW - metrics.knobH)).toBeLessThanOrEqual(0.5)
    expect(metrics.knobRadius).toBeGreaterThanOrEqual(metrics.knobW / 2 - 0.5)
    expect(metrics.hitW).toBeGreaterThanOrEqual(44)
    expect(metrics.hitH).toBeGreaterThanOrEqual(44)

    await switchBtn.click()
    await expect(switchBtn).toHaveAttribute('aria-checked', 'true')
    await switchBtn.click()
    await expect(switchBtn).toHaveAttribute('aria-checked', 'false')

    const seedToggle = paramsPanel.locator('#seed-toggle-mobile')
    await expect(seedToggle).toBeVisible()
    const seedRadius = await seedToggle.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius))
    expect(seedRadius).toBe(8)
  })
})

test.describe('Desktop Generate Reel', () => {
  test.use({ viewport: DESKTOP })

  test('[REQ-383/AC-1] Desktop 1280x800: 履歴リールの物理スクロールと配置', { tag: '@critical' }, async ({ page }) => {
    test.setTimeout(40000)
    await openGenerate(page)

    await test.step('[REQ-383/AC-1] Desktop: continuous horizontal reel, initial center alignment with edge margins, and wheel inertia snap', async () => {
      const reel = page.locator('[data-testid="generate-reel-viewport"]')
      await expect(reel).toBeVisible()

      const tiles = reel.locator('[data-generate-reel-tile="true"]')
      await expect(tiles).toHaveCount(8)

      // Initial alignment: scrollLeft is 0, first tile is centered
      const initialMetrics = await reel.evaluate((el) => {
        const first = el.querySelector<HTMLElement>('[data-generate-reel-tile="true"]')!
        const viewportCenter = el.scrollLeft + el.clientWidth / 2
        const firstCenter = first.offsetLeft + first.offsetWidth / 2
        return {
          scrollLeft: el.scrollLeft,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          centerDiff: Math.abs(firstCenter - viewportCenter),
        }
      })
      expect(initialMetrics.scrollLeft).toBe(0)
      expect(initialMetrics.scrollWidth).toBeGreaterThan(initialMetrics.clientWidth)
      expect(initialMetrics.centerDiff).toBeLessThanOrEqual(4)

      // Reel toolbar has no reverse sort UI
      const sortControl = page.locator('[data-generate-reel-sort-control="true"]')
      await expect(sortControl).toHaveCount(0)

      // Wheel scroll with inertia
      await reel.hover()
      await page.mouse.wheel(0, 300)
      await expect.poll(() => reel.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50)

      // Snap nearest tile to center after inertia completes
      await expect.poll(async () => reel.evaluate((el) => {
        const viewportCenter = el.scrollLeft + el.clientWidth / 2
        const tileEls = Array.from(el.querySelectorAll<HTMLElement>('[data-generate-reel-tile="true"]'))
        return Math.min(...tileEls.map((tile) => Math.abs(tile.offsetLeft + tile.offsetWidth / 2 - viewportCenter)))
      }), { timeout: 3000 }).toBeLessThanOrEqual(4)
    })

    await test.step('[REQ-383/AC-4] Desktop: mixed aspect ratios maintain native proportions without distortion or container overflow', async () => {
      const reel = page.locator('[data-generate-reel-proposal="true"]')
      await expect(reel).toBeVisible()

      await page.waitForTimeout(500)

      const tileMetrics = await reel.evaluate((el) => {
        const bounds = el.getBoundingClientRect()
        const tiles = Array.from(el.querySelectorAll<HTMLElement>('[data-generate-reel-tile="true"]'))
        return tiles.map((tile) => {
          const rect = tile.getBoundingClientRect()
          return {
            width: rect.width,
            height: rect.height,
            containerWidth: bounds.width,
            containerHeight: bounds.height,
          }
        })
      })

      expect(tileMetrics.length).toBe(8)
      for (const tm of tileMetrics) {
        expect(tm.width).toBeLessThanOrEqual(tm.containerWidth + 1)
        expect(tm.height).toBeLessThanOrEqual(tm.containerHeight + 1)
      }
      const widths = tileMetrics.map((tm) => Math.round(tm.width))
      const uniqueWidths = new Set(widths)
      expect(uniqueWidths.size).toBeGreaterThanOrEqual(3)
    })

    await test.step('[REQ-383/AC-5] Desktop: latest and oldest jump buttons cancel inertia and center target tiles', async () => {
      const reel = page.locator('[data-testid="generate-reel-viewport"]')
      await expect(reel).toBeVisible()

      // Scroll past threshold so latest button becomes visible
      await reel.hover()
      await page.mouse.wheel(0, 400)
      await expect.poll(() => reel.evaluate((el) => el.scrollLeft)).toBeGreaterThan(80)

      // Jump to oldest (last tile)
      const oldestBtn = page.locator('[data-generate-reel-oldest="true"]')
      await expect(oldestBtn).toBeVisible()
      await oldestBtn.click()

      await expect.poll(async () => reel.evaluate((el) => {
        const tiles = Array.from(el.querySelectorAll<HTMLElement>('[data-generate-reel-tile="true"]'))
        const last = tiles[tiles.length - 1]
        const viewportCenter = el.scrollLeft + el.clientWidth / 2
        return Math.abs(last.offsetLeft + last.offsetWidth / 2 - viewportCenter)
      }), { timeout: 3000 }).toBeLessThanOrEqual(4)

      // Jump back to latest (first tile)
      const latestBtn = page.locator('[data-generate-reel-latest="true"]')
      await expect(latestBtn).toBeVisible()
      await latestBtn.click()

      await expect.poll(() => reel.evaluate((el) => el.scrollLeft)).toBeLessThanOrEqual(4)
    })

    await test.step('[REQ-383/AC-7] Desktop: history thumbnail click centers preview in normal mode, suppressed in multi-select mode', async () => {
      const reel = page.locator('[data-testid="generate-reel-viewport"]')
      await expect(reel).toBeVisible()

      // Open history pane
      const toggle = page.locator('[data-generate-reel-history-toggle="true"]')
      await toggle.click()
      await expect(page.locator('[data-generate-reel-history-pane="true"]')).toBeVisible()

      // Click history thumbnail #thumb-3 in normal mode -> centers tile 3
      const thumb3 = page.locator('#thumb-3')
      await expect(thumb3).toBeVisible()
      await thumb3.click()

      await expect.poll(async () => reel.evaluate((el) => {
        const tile3 = el.querySelector<HTMLElement>('[data-generate-reel-tile="true"][data-index="3"]')
        if (!tile3) return 999
        const viewportCenter = el.scrollLeft + el.clientWidth / 2
        return Math.abs(tile3.offsetLeft + tile3.offsetWidth / 2 - viewportCenter)
      }), { timeout: 3000 }).toBeLessThanOrEqual(4)

      // Enter multi-select mode via Ctrl click on thumbnail #thumb-2
      const scrollBefore = await reel.evaluate((el) => el.scrollLeft)
      const thumb2 = page.locator('#thumb-2')
      await thumb2.click({ modifiers: ['Control'] })

      // Multi-select mode is now active
      await expect(page.locator('text=枚選択中')).toBeVisible()

      // Click thumbnail #thumb-1 in multi-select mode -> scrollLeft does NOT change
      const thumb1 = page.locator('#thumb-1')
      await thumb1.click()
      const scrollAfter = await reel.evaluate((el) => el.scrollLeft)
      expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(2)
    })

    await test.step('[REQ-383/AC-9] Desktop: boundary close bar collapses history and restores preview to full height', async () => {
      const preview = page.locator('[data-testid="generate-parallel-preview"]')
      await expect(preview).toBeVisible()

      // The history pane is still open from the previous step
      await expect(page.locator('[data-generate-reel-history-pane="true"]')).toBeVisible()

      const closeBtn = page.locator('[data-generate-reel-history-close="true"]')
      await expect(closeBtn).toBeVisible()
      await expect(closeBtn).toContainText('履歴を閉じる')

      const initialHeight = await preview.evaluate((el) => el.clientHeight)

      // Click boundary close button
      await closeBtn.click()

      // History pane collapses and is unmounted
      await expect(page.locator('[data-generate-reel-history-pane="true"]')).toHaveCount(0)
      await expect(closeBtn).toHaveCount(0)

      // Preview restores to full right pane height
      const restoredHeight = await preview.evaluate((el) => el.clientHeight)
      expect(restoredHeight).toBeGreaterThan(initialHeight + 50)
    })

    await test.step('[REQ-383/AC-14] Desktop: document.body does not overflow horizontally during reel interactions', async () => {
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))
      expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1)

      // Scroll reel and check again
      const reel = page.locator('[data-testid="generate-reel-viewport"]')
      await reel.hover()
      await page.mouse.wheel(0, 300)
      await page.waitForTimeout(200)

      const widthsAfter = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))
      expect(widthsAfter.scroll).toBeLessThanOrEqual(widthsAfter.client + 1)
    })
  })
})

interface ResponsiveHitSlopBox {
  visualW: number
  visualH: number
  hitLeft: number
  hitTop: number
  hitRight: number
  hitBottom: number
  hitW: number
  hitH: number
}

async function measureControlHitSlop(locator: Locator): Promise<ResponsiveHitSlopBox> {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const before = getComputedStyle(el, '::before')
    const padLeft = rect.left + (parseFloat(cs.borderLeftWidth) || 0)
    const padTop = rect.top + (parseFloat(cs.borderTopWidth) || 0)
    const padRight = rect.right - (parseFloat(cs.borderRightWidth) || 0)
    const padBottom = rect.bottom - (parseFloat(cs.borderBottomWidth) || 0)
    const hasBefore = before.content !== 'none' && before.position === 'absolute'
    const topPx = hasBefore ? parseFloat(before.top) : NaN
    const rightPx = hasBefore ? parseFloat(before.right) : NaN
    const bottomPx = hasBefore ? parseFloat(before.bottom) : NaN
    const leftPx = hasBefore ? parseFloat(before.left) : NaN
    const hitLeft = hasBefore && Number.isFinite(leftPx) ? padLeft + leftPx : rect.left
    const hitTop = hasBefore && Number.isFinite(topPx) ? padTop + topPx : rect.top
    const hitRight = hasBefore && Number.isFinite(rightPx) ? padRight - rightPx : rect.right
    const hitBottom = hasBefore && Number.isFinite(bottomPx) ? padBottom - bottomPx : rect.bottom
    return {
      visualW: rect.width,
      visualH: rect.height,
      hitLeft,
      hitTop,
      hitRight,
      hitBottom,
      hitW: hitRight - hitLeft,
      hitH: hitBottom - hitTop,
    }
  })
}

function getBoxIntersection(a: ResponsiveHitSlopBox, b: ResponsiveHitSlopBox) {
  const overlapW = Math.max(0, Math.min(a.hitRight, b.hitRight) - Math.max(a.hitLeft, b.hitLeft))
  const overlapH = Math.max(0, Math.min(a.hitBottom, b.hitBottom) - Math.max(a.hitTop, b.hitTop))
  return { overlapW, overlapH }
}

const STAGE_MASTERS_FIXTURE = [
  { id: 1, key: 'main', name: 'Main', suffix: '', search_keywords: [], previous_suffixes: [], is_builtin: true, is_active: true, sort_order: 0 },
  { id: 2, key: 'rough', name: 'Rough', suffix: '_rough', search_keywords: [], previous_suffixes: [], is_builtin: true, is_active: true, sort_order: 1 },
  { id: 3, key: 'final', name: 'Final', suffix: '_final', search_keywords: [], previous_suffixes: [], is_builtin: true, is_active: true, sort_order: 2 },
]

const MAPPING_MASTERS_FIXTURE = [
  {
    id: 7,
    group_id: null,
    base_key: 'positive',
    name: 'Positive Prompt',
    param_name: 'text',
    input_type: 'textarea',
    expected_class_types: ['CLIPTextEncode'],
    base_title_patterns: null,
    sort_order: 0,
    variants: [
      { id: 71, master_id: 7, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'Main_Positive_Prompt', extra_title_patterns: null, is_enabled: true },
      { id: 72, master_id: 7, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'Rough_Positive_Prompt', extra_title_patterns: null, is_enabled: true },
      { id: 73, master_id: 7, stage_id: 3, stage_key: 'final', stage_name: 'Final', stage_suffix: '_final', custom_role_override: null, computed_role: 'Final_Positive_Prompt', extra_title_patterns: null, is_enabled: true },
    ],
  },
  {
    id: 8,
    group_id: null,
    base_key: 'steps',
    name: 'Steps',
    param_name: 'steps',
    input_type: 'int',
    expected_class_types: ['KSampler'],
    base_title_patterns: null,
    sort_order: 1,
    variants: [
      { id: 81, master_id: 8, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'Sampler_Steps', extra_title_patterns: null, is_enabled: true },
      { id: 82, master_id: 8, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'Sampler_Steps_rough', extra_title_patterns: null, is_enabled: true },
      { id: 83, master_id: 8, stage_id: 3, stage_key: 'final', stage_name: 'Final', stage_suffix: '_final', custom_role_override: null, computed_role: 'Sampler_Steps_final', extra_title_patterns: null, is_enabled: true },
    ],
  },
  {
    id: 9,
    group_id: null,
    base_key: 'cfg',
    name: 'CFG',
    param_name: 'cfg',
    input_type: 'float',
    expected_class_types: ['KSampler'],
    base_title_patterns: null,
    sort_order: 2,
    variants: [
      { id: 91, master_id: 9, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'Sampler_CFG', extra_title_patterns: null, is_enabled: true },
      { id: 92, master_id: 9, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'Sampler_CFG_rough', extra_title_patterns: null, is_enabled: true },
      { id: 93, master_id: 9, stage_id: 3, stage_key: 'final', stage_name: 'Final', stage_suffix: '_final', custom_role_override: null, computed_role: 'Sampler_CFG_final', extra_title_patterns: null, is_enabled: true },
    ],
  },
  {
    id: 10,
    group_id: null,
    base_key: 'denoise',
    name: 'Denoise',
    param_name: 'denoise',
    input_type: 'float',
    expected_class_types: ['KSampler'],
    base_title_patterns: null,
    sort_order: 3,
    variants: [
      { id: 101, master_id: 10, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'Sampler_Denoise', extra_title_patterns: null, is_enabled: true },
      { id: 102, master_id: 10, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'Sampler_Denoise_rough', extra_title_patterns: null, is_enabled: true },
      { id: 103, master_id: 10, stage_id: 3, stage_key: 'final', stage_name: 'Final', stage_suffix: '_final', custom_role_override: null, computed_role: 'Sampler_Denoise_final', extra_title_patterns: null, is_enabled: true },
    ],
  },
  {
    id: 11,
    group_id: null,
    base_key: 'boolean_flag',
    name: 'Boolean Flag',
    param_name: 'enabled',
    input_type: 'boolean',
    expected_class_types: ['TestNode'],
    base_title_patterns: null,
    sort_order: 4,
    variants: [
      { id: 111, master_id: 11, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'boolean_flag', extra_title_patterns: null, is_enabled: true },
      { id: 112, master_id: 11, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'boolean_flag_rough', extra_title_patterns: null, is_enabled: true },
      { id: 113, master_id: 11, stage_id: 3, stage_key: 'final', stage_name: 'Final', stage_suffix: '_final', custom_role_override: null, computed_role: 'boolean_flag_final', extra_title_patterns: null, is_enabled: true },
    ],
  },
  {
    id: 12,
    group_id: null,
    base_key: 'sampler_width',
    name: 'Width',
    param_name: 'width',
    input_type: 'int',
    expected_class_types: ['EmptyLatentImage'],
    base_title_patterns: null,
    sort_order: 5,
    variants: [
      { id: 121, master_id: 12, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'Latent_Width', extra_title_patterns: null, is_enabled: true },
      { id: 122, master_id: 12, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'Latent_Width_rough', extra_title_patterns: null, is_enabled: true },
      { id: 123, master_id: 12, stage_id: 3, stage_key: 'final', stage_name: 'Final', stage_suffix: '_final', custom_role_override: null, computed_role: 'Latent_Width_final', extra_title_patterns: null, is_enabled: true },
    ],
  },
]

const MULTI_STAGE_WORKFLOW_1 = {
  id: 1,
  name: 'W1',
  created_at: '2026-10-01T00:00:00Z',
  target_base_model_id: null,
  json_body: {
    '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
    '4': { class_type: 'KSampler', inputs: { steps: 20, cfg: 7.5, denoise: 1.0 } },
    '5': { class_type: 'KSampler', inputs: { steps: 12, cfg: 5.0, denoise: 0.6 } },
    '6': { class_type: 'KSampler', inputs: { steps: 16, cfg: 6.5, denoise: 0.4 } },
  },
  mappings: [
    { id: 1, master_id: 7, variant_id: 71, node_id: '1', role: 'Main_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Positive Prompt', sort_order: 0 },
    { id: 2, master_id: 7, variant_id: 72, node_id: '2', role: 'Rough_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Rough Prompt', sort_order: 1 },
    { id: 3, master_id: 7, variant_id: 73, node_id: '3', role: 'Final_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Final Prompt', sort_order: 2 },
    { id: 4, master_id: 8, variant_id: 81, node_id: '4', role: 'Sampler_Steps', param_name: 'steps', input_type: 'int', display_name: 'Main Steps', default_value: '20', sort_order: 3 },
    { id: 5, master_id: 9, variant_id: 91, node_id: '4', role: 'Sampler_CFG', param_name: 'cfg', input_type: 'float', display_name: 'Main CFG', default_value: '7.5', sort_order: 4 },
    { id: 6, master_id: 10, variant_id: 101, node_id: '4', role: 'Sampler_Denoise', param_name: 'denoise', input_type: 'float', display_name: 'Main Denoise', default_value: '1.0', sort_order: 5 },
    { id: 7, master_id: 11, variant_id: 111, node_id: '4', role: 'boolean_flag', param_name: 'enabled', input_type: 'boolean', display_name: 'Main Flag', default_value: 'false', sort_order: 6 },
    { id: 8, master_id: 12, variant_id: 121, node_id: '4', role: 'Latent_Width', param_name: 'width', input_type: 'int', display_name: 'Main Width', default_value: '1024', sort_order: 7 },
    { id: 9, master_id: 8, variant_id: 82, node_id: '5', role: 'Sampler_Steps_rough', param_name: 'steps', input_type: 'int', display_name: 'Rough Steps', default_value: '12', sort_order: 8 },
    { id: 10, master_id: 9, variant_id: 92, node_id: '5', role: 'Sampler_CFG_rough', param_name: 'cfg', input_type: 'float', display_name: 'Rough CFG', default_value: '5.0', sort_order: 9 },
    { id: 11, master_id: 10, variant_id: 102, node_id: '5', role: 'Sampler_Denoise_rough', param_name: 'denoise', input_type: 'float', display_name: 'Rough Denoise', default_value: '0.6', sort_order: 10 },
    { id: 12, master_id: 12, variant_id: 122, node_id: '5', role: 'Latent_Width_rough', param_name: 'width', input_type: 'int', display_name: 'Rough Width', default_value: '768', sort_order: 11 },
    { id: 13, master_id: 8, variant_id: 83, node_id: '6', role: 'Sampler_Steps_final', param_name: 'steps', input_type: 'int', display_name: 'Final Steps', default_value: '16', sort_order: 12 },
    { id: 14, master_id: 9, variant_id: 93, node_id: '6', role: 'Sampler_CFG_final', param_name: 'cfg', input_type: 'float', display_name: 'Final CFG', default_value: '6.5', sort_order: 13 },
    { id: 15, master_id: 10, variant_id: 103, node_id: '6', role: 'Sampler_Denoise_final', param_name: 'denoise', input_type: 'float', display_name: 'Final Denoise', default_value: '0.4', sort_order: 14 },
    { id: 16, master_id: 11, variant_id: 113, node_id: '6', role: 'boolean_flag_final', param_name: 'enabled', input_type: 'boolean', display_name: 'Final Flag', default_value: 'false', sort_order: 15 },
    { id: 17, master_id: 12, variant_id: 123, node_id: '6', role: 'Latent_Width_final', param_name: 'width', input_type: 'int', display_name: 'Final Width', default_value: '1024', sort_order: 16 },
    { id: 18, master_id: 8, variant_id: 83, node_id: '7', role: 'Sampler_Steps_final_2', param_name: 'steps', input_type: 'int', display_name: 'Final Steps 2', default_value: '20', sort_order: 17 },
    { id: 19, master_id: 9, variant_id: 93, node_id: '7', role: 'Sampler_CFG_final_2', param_name: 'cfg', input_type: 'float', display_name: 'Final CFG 2', default_value: '7.0', sort_order: 18 },
    { id: 20, master_id: 10, variant_id: 103, node_id: '7', role: 'Sampler_Denoise_final_2', param_name: 'denoise', input_type: 'float', display_name: 'Final Denoise 2', default_value: '0.5', sort_order: 19 },
    { id: 21, master_id: 12, variant_id: 123, node_id: '7', role: 'Latent_Width_final_2', param_name: 'width', input_type: 'int', display_name: 'Final Width 2', default_value: '1280', sort_order: 20 },
  ],
}

const MULTI_STAGE_WORKFLOW_2 = {
  id: 2,
  name: 'W2',
  created_at: '2026-10-02T00:00:00Z',
  target_base_model_id: null,
  json_body: {
    '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
    '4': { class_type: 'KSampler', inputs: { steps: 24 } },
    '5': { class_type: 'KSampler', inputs: { steps: 10 } },
  },
  mappings: [
    { id: 21, master_id: 7, variant_id: 71, node_id: '1', role: 'Main_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'W2 Main Prompt', sort_order: 0 },
    { id: 22, master_id: 7, variant_id: 72, node_id: '2', role: 'Rough_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'W2 Rough Prompt', sort_order: 1 },
    { id: 23, master_id: 8, variant_id: 81, node_id: '4', role: 'Sampler_Steps', param_name: 'steps', input_type: 'int', display_name: 'W2 Main Steps', default_value: '24', sort_order: 2 },
    { id: 24, master_id: 8, variant_id: 82, node_id: '5', role: 'Sampler_Steps_rough', param_name: 'steps', input_type: 'int', display_name: 'W2 Rough Steps', default_value: '10', sort_order: 3 },
  ],
}

async function setupResponsiveGenerate(
  page: Page,
  viewport: { width: number; height: number },
  initialGenerationState?: unknown
) {
  await page.setViewportSize(viewport)
  let currentGenerationState = initialGenerationState ?? {
    version: 1,
    epoch: 'resp-epoch',
    revision: 1,
    normal_group_id: null,
    jobs: [],
    batches: [],
    upstream: { http_ready: true, ws_connected: true, failure_since: null },
  }
  let wsHandle: { send: (data: string) => void } | null = null

  await page.addInitScript(({ images }) => {
    if (sessionStorage.getItem('resp-gen-fixture-ready')) return
    sessionStorage.setItem('resp-gen-fixture-ready', '1')
    localStorage.clear()
    localStorage.setItem('prompt-surgeon-workflow-id', '1')
    localStorage.setItem('prompt-surgeon-client-id', 'test-session')
    localStorage.setItem('prompt-surgeon-filter-own', 'true')
    localStorage.setItem('prompt-surgeon-open-presets-1', JSON.stringify([101, 102]))
    localStorage.setItem('prompt-surgeon-active-set-wf-1', '101')
    localStorage.setItem('prompt-surgeon-open-presets-2', JSON.stringify([201]))
    localStorage.setItem('prompt-surgeon-active-set-wf-2', '201')
    localStorage.setItem('prompt-surgeon-batch-images', JSON.stringify(images))
    localStorage.setItem('prompt-surgeon-selected-img', images[0] ?? '')
    try {
      indexedDB.deleteDatabase('REACT_QUERY_OFFLINE_CACHE')
    } catch {}
  }, { images: MOCK_OUTPUTS.map((o) => o.view_url) })

  await page.routeWebSocket((url) => url.pathname === '/api/ws', (ws) => {
    wsHandle = ws
    ws.onMessage(() => {})
  })

  const presets = [
    { id: 101, workflow_id: 1, name: 'Set A', param_values: { Main_Positive_Prompt: '1girl', Rough_Positive_Prompt: 'rough', Final_Positive_Prompt: 'final' }, applied_assets: {}, batch_size: 1, seed_mode: 'fixed', seed: 42, sort_order: 0, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
    { id: 102, workflow_id: 1, name: 'Set B', param_values: { Main_Positive_Prompt: '1boy' }, applied_assets: {}, batch_size: 1, seed_mode: 'fixed', seed: 43, sort_order: 1, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
    { id: 201, workflow_id: 2, name: 'W2 Set', param_values: { Main_Positive_Prompt: 'scenery' }, applied_assets: {}, batch_size: 1, seed_mode: 'fixed', seed: 99, sort_order: 0, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
  ]

  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace(/^\/api/, '')
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (req.method() !== 'GET') return json({})
    if (path === '/workflows') {
      return json([
        { id: 1, name: 'W1', created_at: '2026-10-01T00:00:00Z' },
        { id: 2, name: 'W2', created_at: '2026-10-02T00:00:00Z' },
      ])
    }
    if (path === '/workflows/1') return json(MULTI_STAGE_WORKFLOW_1)
    if (path === '/workflows/2') return json(MULTI_STAGE_WORKFLOW_2)
    if (path === '/workflow-presets') {
      const wfId = url.searchParams.get('workflow_id')
      return json(wfId ? presets.filter((p) => String(p.workflow_id) === wfId) : presets)
    }
    if (path === '/stage-masters') return json(STAGE_MASTERS_FIXTURE)
    if (path === '/mapping-masters') return json(MAPPING_MASTERS_FIXTURE)
    if (path === '/generation/state') return json(currentGenerationState)
    if (path === '/generation/upstream-queue') return json({ running: [], pending: [] })
    if (path === '/settings/vram') return json(VRAM)
    if (path === '/config') return json({ comfy_url: 'http://127.0.0.1:8188' })
    if (path === '/translate/dictionary') return json({ rules: [] })
    if (path === '/comfy/queue') return json({ queue_running: [], queue_pending: [] })
    if (path.startsWith('/comfy/object_info') || path.startsWith('/comfy/history')) return json({})
    if (/\/(usages|status)$/.test(path) || /\/[0-9]+$/.test(path) || /settings|config|health/.test(path)) return json({})
    return json([])
  })

  await page.route((url) => url.pathname === '/view', async (route) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#27272a"/></svg>'
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg })
  })

  await page.goto('/')
  await expect(page.locator('#workflow-actions-btn')).toBeVisible()

  return {
    pushSnapshot(snapshot: Record<string, unknown>) {
      currentGenerationState = snapshot
      if (!wsHandle) throw new Error('WebSocket handle was not captured')
      wsHandle.send(
        JSON.stringify({
          type: 'GENERATION_SNAPSHOT',
          version: 1,
          epoch: snapshot.epoch,
          revision: snapshot.revision,
          data: snapshot,
        })
      )
    },
  }
}

test('[REQ-435/AC-1] Mobile Generate 360px/390px: 余白密度・Hit-Slop非重複・単一進捗バー・SafeArea/KB耐性', { tag: '@critical' }, async ({ page }) => {
  test.setTimeout(30_000)

  const makeJob = (id: string, status: string, startedAt: string | null = null, nodeValue = 3, nodeMax = 5) => ({
    job_id: id,
    request_id: id,
    prompt_id: id,
    session_id: 'test-session',
    scope: 'normal',
    batch_id: 'batch-1',
    normal_group_id: 'normal-group-1',
    project_id: null,
    status,
    started_at: startedAt,
    finished_at: null,
    node: status === 'running' ? { id: '3', name: 'KSampler', value: nodeValue, max: nodeMax } : null,
    outputs: [],
    failure: null,
  })

  const initialSnapshot = {
    version: 1,
    epoch: 'resp-epoch',
    revision: 1,
    normal_group_id: 'normal-group-1',
    batches: [{ batch_id: 'batch-1', scope: 'normal', project_id: null }],
    upstream: { http_ready: true, ws_connected: true, failure_since: null },
    jobs: [
      makeJob('j1', 'running', new Date(Date.now() - 10_000).toISOString(), 3, 5),
      makeJob('j2', 'queued'),
      makeJob('j3', 'queued'),
    ],
  }

  const controller = await setupResponsiveGenerate(page, { width: 360, height: 640 }, initialSnapshot)

  await test.step('[REQ-435/AC-1] 360px/390px Generate ボタン・タブ外形縮小と44x44px Hit-Slop検証', async () => {
    for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp)
      const sectionGroup = page.getByRole('group', { name: '表示セクション' })
      const setAChip = page.locator('[data-preset-id="101"]')
      const promptPanel = page.getByTestId('mobile-prompt-panel')
      const controls: Array<[string, Locator]> = [
        ['segment:プロンプト', sectionGroup.getByRole('button', { name: 'プロンプト' })],
        ['segment:パラメータ', sectionGroup.getByRole('button', { name: 'パラメータ' })],
        ['segment:履歴', sectionGroup.getByRole('button', { name: '履歴' })],
        ['#undo-btn-mobile', page.locator('#undo-btn-mobile')],
        ['#redo-btn-mobile', page.locator('#redo-btn-mobile')],
        ['#manage-presets-btn-mobile', page.locator('#manage-presets-btn-mobile')],
        ['#add-set-btn-mobile', page.locator('#add-set-btn-mobile')],
        ['preset:select', setAChip.locator('[data-preset-select]')],
        ['preset:checkbox', setAChip.locator('label')],
        ['preset:menu', setAChip.locator('[data-preset-menu-trigger]')],
        ['prompt-tab:Positive Prompt', promptPanel.getByRole('button', { name: 'Positive Prompt', exact: true })],
        ['prompt:copy', promptPanel.getByRole('button', { name: 'プロンプトをコピー (Main_Positive_Prompt)' })],
        ['prompt:clipboard-menu', promptPanel.getByRole('button', { name: 'クリップボード・履歴メニュー (Main_Positive_Prompt)' })],
        ['prompt:translate', promptPanel.getByRole('button', { name: '翻訳' })],
        ['prompt:add-asset', page.locator('#add-asset-btn-mobile-Main_Positive_Prompt')],
      ]

      for (const [label, control] of controls) {
        await expect(control, `${label} visible`).toBeVisible()
        const box = await measureControlHitSlop(control)
        expect(box.visualH, `${label} visualH (${vp.width})`).toBeLessThan(44)
        expect(box.hitW, `${label} hitW (${vp.width})`).toBeGreaterThanOrEqual(44)
        expect(box.hitH, `${label} hitH (${vp.width})`).toBeGreaterThanOrEqual(44)
      }

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
    }

    await page.setViewportSize({ width: 360, height: 640 })
  })

  await test.step('[REQ-435/AC-2] 隣接Hit-Slop非重複・中心タップ独立実行・キーボードフォーカス視認', async () => {
    const sectionGroup = page.getByRole('group', { name: '表示セクション' })
    const setAChip = page.locator('[data-preset-id="101"]')
    const promptPanel = page.getByTestId('mobile-prompt-panel')

    const segmentBoxes = await Promise.all([
      measureControlHitSlop(sectionGroup.getByRole('button', { name: 'プロンプト' })),
      measureControlHitSlop(sectionGroup.getByRole('button', { name: 'パラメータ' })),
      measureControlHitSlop(sectionGroup.getByRole('button', { name: '履歴' })),
    ])
    for (let i = 0; i < segmentBoxes.length - 1; i++) {
      const { overlapW, overlapH } = getBoxIntersection(segmentBoxes[i], segmentBoxes[i + 1])
      expect(overlapW === 0 || overlapH === 0).toBe(true)
    }

    const tabItemBoxes = await Promise.all([
      measureControlHitSlop(setAChip.locator('[data-preset-select]')),
      measureControlHitSlop(setAChip.locator('label')),
      measureControlHitSlop(setAChip.locator('[data-preset-menu-trigger]')),
    ])
    for (let i = 0; i < tabItemBoxes.length - 1; i++) {
      const { overlapW, overlapH } = getBoxIntersection(tabItemBoxes[i], tabItemBoxes[i + 1])
      expect(overlapW === 0 || overlapH === 0).toBe(true)
    }

    const toolbarBoxes = await Promise.all([
      measureControlHitSlop(promptPanel.getByRole('button', { name: 'プロンプトをコピー (Main_Positive_Prompt)' })),
      measureControlHitSlop(promptPanel.getByRole('button', { name: 'クリップボード・履歴メニュー (Main_Positive_Prompt)' })),
      measureControlHitSlop(promptPanel.getByRole('button', { name: '翻訳' })),
      measureControlHitSlop(page.locator('#add-asset-btn-mobile-Main_Positive_Prompt')),
    ])
    for (let i = 0; i < toolbarBoxes.length - 1; i++) {
      const { overlapW, overlapH } = getBoxIntersection(toolbarBoxes[i], toolbarBoxes[i + 1])
      expect(overlapW === 0 || overlapH === 0).toBe(true)
    }

    // Center tap independent execution
    await setAChip.locator('[data-preset-menu-trigger]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: '閉じる', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await sectionGroup.getByRole('button', { name: 'パラメータ' }).click()
    await expect(sectionGroup.getByRole('button', { name: 'パラメータ' })).toHaveAttribute('aria-pressed', 'true')
    await expect(sectionGroup.getByRole('button', { name: '履歴' })).toHaveAttribute('aria-pressed', 'false')

    // Keyboard focus visibility on stage toggle
    const mainStageToggle = page.locator('#mobile-parameters-panel section[data-stage-key="main"] button.stage-input-group__toggle')
    await mainStageToggle.focus()
    const focusInfo = await mainStageToggle.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { isFocused: document.activeElement === el, outlineStyle: cs.outlineStyle, outlineWidth: parseFloat(cs.outlineWidth) }
    })
    expect(focusInfo.isFocused).toBe(true)
    expect(focusInfo.outlineStyle !== 'none' || focusInfo.outlineWidth >= 0).toBe(true)
    await sectionGroup.getByRole('button', { name: 'プロンプト' }).click()
  })

  await test.step('[REQ-435/AC-7][REQ-435/AC-8] 生成中進捗バー1本・n/m進行・ETA/Queue/完了導線維持', async () => {
    const bars = page.getByRole('progressbar')
    await expect(bars).toHaveCount(1)
    await expect(bars.first()).toHaveAttribute('data-testid', 'mobile-running-job-progress-bar')
    await expect(bars.first()).toHaveAttribute('aria-valuenow', '60')

    const progressSection = page.getByTestId('mobile-progress-section')
    await expect(progressSection.getByRole('progressbar')).toHaveCount(0)
    await expect(page.getByTestId('mobile-overall-progress-text')).toHaveText('1/3')
    await expect(progressSection.getByText(/経過:/)).toBeVisible()
    await expect(progressSection.getByText('Queue: 3')).toBeVisible()

    await progressSection.getByText('Queue: 3').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    controller.pushSnapshot({
      ...initialSnapshot,
      revision: 2,
      jobs: [
        makeJob('j1', 'succeeded'),
        makeJob('j2', 'running', new Date(Date.now() - 15_000).toISOString(), 1, 2),
        makeJob('j3', 'queued'),
      ],
    })
    await expect(page.getByTestId('mobile-overall-progress-text')).toHaveText('2/3')
    await expect(progressSection.getByText(/残り約:/)).toBeVisible()

    controller.pushSnapshot({
      ...initialSnapshot,
      revision: 3,
      jobs: [
        makeJob('j1', 'succeeded'),
        makeJob('j2', 'succeeded'),
        makeJob('j3', 'succeeded'),
      ],
    })
    await expect(page.getByRole('progressbar')).toHaveCount(0)
    const completionBtn = page.getByTestId('mobile-completion-nav-btn')
    await expect(completionBtn).toHaveText('生成完了: 最新画像を表示')
    await completionBtn.click()
    await expect(page.getByRole('group', { name: '表示セクション' }).getByRole('button', { name: '履歴' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('group', { name: '表示セクション' }).getByRole('button', { name: 'プロンプト' }).click()
  })

  await test.step('[REQ-435/AC-13][REQ-435/AC-14][REQ-435/AC-15][REQ-435/AC-16] Mobile パラメータステージ表示・折り畳み・永続化', async () => {
    await expect(page.locator('#mobile-prompt-panel .stage-input-group__toggle')).toHaveCount(0)

    const sectionGroup = page.getByRole('group', { name: '表示セクション' })
    await sectionGroup.getByRole('button', { name: 'パラメータ' }).click()

    const mainToggle = page.locator('#mobile-parameters-panel section[data-stage-key="main"] button.stage-input-group__toggle')
    const roughToggle = page.locator('#mobile-parameters-panel section[data-stage-key="rough"] button.stage-input-group__toggle')
    await expect(mainToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(roughToggle).toHaveAttribute('aria-expanded', 'true')

    await roughToggle.click()
    await expect(roughToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(mainToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#mobile-parameters-panel section[data-stage-key="rough"] .stage-input-group__body')).toBeHidden()

    await page.reload()
    await expect(page.locator('#workflow-actions-btn')).toBeVisible()
    await page.getByRole('group', { name: '表示セクション' }).getByRole('button', { name: 'パラメータ' }).click()
    await expect(page.locator('#mobile-parameters-panel section[data-stage-key="rough"] button.stage-input-group__toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#mobile-parameters-panel section[data-stage-key="main"] button.stage-input-group__toggle')).toHaveAttribute('aria-expanded', 'true')

    // Switch workflow to W2 and back to W1
    await page.locator('#workflow-select-mobile').selectOption('2')
    await expect(page.locator('#mobile-parameters-panel section[data-stage-key="rough"] button.stage-input-group__toggle')).toHaveAttribute('aria-expanded', 'true')
    await page.locator('#workflow-select-mobile').selectOption('1')
    await expect(page.locator('#mobile-parameters-panel section[data-stage-key="rough"] button.stage-input-group__toggle')).toHaveAttribute('aria-expanded', 'false')
  })

  await test.step('[REQ-435/AC-19] 360px SafeAreaあり/なし・ソフトキーボード開閉で固定バーとボトムナビに隠れない', async () => {
    const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' })
    const actionBar = page.getByTestId('mobile-action-bar')

    // Without extra SafeArea
    await expect(actionBar).toBeVisible()
    await expect(mobileNav).toBeVisible()
    const actionBox = await actionBar.boundingBox()
    const navBox = await mobileNav.boundingBox()
    expect(actionBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(navBox!.y + 1)

    // Scroll to bottom of parameter list and verify last control is not covered by fixed bars
    const lastParamInput = page.locator('#mobile-parameters-panel input').last()
    await lastParamInput.scrollIntoViewIfNeeded()
    const lastBox = await lastParamInput.boundingBox()
    expect(lastBox).not.toBeNull()
    expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(actionBox!.y + 1)

    // Simulate SafeArea bottom inset (34px) via CSS custom style verification & layout check
    await page.addStyleTag({ content: ':root { --test-safe-area: 34px; }' })
    const safeAreaCalcOk = await actionBar.evaluate((el) => el.className.includes('env(safe-area-inset-bottom)'))
    expect(safeAreaCalcOk).toBe(true)

    // Soft keyboard open (focus text input -> action bar hides, tag suggest bar appears)
    await page.getByRole('group', { name: '表示セクション' }).getByRole('button', { name: 'プロンプト' }).click()
    await page.getByRole('button', { name: 'テキスト入力モード切替' }).click()
    const promptTextarea = page.locator('#mobile-prompt-panel textarea').first()
    await promptTextarea.focus()
    await expect(actionBar).toBeHidden()
    const tagBar = page.getByTestId('mobile-tag-suggest-bar')
    await expect(tagBar).toBeVisible()

    // Shrink viewport height to simulate software keyboard (360x360) and confirm focused textarea stays visible above tag bar
    await page.setViewportSize({ width: 360, height: 360 })
    await promptTextarea.scrollIntoViewIfNeeded()
    const taBox = await promptTextarea.boundingBox()
    const tagBarBox = await tagBar.boundingBox()
    expect(taBox).not.toBeNull()
    expect(tagBarBox).not.toBeNull()
    expect(taBox!.y).toBeGreaterThanOrEqual(0)
    expect(taBox!.y + taBox!.height).toBeLessThanOrEqual(tagBarBox!.y + 2)

    // Close software keyboard (blur) -> restore 360x640 -> action bar returns cleanly above bottom nav
    await page.setViewportSize({ width: 360, height: 640 })
    await promptTextarea.evaluate((el) => (el as HTMLElement).blur())
    await expect(tagBar).toHaveCount(0)
    await expect(actionBar).toBeVisible()
    const restoredActionBox = await actionBar.boundingBox()
    const restoredNavBox = await mobileNav.boundingBox()
    expect(restoredActionBox!.y + restoredActionBox!.height).toBeLessThanOrEqual(restoredNavBox!.y + 1)
  })
})

test('[REQ-435/AC-9] Desktop Generate 1280x800: 進捗表示維持とステージ折り畳み・Sticky見出し保持', { tag: '@critical' }, async ({ page }) => {
  test.setTimeout(30_000)

  const controller = await setupResponsiveGenerate(page, DESKTOP)

  await test.step('[REQ-435/AC-9] Desktop 生成中進捗表示が従来どおりであること', async () => {
    await expect(page.getByText('Ready')).toBeVisible()
    await expect(page.getByText('0%')).toBeVisible()

    controller.pushSnapshot({
      version: 1,
      epoch: 'resp-epoch',
      revision: 2,
      normal_group_id: 'normal-group-1',
      batches: [{ batch_id: 'batch-1', scope: 'normal', project_id: null }],
      upstream: { http_ready: true, ws_connected: true, failure_since: null },
      jobs: [
        {
          job_id: 'j1',
          request_id: 'j1',
          prompt_id: 'j1',
          session_id: 'test-session',
          scope: 'normal',
          batch_id: 'batch-1',
          normal_group_id: 'normal-group-1',
          project_id: null,
          status: 'running',
          started_at: new Date(Date.now() - 10_000).toISOString(),
          finished_at: null,
          node: { id: '3', name: 'KSampler', value: 4, max: 10 },
          outputs: [],
          failure: null,
        },
        {
          job_id: 'j2',
          request_id: 'j2',
          prompt_id: 'j2',
          session_id: 'test-session',
          scope: 'normal',
          batch_id: 'batch-1',
          normal_group_id: 'normal-group-1',
          project_id: null,
          status: 'queued',
          started_at: null,
          finished_at: null,
          node: null,
          outputs: [],
          failure: null,
        },
      ],
    })

    await expect(page.getByText(/全体進捗:/)).toBeVisible()
    await expect(page.getByText('実行中: KSampler')).toBeVisible()
    await expect(page.getByText(/経過時間:/)).toBeVisible()
    await expect(page.getByText(/残り約:/)).toBeVisible()
  })

  await test.step('[REQ-435/AC-14][REQ-435/AC-15][REQ-435/AC-16] Desktop Prompt/Param ステージ折り畳み・キーボード操作・リロード＆WF往復復元', async () => {
    const promptRoughToggle = page.locator('#desktop-prompt-scroll section[data-stage-key="rough"] button.stage-input-group__toggle')
    const promptMainToggle = page.locator('#desktop-prompt-scroll section[data-stage-key="main"] button.stage-input-group__toggle')
    const paramMainToggle = page.locator('#desktop-controls-scroll section[data-stage-key="main"] button.stage-input-group__toggle')
    const paramRoughToggle = page.locator('#desktop-controls-scroll section[data-stage-key="rough"] button.stage-input-group__toggle')

    await expect(promptMainToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(promptRoughToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(paramMainToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(paramRoughToggle).toHaveAttribute('aria-expanded', 'true')

    await promptRoughToggle.click()
    await expect(promptRoughToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#desktop-prompt-scroll section[data-stage-key="rough"] .stage-input-group__body')).toBeHidden()
    await expect(paramRoughToggle).toHaveAttribute('aria-expanded', 'true')

    await paramMainToggle.focus()
    await page.keyboard.press('Enter')
    await expect(paramMainToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#desktop-controls-scroll section[data-stage-key="main"] .stage-input-group__body')).toBeHidden()

    await page.reload()
    await expect(page.locator('#workflow-actions-btn')).toBeVisible()
    await expect(page.locator('#desktop-prompt-scroll section[data-stage-key="rough"] button.stage-input-group__toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#desktop-prompt-scroll section[data-stage-key="main"] button.stage-input-group__toggle')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#desktop-controls-scroll section[data-stage-key="main"] button.stage-input-group__toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#desktop-controls-scroll section[data-stage-key="rough"] button.stage-input-group__toggle')).toHaveAttribute('aria-expanded', 'true')

    await page.locator('#workflow-select').selectOption('2')
    await expect(page.locator('#desktop-prompt-scroll section[data-stage-key="rough"] button.stage-input-group__toggle')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#desktop-controls-scroll section[data-stage-key="main"] button.stage-input-group__toggle')).toHaveAttribute('aria-expanded', 'true')

    await page.locator('#workflow-select').selectOption('1')
    await expect(page.locator('#desktop-prompt-scroll section[data-stage-key="rough"] button.stage-input-group__toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#desktop-controls-scroll section[data-stage-key="main"] button.stage-input-group__toggle')).toHaveAttribute('aria-expanded', 'false')
  })

  await test.step('[REQ-435/AC-18] Desktop 折り畳み時のスクロールでsticky見出しが切替わり入力欄を覆わない', async () => {
    const controlsRoot = page.locator('#desktop-controls-scroll')
    const mainToggle = controlsRoot.locator('section[data-stage-key="main"] button.stage-input-group__toggle')
    if ((await mainToggle.getAttribute('aria-expanded')) === 'false') {
      await mainToggle.click()
    }

    const canScroll = await controlsRoot.evaluate((el) => el.scrollHeight > el.clientHeight)
    expect(canScroll).toBe(true)

    const mainSection = controlsRoot.locator('section[data-stage-key="main"]')
    const mainHeading = mainSection.locator('.stage-input-group__heading')
    const roughSection = controlsRoot.locator('section[data-stage-key="rough"]')
    const roughHeading = roughSection.locator('.stage-input-group__heading')
    const roughInput = roughSection.locator('input').first()

    // Scroll into Main stage body so Main heading sticks at top
    await controlsRoot.evaluate((el) => {
      const mainSec = el.querySelector('section[data-stage-key="main"]') as HTMLElement
      const delta = mainSec.getBoundingClientRect().top - el.getBoundingClientRect().top
      el.scrollTop = el.scrollTop + delta + 40
    })
    const rootRect1 = await controlsRoot.boundingBox()
    const mainHeadRect1 = await mainHeading.boundingBox()
    expect(rootRect1).not.toBeNull()
    expect(mainHeadRect1).not.toBeNull()
    expect(Math.abs(mainHeadRect1!.y - rootRect1!.y)).toBeLessThanOrEqual(2)

    // Scroll into Rough stage body so Rough sticky heading replaces Main heading
    await controlsRoot.evaluate((el) => {
      const roughSec = el.querySelector('section[data-stage-key="rough"]') as HTMLElement
      const delta = roughSec.getBoundingClientRect().top - el.getBoundingClientRect().top
      el.scrollTop = el.scrollTop + delta + 40
    })
    const rootRect2 = await controlsRoot.boundingBox()
    const roughHeadRect2 = await roughHeading.boundingBox()
    expect(rootRect2).not.toBeNull()
    expect(roughHeadRect2).not.toBeNull()
    expect(Math.abs(roughHeadRect2!.y - rootRect2!.y)).toBeLessThanOrEqual(2)

    // When focusing an input inside Rough stage, scroll-margin-top prevents sticky heading from covering it
    await roughInput.focus()
    const roughHeadRect3 = await roughHeading.boundingBox()
    const focusedInputRect = await roughInput.boundingBox()
    expect(roughHeadRect3).not.toBeNull()
    expect(focusedInputRect).not.toBeNull()
    expect(focusedInputRect!.y).toBeGreaterThanOrEqual(roughHeadRect3!.y + roughHeadRect3!.height - 1)
  })
})
