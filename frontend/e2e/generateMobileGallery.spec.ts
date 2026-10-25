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
      outputs: [
        {
          node_id: '9',
          index: 0,
          filename: 'img1.png',
          subfolder: '',
          type: 'output',
          view_url: 'http://localhost:8188/view?filename=img1.png',
          thumbnail_url: 'http://localhost:8188/view?filename=img1.png',
          availability: 'present',
        },
        {
          node_id: '9',
          index: 1,
          filename: 'img2.png',
          subfolder: '',
          type: 'output',
          view_url: 'http://localhost:8188/view?filename=img2.png',
          thumbnail_url: 'http://localhost:8188/view?filename=img2.png',
          availability: 'present',
        },
        {
          node_id: '9',
          index: 2,
          filename: 'img3.png',
          subfolder: '',
          type: 'output',
          view_url: 'http://localhost:8188/view?filename=img3.png',
          thumbnail_url: 'http://localhost:8188/view?filename=img3.png',
          availability: 'present',
        },
      ],
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
async function stubApi(page: Page, isEmpty = false): Promise<string[]> {
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
    if (path === '/workflows/1') return json(WORKFLOW)
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
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    })
  })
  return wsUrls
}

async function openGenerate(
  page: Page,
  width: number,
  height: number,
  isEmpty = false
): Promise<string[]> {
  await page.addInitScript(({ empty }) => {
    localStorage.clear()
    localStorage.setItem('prompt-surgeon-workflow-id', '1')
    localStorage.setItem('prompt-surgeon-client-id', 'test-session')
    localStorage.setItem('prompt-surgeon-filter-own', empty ? 'true' : 'false')
    if (!empty) {
      localStorage.setItem(
        'prompt-surgeon-batch-images',
        JSON.stringify([
          'http://localhost:8188/view?filename=img1.png',
          'http://localhost:8188/view?filename=img2.png',
          'http://localhost:8188/view?filename=img3.png',
        ])
      )
      localStorage.setItem('prompt-surgeon-selected-img', 'http://localhost:8188/view?filename=img1.png')
    }
    try {
      indexedDB.deleteDatabase('REACT_QUERY_OFFLINE_CACHE')
    } catch {}
  }, { empty: isEmpty })
  const wsUrls = await stubApi(page, isEmpty)
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
  })
})

