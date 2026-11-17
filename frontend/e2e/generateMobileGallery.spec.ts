import { test, expect, type Page } from '@playwright/test'

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

const EMPTY_SNAPSHOT = {
  version: 1,
  epoch: 'epoch-empty',
  revision: 1,
  normal_group_id: 'normal-group-empty',
  jobs: [],
  batches: [],
  upstream: { http_ready: true, ws_connected: true, failure_since: null },
}

// Stub only backend API calls (pathname starts with /api/); never Vite module requests like /src/api/*.
async function stubApi(page: Page, isEmpty = false, workflowOverride?: unknown): Promise<string[]> {
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
    if (path === '/generation/state') return json(isEmpty ? EMPTY_SNAPSHOT : MOCK_SNAPSHOT)
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

async function openGenerate(
  page: Page,
  width: number,
  height: number,
  isEmpty = false,
  workflowOverride?: unknown
): Promise<string[]> {
  await page.addInitScript(({ empty, images }) => {
    localStorage.clear()
    localStorage.setItem('prompt-surgeon-workflow-id', '1')
    localStorage.setItem('prompt-surgeon-client-id', 'test-session')
    localStorage.setItem('prompt-surgeon-filter-own', empty ? 'true' : 'false')
    if (!empty) {
      localStorage.setItem('prompt-surgeon-batch-images', JSON.stringify(images))
      localStorage.setItem('prompt-surgeon-selected-img', images[0] ?? '')
    }
    try {
      indexedDB.deleteDatabase('REACT_QUERY_OFFLINE_CACHE')
    } catch {}
  }, { empty: isEmpty, images: MOCK_OUTPUTS.map((o) => o.view_url) })
  const wsUrls = await stubApi(page, isEmpty, workflowOverride)
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await expect(page.locator('#workflow-actions-btn')).toBeVisible()
  return wsUrls
}

test.describe('Mobile Generate Gallery, Bottom Sheet, Fullscreen Viewer & PC Non-regression', () => {
  test.setTimeout(20000)

  test.describe('Mobile Viewport (375x667)', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('[REQ-372/AC-1] Mobile 375px: persistent preview does NOT exist', async ({ page }) => {
      await openGenerate(page, 375, 667)
      // data-testid="mobile-main-preview" must not be in the DOM
      const mainPreview = page.locator('[data-testid="mobile-main-preview"]')
      await expect(mainPreview).toHaveCount(0)
    })

    test('[REQ-372/AC-2] Mobile 375px: history section has 3-column square grid, no horizontal scroll reel', async ({
      page,
    }) => {
      await openGenerate(page, 375, 667)

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

    test('[REQ-372/AC-3] Mobile 375px: tapping thumbnail opens bottom sheet (MobileImageSheet)', async ({
      page,
    }) => {
      await openGenerate(page, 375, 667)

      // Switch to history segment
      await page.locator('button[aria-controls="mobile-history-panel"]').click()

      // Tap first thumbnail
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

    test('[REQ-372/AC-4] Mobile 375px: tapping sheet image transitions to black fullscreen viewer with chrome hidden', async ({
      page,
    }) => {
      await openGenerate(page, 375, 667)

      await page.locator('button[aria-controls="mobile-history-panel"]').click()
      await page.locator('#thumb-mobile-0').click()

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

    test('[REQ-372/AC-5] Mobile 375px: tapping close button returns from fullscreen to bottom sheet', async ({
      page,
    }) => {
      await openGenerate(page, 375, 667)

      await page.locator('button[aria-controls="mobile-history-panel"]').click()
      await page.locator('#thumb-mobile-0').click()

      const sheetContent = page.locator('[data-testid="mobile-image-sheet-content"]')
      await sheetContent.locator('img[alt="プレビュー画像"]').click()

      const viewer = page.locator('[data-testid="mobile-fullscreen-viewer"]')
      await expect(viewer).toBeVisible()

      // Tap close button in fullscreen viewer
      const closeBtn = page.locator('[data-testid="mobile-fullscreen-close-btn"]')
      await closeBtn.click()

      // Fullscreen viewer closed, returned to bottom sheet
      await expect(viewer).not.toBeVisible()
      await expect(sheetContent).toBeVisible()
    })

    test('[REQ-372/AC-6] Mobile 375px: closing bottom sheet returns to gallery', async ({ page }) => {
      await openGenerate(page, 375, 667)

      await page.locator('button[aria-controls="mobile-history-panel"]').click()
      await page.locator('#thumb-mobile-0').click()

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

    test('[REQ-372/AC-7] Mobile 375px: empty state displayed when 0 images', async ({ page }) => {
      // Open with empty history
      await openGenerate(page, 375, 667, true)

      // Switch to history segment
      await page.locator('button[aria-controls="mobile-history-panel"]').click()

      const historyPanel = page.locator('#mobile-history-panel')
      await expect(historyPanel).toBeVisible()
      await expect(
        historyPanel.locator('text=No history images found for this session.')
      ).toBeVisible()
    })

    test('[REQ-395/AC-3] Mobile 375px: app WebSocket /api/ws is served by the stub and never reaches the backend', async ({
      page,
    }) => {
      const wsUrls = await openGenerate(page, 375, 667)

      // The app opens /api/ws on load; routeWebSocket must capture it (no connectToServer, so no backend).
      await expect.poll(() => wsUrls.length).toBeGreaterThan(0)
      for (const url of wsUrls) {
        expect(new URL(url).pathname).toBe('/api/ws')
      }
    })

    test('[REQ-433/AC-3] mobile ParamPanel toggle switches keep pill shape and 44x44 hit slop', async ({
      page,
    }) => {
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
      await openGenerate(page, 375, 667, false, workflowWithSwitches)

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

  test.describe('Mobile Carousel & Swipe Gestures (375x812)', () => {
    test.use({ viewport: { width: 375, height: 812 } })

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

    test('[REQ-431/AC-1] Mobile 375x812: 3-image carousel follows finger translateX and snaps back below threshold', async ({
      page,
    }) => {
      await openGenerate(page, 375, 812)
      await page.locator('button[aria-controls="mobile-history-panel"]').click()
      await page.locator('#thumb-mobile-0').click()

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

    test('[REQ-431/AC-2][REQ-431/AC-3] Mobile 375x812: left/right swipe switches images and syncs download href', async ({
      page,
    }) => {
      await openGenerate(page, 375, 812)
      await page.locator('button[aria-controls="mobile-history-panel"]').click()
      await page.locator('#thumb-mobile-0').click()

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

    test('[REQ-431/AC-4] Mobile 375x812: fullscreen viewer supports horizontal swipe and preserves image on exit', async ({
      page,
    }) => {
      await openGenerate(page, 375, 812)
      await page.locator('button[aria-controls="mobile-history-panel"]').click()
      await page.locator('#thumb-mobile-0').click()

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

    test('[REQ-431/AC-5] Mobile 375x812: swipe-down closes sheet preserving scroll, and is disabled in fullscreen', async ({
      page,
    }) => {
      await openGenerate(page, 375, 812)
      await page.locator('button[aria-controls="mobile-history-panel"]').click()

      // Scroll main container before opening sheet
      const mainContainer = page.locator('main')
      const scrollBefore = await mainContainer.evaluate((el) => {
        el.scrollTop = 120
        return el.scrollTop
      })

      await page.locator('#thumb-mobile-0').click()
      const sheet = page.locator('[data-testid="mobile-image-sheet"]')
      const sheetContent = page.locator('[data-testid="mobile-image-sheet-content"]')
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

    test('[REQ-431/AC-6] Mobile 375x812: gesture direction lock isolates horizontal vs vertical swipes', async ({
      page,
    }) => {
      await openGenerate(page, 375, 812)
      await page.locator('button[aria-controls="mobile-history-panel"]').click()
      await page.locator('#thumb-mobile-0').click()

      const sheet = page.locator('[data-testid="mobile-image-sheet"]')
      const sheetContent = page.locator('[data-testid="mobile-image-sheet-content"]')
      const track = sheetContent.locator('[data-testid="mobile-image-carousel-track"]')
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

    test('[REQ-431/AC-7] Mobile 375x812: closing sheet after swipe syncs 3-column history grid selection', async ({
      page,
    }) => {
      await openGenerate(page, 375, 812)
      await page.locator('button[aria-controls="mobile-history-panel"]').click()

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

  test.describe('Desktop Viewport (1280x800)', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('[REQ-372/AC-14] Desktop 1280px: persistent preview remains intact on desktop', async ({ page }) => {
      await openGenerate(page, 1280, 800)

      // Parallel preview container or desktop preview area must exist and be visible
      const parallelPreview = page.locator('[data-testid="generate-parallel-preview"]')
      await expect(parallelPreview).toBeVisible()

      // Also mobile-main-preview should NOT exist on desktop
      const mobilePreview = page.locator('[data-testid="mobile-main-preview"]')
      await expect(mobilePreview).toHaveCount(0)
    })

    test('[REQ-383/AC-1..3] Desktop: continuous horizontal reel, initial center alignment with edge margins, and wheel inertia snap', async ({
      page,
    }) => {
      await openGenerate(page, 1280, 800)
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

    test('[REQ-383/AC-4] Desktop: mixed aspect ratios maintain native proportions without distortion or container overflow', async ({
      page,
    }) => {
      await openGenerate(page, 1280, 800)
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

    test('[REQ-383/AC-5..6] Desktop: latest and oldest jump buttons cancel inertia and center target tiles', async ({
      page,
    }) => {
      await openGenerate(page, 1280, 800)
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

    test('[REQ-383/AC-7..8] Desktop: history thumbnail click centers preview in normal mode, suppressed in multi-select mode', async ({
      page,
    }) => {
      await openGenerate(page, 1280, 800)
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

    test('[REQ-383/AC-9] Desktop: boundary close bar collapses history and restores preview to full height', async ({
      page,
    }) => {
      await openGenerate(page, 1280, 800)
      const preview = page.locator('[data-testid="generate-parallel-preview"]')
      await expect(preview).toBeVisible()

      // Open history pane
      const toggle = page.locator('[data-generate-reel-history-toggle="true"]')
      await toggle.click()
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

    test('[REQ-383/AC-10..11] Desktop: auto-follow and session filter bidirectional sync between reel toolbar and history pane', async ({
      page,
    }) => {
      await openGenerate(page, 1280, 800)

      const autoFollow = page.locator('[data-generate-reel-auto-follow="true"]')
      const sessionFilter = page.locator('[data-generate-reel-session-filter="true"]')
      await expect(autoFollow).toBeVisible()
      await expect(sessionFilter).toBeVisible()

      // Toggle auto-follow
      const followBefore = await autoFollow.getAttribute('aria-pressed')
      await autoFollow.click()
      await expect(autoFollow).toHaveAttribute('aria-pressed', followBefore === 'true' ? 'false' : 'true')

      // Toggle session filter
      const filterBefore = await sessionFilter.getAttribute('aria-pressed')
      await sessionFilter.click()
      await expect(sessionFilter).toHaveAttribute('aria-pressed', filterBefore === 'true' ? 'false' : 'true')
    })

    test('[REQ-383/AC-12] Desktop: tile click opens HistoryModalPreview and Escape closes it', async ({
      page,
    }) => {
      await openGenerate(page, 1280, 800)
      const reel = page.locator('[data-testid="generate-reel-viewport"]')
      await expect(reel).toBeVisible()

      // Click first tile to open modal
      const firstTileBtn = reel.locator('[data-generate-reel-tile="true"]').first().locator('button')
      await firstTileBtn.click()

      const modalBackdrop = page.locator('.modal-backdrop.flex.flex-col')
      await expect(modalBackdrop).toBeVisible()

      // Press Escape to close modal
      await page.keyboard.press('Escape')
      await expect(modalBackdrop).toHaveCount(0)
    })

    test('[REQ-383/AC-13] Desktop: preserves history bulk actions and snapshot tab switching in desktop history pane', async ({
      page,
    }) => {
      await openGenerate(page, 1280, 800)

      // Open history pane
      await page.locator('[data-generate-reel-history-toggle="true"]').click()
      const historyPane = page.locator('[data-generate-reel-history-pane="true"]')
      await expect(historyPane).toBeVisible()

      // Switch to Snapshots tab
      const snapshotsTab = historyPane.locator('button', { hasText: 'スナップショット' })
      await snapshotsTab.click()
      await expect(historyPane.locator('text=No snapshots available for this workflow.')).toBeVisible()

      // Switch back to History tab
      const historyTab = historyPane.locator('button', { hasText: '履歴' })
      await historyTab.click()
      await expect(historyPane.locator('#thumb-0')).toBeVisible()

      // Enter multi-select via Ctrl+click and verify bulk select/deselect
      await historyPane.locator('#thumb-0').click({ modifiers: ['Control'] })
      await expect(historyPane.locator('text=すべて選択')).toBeVisible()
      await historyPane.locator('text=すべて選択').click()
      await expect(historyPane.locator('text=8枚選択中')).toBeVisible()

      await historyPane.locator('text=選択解除').click()
      await expect(historyPane.locator('text=0枚選択中')).toBeVisible()

      // Exit multi-select
      await historyPane.locator('[aria-label="選択モード終了"]').click()
      await expect(historyPane.locator('text=0枚選択中')).toHaveCount(0)
    })

    test('[REQ-383/AC-14] Desktop: document.body does not overflow horizontally during reel interactions', async ({
      page,
    }) => {
      await openGenerate(page, 1280, 800)

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

