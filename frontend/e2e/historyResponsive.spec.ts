import { test, expect, type Locator, type Page } from '@playwright/test'

const WORKFLOWS = [
  { id: 10, name: 'Workflow A', created_at: '2026-10-01T00:00:00Z' },
  { id: 11, name: 'Workflow B', created_at: '2026-10-02T00:00:00Z' },
]

const LORAS = [
  { id: 20, model_name: 'lora_alpha.safetensors', description: 'Alpha LoRA', tags: [], trigger_words: [] },
  { id: 21, model_name: 'lora_beta.safetensors', description: 'Beta LoRA', tags: [], trigger_words: [] },
]

const TAG_SETS = [
  { id: 30, name: 'TagSet Sunny', tags: ['sunny'] },
  { id: 31, name: 'TagSet Night', tags: ['night'] },
]

interface MockSnapshotRecord {
  id: number
  workflow_id: number
  lora_ids: number[]
  tag_set_ids: number[]
  image_path: string
  thumbnail_path: string
  created_at: string
}

const SNAPSHOTS: MockSnapshotRecord[] = [
  {
    id: 1,
    workflow_id: 10,
    lora_ids: [20],
    tag_set_ids: [30],
    image_path: '/view?filename=snap1.png',
    thumbnail_path: '/api/comfy/thumbnail?filename=snap1.png',
    created_at: '2026-10-01T10:00:00Z',
  },
  {
    id: 2,
    workflow_id: 10,
    lora_ids: [21],
    tag_set_ids: [31],
    image_path: '/view?filename=snap2.png',
    thumbnail_path: '/api/comfy/thumbnail?filename=snap2.png',
    created_at: '2026-10-02T10:00:00Z',
  },
  {
    id: 3,
    workflow_id: 11,
    lora_ids: [20],
    tag_set_ids: [30],
    image_path: '/view?filename=snap3.png',
    thumbnail_path: '/api/comfy/thumbnail?filename=snap3.png',
    created_at: '2026-10-03T10:00:00Z',
  },
]

interface HitSlopBox {
  visualW: number
  visualH: number
  hitLeft: number
  hitTop: number
  hitRight: number
  hitBottom: number
  hitW: number
  hitH: number
}

async function measureHitSlop(locator: Locator): Promise<HitSlopBox> {
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

function getIntersection(a: HitSlopBox, b: HitSlopBox) {
  const overlapW = Math.max(0, Math.min(a.hitRight, b.hitRight) - Math.max(a.hitLeft, b.hitLeft))
  const overlapH = Math.max(0, Math.min(a.hitBottom, b.hitBottom) - Math.max(a.hitTop, b.hitTop))
  return { overlapW, overlapH }
}

async function openHistoryMobile(page: Page) {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.addInitScript(() => {
    localStorage.clear()
    try {
      indexedDB.deleteDatabase('REACT_QUERY_OFFLINE_CACHE')
    } catch {}
  })

  await page.routeWebSocket((url) => url.pathname === '/api/ws', (ws) => {
    ws.onMessage(() => {})
  })

  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace(/^\/api/, '')
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (path === '/comfy/thumbnail') {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#27272a"/></svg>'
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg })
    }
    if (req.method() !== 'GET') return json({})
    if (path === '/workflows') return json(WORKFLOWS)
    if (path === '/loras') return json(LORAS)
    if (path === '/tag-sets') return json(TAG_SETS)
    if (path === '/albums') return json([])
    if (path === '/snapshots') {
      const wfParam = url.searchParams.get('workflow_id')
      const loraParam = url.searchParams.get('lora_id')
      const tagSetParam = url.searchParams.get('tag_set_id')
      const filtered = SNAPSHOTS.filter((s) => {
        if (wfParam && s.workflow_id !== Number(wfParam)) return false
        if (loraParam && !s.lora_ids.includes(Number(loraParam))) return false
        if (tagSetParam && !s.tag_set_ids.includes(Number(tagSetParam))) return false
        return true
      }).map(({ id, workflow_id, image_path, thumbnail_path, created_at }) => ({
        id,
        workflow_id,
        image_path,
        thumbnail_path,
        created_at,
      }))
      return json(filtered)
    }
    if (path === '/generation/state') {
      return json({
        version: 1,
        epoch: 'history-e2e',
        revision: 1,
        normal_group_id: null,
        jobs: [],
        batches: [],
        upstream: { http_ready: true, ws_connected: true, failure_since: null },
      })
    }
    if (path === '/generation/upstream-queue') return json({ running: [], pending: [] })
    if (path === '/settings/vram') return json({ vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 8, vram_total_gb: 12 })
    if (path === '/speech/batch/active') return json(null)
    if (/\/(usages|status)$/.test(path) || /settings|config|health/.test(path)) return json({})
    return json([])
  })

  await page.route((url) => url.pathname === '/view', async (route) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#27272a"/></svg>'
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg })
  })

  await page.goto('/history')
  await expect(page.locator('#history-mobile-filter-toggle')).toBeVisible()
  await expect(page.locator('#snap-card-3')).toBeVisible()
}

test('[REQ-435/AC-10] History Mobile 360x640: ヘッダー密度・フィルター初期折り畳み・件数表示・常時ソート', { tag: '@critical' }, async ({ page }) => {
  await openHistoryMobile(page)

  await test.step('[REQ-435/AC-1][REQ-435/AC-2] History 360px ヘッダー・フィルター操作の外形縮小とHit-Slop非重複', async () => {
    const mobileBar = page.getByTestId('history-mobile-filter-bar')
    const controls = [
      page.locator('#view-snapshots'),
      page.locator('#view-albums'),
      page.locator('#open-batch-speech-modal-btn'),
      page.locator('#start-create-album'),
      page.locator('#history-mobile-filter-toggle'),
      mobileBar.getByRole('button', { name: '新しい順' }),
      mobileBar.getByRole('button', { name: '古い順' }),
    ]

    const boxes: HitSlopBox[] = []
    for (const locator of controls) {
      await expect(locator).toBeVisible()
      const box = await measureHitSlop(locator)
      expect(box.visualH).toBeLessThan(44)
      expect(box.hitH).toBeGreaterThanOrEqual(44)
      expect(box.hitW).toBeGreaterThanOrEqual(44)
      boxes.push(box)
    }

    const adjacentPairs: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 3],
      [4, 5],
      [5, 6],
    ]
    for (const [i, j] of adjacentPairs) {
      const { overlapW, overlapH } = getIntersection(boxes[i], boxes[j])
      expect(overlapW === 0 || overlapH === 0).toBe(true)
    }

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  })

  await test.step('[REQ-435/AC-10] 360x640 初期折り畳み1行と最初の画像カード視認可能', async () => {
    const toggle = page.locator('#history-mobile-filter-toggle')
    const filterControls = page.locator('#history-filter-controls')
    const mobileBar = page.getByTestId('history-mobile-filter-bar')
    const sortNewest = mobileBar.getByRole('button', { name: '新しい順' })

    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(filterControls).not.toBeVisible()

    const barBox = await mobileBar.boundingBox()
    const toggleBox = await toggle.boundingBox()
    const sortBox = await sortNewest.boundingBox()
    expect(barBox).not.toBeNull()
    expect(toggleBox).not.toBeNull()
    expect(sortBox).not.toBeNull()
    expect(barBox!.height).toBeLessThanOrEqual(56)
    expect(Math.abs(toggleBox!.y - sortBox!.y)).toBeLessThanOrEqual(12)

    const firstCard = page.getByTestId('snapshot-grid').locator('[id^="snap-card-"]').first()
    await expect(firstCard).toBeVisible()
    const firstCardBox = await firstCard.boundingBox()
    expect(firstCardBox).not.toBeNull()
    expect(firstCardBox!.y).toBeLessThan(640)
    expect(firstCardBox!.y + firstCardBox!.height).toBeLessThanOrEqual(640)
  })

  await test.step('[REQ-435/AC-11] 絞り込み条件指定後に折り畳むと件数が文字表示される', async () => {
    const toggle = page.locator('#history-mobile-filter-toggle')
    await expect(page.getByTestId('history-active-filter-count')).toHaveCount(0)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#history-filter-controls')).toBeVisible()

    await page.locator('#history-workflow-filter').selectOption('10')
    await page.locator('#history-lora-filter').selectOption('20')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#history-filter-controls')).not.toBeVisible()
    await expect(page.getByTestId('history-active-filter-count')).toBeVisible()
    await expect(page.getByTestId('history-active-filter-count')).toHaveText('(2件)')

    await toggle.click()
    await page.locator('#history-workflow-filter').selectOption('')
    await page.locator('#history-lora-filter').selectOption('')
    await toggle.click()
    await expect(page.getByTestId('history-active-filter-count')).toHaveCount(0)
  })

  await test.step('[REQ-435/AC-12] 開閉両状態でソート可・AND結合・0件Empty Stateと解除', async () => {
    const toggle = page.locator('#history-mobile-filter-toggle')
    const mobileBar = page.getByTestId('history-mobile-filter-bar')
    const filterControls = page.locator('#history-filter-controls')
    const gridCards = page.getByTestId('snapshot-grid').locator('[id^="snap-card-"]')

    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await mobileBar.getByRole('button', { name: '古い順' }).click()
    await expect(gridCards.first()).toHaveAttribute('id', 'snap-card-1')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await mobileBar.getByRole('button', { name: '新しい順' }).click()
    await expect(gridCards.first()).toHaveAttribute('id', 'snap-card-3')

    await page.getByRole('searchbox', { name: 'ワークフローを検索' }).fill('Workflow A')
    await expect(page.locator('#history-workflow-filter option[value="10"]')).toHaveCount(1)
    await page.locator('#history-workflow-filter').selectOption('10')
    await page.locator('#history-lora-filter').selectOption('20')
    await page.locator('#history-tagset-filter').selectOption('31')

    await expect(filterControls.getByRole('button', { name: /Workflow: Workflow A/ })).toBeVisible()
    await expect(page.getByText('条件に一致するスナップショットがありません。')).toBeVisible()

    await page.getByRole('button', { name: 'フィルターを解除' }).click()
    await expect(gridCards).toHaveCount(3)
    await expect(page.getByTestId('history-active-filter-count')).toHaveCount(0)
  })
})
