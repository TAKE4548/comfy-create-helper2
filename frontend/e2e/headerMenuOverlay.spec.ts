import { expect, test, type Locator, type Page } from '@playwright/test'

const HARNESS = '/e2e/fixtures/header-menu-harness.html'
const ACTIONS = [
  { id: 'workflow', trigger: '#workflow-actions-btn', panel: '[role="menu"]', last: '#workflow-actions-rescan', click: '#workflow-actions-rename', event: 'rename' as string | null },
  { id: 'kebab', trigger: '[data-testid="header-kebab-menu-button"]', panel: '[data-testid="header-kebab-dropdown"]', last: '[data-testid="header-settings-link"]', click: '[data-testid="resync-cache-button"]', event: 'cache-resync' as string | null },
  { id: 'pill', trigger: '[data-testid="mobile-vram-pill"]', panel: '[data-testid="mobile-resource-overlay"]', last: '[data-testid="mobile-resource-overlay"] > :last-child', click: '[data-testid="mobile-overlay-close"]', event: null as string | null, maxWidth: 639 },
  { id: 'future', trigger: '[data-testid="future-action-btn"]', panel: '[data-testid="future-action-panel"]', last: '[data-testid="future-item-39"]', click: '[data-testid="future-item-3"]', event: 'future-3' as string | null },
]
const VIEWPORTS = [
  { w: 375, h: 667 }, { w: 639, h: 667 }, { w: 640, h: 800 }, { w: 767, h: 900 },
  { w: 768, h: 1024 }, { w: 1023, h: 768 }, { w: 1024, h: 768 }, { w: 1280, h: 800 },
]
const SHORT_H = 360
const ANCHOR_GAP = 6 // R1: panel top = page header bottom + 6px (±1px)
type Action = (typeof ACTIONS)[number]

async function stubApi(page: Page): Promise<void> {
  await page.route((url) => url.pathname.startsWith('/api/'), (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' }))
}
async function box(loc: Locator) {
  const b = await loc.boundingBox()
  if (!b) throw new Error('element has no bounding box')
  return { ...b, bottom: b.y + b.height, right: b.x + b.width }
}
/** Bottom edge of the real page header (the contract marker `data-page-header-root`). */
const headerBottom = async (page: Page) => (await box(page.locator('[data-page-header-root]').first())).bottom
async function openHarness(page: Page, w: number, h: number): Promise<void> {
  await stubApi(page)
  await page.setViewportSize({ width: w, height: h })
  await page.goto(HARNESS)
  await expect(page.getByTestId('harness-header')).toBeVisible()
}
async function openAction(page: Page, a: Action): Promise<void> {
  await page.locator(a.trigger).first().click()
  await expect(page.locator(a.panel).first()).toBeVisible()
}
/** True when the element at (x,y) is inside any element matching `sel`. */
function inside(page: Page, sel: string, x: number, y: number): Promise<boolean> {
  return page.evaluate(({ s, px, py }) => {
    const el = document.elementFromPoint(px, py)
    return !!el && Array.from(document.querySelectorAll(s)).some((p) => p.contains(el))
  }, { s: sel, px: x, py: y })
}
async function scrollToLast(page: Page, a: Action) {
  await page.locator(a.panel).first().evaluate((el) => { el.scrollTop = el.scrollHeight })
  return box(page.locator(a.last).first())
}
/** Non-throwing reachability probe used for polling after resize. */
async function geomReachable(page: Page, a: Action): Promise<boolean> {
  const vp = page.viewportSize()!
  const lb = await scrollToLast(page, a)
  if (lb.y < 0 || lb.bottom > vp.height) return false
  return inside(page, a.last, lb.x + lb.width / 2, lb.y + lb.height / 2)
}
/** Non-throwing R1 probe: panel top sits ANCHOR_GAP below the header bottom (±1px). */
async function anchoredBelowHeader(page: Page, a: Action): Promise<boolean> {
  const hb = await headerBottom(page)
  const p = await box(page.locator(a.panel).first())
  return Math.abs(p.y - (hb + ANCHOR_GAP)) <= 1
}
/** Strict reachability: geometry, receivability (trial click) and hit-test on the last item. */
async function reachLast(page: Page, a: Action): Promise<void> {
  const vp = page.viewportSize()!
  const lb = await scrollToLast(page, a)
  expect(lb.y).toBeGreaterThanOrEqual(0)
  expect(lb.bottom).toBeLessThanOrEqual(vp.height)
  await page.locator(a.last).first().click({ trial: true })
  expect(await inside(page, a.last, lb.x + lb.width / 2, lb.y + lb.height / 2)).toBe(true)
}
/** After a resize while open: reachable and anchored under the header (both polled). */
async function settleAfterResize(page: Page, a: Action): Promise<void> {
  await expect.poll(() => geomReachable(page, a)).toBe(true)
  await expect.poll(() => anchoredBelowHeader(page, a)).toBe(true)
}
async function layoutSnapshot(page: Page) {
  const header = (await box(page.getByTestId('harness-header'))).height
  const sh = await page.evaluate(() => ({
    main: (document.querySelector('[data-testid="harness-main"]') as HTMLElement).scrollHeight,
    root: (document.querySelector('[data-testid="harness-root"]') as HTMLElement).scrollHeight,
    doc: document.documentElement.scrollHeight,
  }))
  return { header, ...sh }
}

for (const a of ACTIONS) for (const v of VIEWPORTS) {
  const tag = `${a.id} @${v.w}x${v.h}`
  test.describe(tag, () => {
    test.beforeEach(() => { test.skip(a.maxWidth !== undefined && v.w > a.maxWidth, 'pill is mobile-only') })
    test(`[REQ-346/AC-1] ${tag}: 展開パネルはヘッダー下端+6pxに出て重ならない`, async ({ page }) => {
      await openHarness(page, v.w, v.h)
      const hb = await headerBottom(page)
      const t = await box(page.locator(a.trigger).first())
      await openAction(page, a)
      const p = await box(page.locator(a.panel).first())
      expect(p.bottom).toBeGreaterThan(hb)
      expect(Math.abs(p.y - (hb + ANCHOR_GAP))).toBeLessThanOrEqual(1)
      expect(p.y).toBeGreaterThanOrEqual(t.bottom)
    })
    test(`[REQ-346/AC-1] ${tag}: 開いてもヘッダー・スクロール領域が押し広げられない`, async ({ page }) => {
      await openHarness(page, v.w, v.h)
      const before = await layoutSnapshot(page)
      await openAction(page, a)
      const after = await layoutSnapshot(page)
      for (const k of Object.keys(before) as (keyof typeof before)[]) expect(Math.abs(after[k] - before[k])).toBeLessThanOrEqual(1)
    })
    test(`[REQ-346/AC-2] ${tag}: ヘッダー下の項目をクリックできる`, async ({ page }) => {
      await openHarness(page, v.w, v.h)
      const hb = await headerBottom(page)
      await openAction(page, a)
      const item = page.locator(a.click).first()
      expect((await box(item)).y).toBeGreaterThan(hb)
      await item.click()
      if (a.event === null) await expect(page.locator(a.panel)).toHaveCount(0)
      else expect(await page.evaluate(() => (window as unknown as { __events: string[] }).__events)).toContain(a.event)
    })
    test(`[REQ-346/AC-4] ${tag}: トリガー再押下・外側クリックで閉じる`, async ({ page }) => {
      await openHarness(page, v.w, v.h)
      await openAction(page, a)
      await page.locator(a.trigger).first().click()
      await expect(page.locator(a.panel)).toHaveCount(0)
      await openAction(page, a)
      const mb = await box(page.getByTestId('harness-main'))
      await page.mouse.click(mb.x + 5, mb.bottom - 5)
      await expect(page.locator(a.panel)).toHaveCount(0)
    })
    test(`[REQ-346/AC-5] ${tag}: 画面内に収まり、重なり順で隠れず、末尾に到達できる`, async ({ page }) => {
      await openHarness(page, v.w, v.h)
      await openAction(page, a)
      const p = await box(page.locator(a.panel).first())
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.right).toBeLessThanOrEqual(v.w)
      expect(await inside(page, a.panel, p.x + 10, p.y + 10)).toBe(true)
      await reachLast(page, a)
    })
  })
}

for (const a of ACTIONS.filter((x) => x.id === 'future' || x.id === 'workflow')) for (const h of [SHORT_H, 280]) {
  test(`[REQ-346/AC-3] ${a.id} @1280x${h}: maxHeight内に収まり末尾に到達できる`, async ({ page }) => {
    await openHarness(page, 1280, h)
    await openAction(page, a)
    const panel = page.locator(a.panel).first()
    expect((await box(panel)).bottom).toBeLessThanOrEqual(h - 8 + 0.5)
    // R2: only the 40-item future panel must overflow; workflow (4 items) is not asserted to overflow.
    if (a.id === 'future') expect(await panel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    await reachLast(page, a)
  })
}

for (const v of VIEWPORTS) {
  test(`[REQ-346/AC-8] future @${v.w}x${v.h}: 40項目の末尾まで到達し実クリックできる`, async ({ page }) => {
    const a = ACTIONS.find((x) => x.id === 'future')!
    await openHarness(page, v.w, v.h)
    await openAction(page, a)
    await reachLast(page, a)
    await page.locator(a.last).click()
    expect(await page.evaluate(() => (window as unknown as { __events: string[] }).__events)).toContain('future-39')
  })
}

test('[REQ-346/AC-6] workflow 1280x800→375x360 リサイズ中も開いたまま末尾到達・ヘッダー下+6px', async ({ page }) => {
  const a = ACTIONS[0]
  await openHarness(page, 1280, 800)
  await openAction(page, a)
  await page.setViewportSize({ width: 375, height: 360 })
  await settleAfterResize(page, a)
  await reachLast(page, a)
})
test('[REQ-346/AC-6] pill 375x667→600x400 開いたまま、800x400 で閉じる(640px境界)', async ({ page }) => {
  const a = ACTIONS[2]
  await openHarness(page, 375, 667)
  await openAction(page, a)
  await page.setViewportSize({ width: 600, height: 400 })
  await expect(page.locator(a.panel).first()).toBeVisible()
  await settleAfterResize(page, a)
  await page.setViewportSize({ width: 800, height: 400 })
  await expect(page.locator(a.panel)).toHaveCount(0)
})
test('[REQ-346/AC-6] future 1280x800→768x1024→375x360 連続リサイズで末尾到達・ヘッダー下+6px', async ({ page }) => {
  const a = ACTIONS[3]
  await openHarness(page, 1280, 800)
  await openAction(page, a)
  for (const v of [{ width: 768, height: 1024 }, { width: 375, height: 360 }]) {
    await page.setViewportSize(v)
    await settleAfterResize(page, a)
  }
  await reachLast(page, a)
})

test('[REQ-346/RedTeam] 幅320: 全アクションのパネルが左右 >= 0 かつ画面内', async ({ page }) => {
  for (const a of ACTIONS) {
    await openHarness(page, 320, 667)
    await openAction(page, a)
    const p = await box(page.locator(a.panel).first())
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.right).toBeLessThanOrEqual(320)
  }
})
test('[REQ-346/RedTeam] 高さ280: 全アクションで末尾到達', async ({ page }) => {
  for (const a of ACTIONS) {
    await openHarness(page, a.maxWidth ? 375 : 1280, 280)
    await openAction(page, a)
    await reachLast(page, a)
  }
})
test('[REQ-346/RedTeam] 連続トグル10回後にパネルは1つ以下', async ({ page }) => {
  for (const a of ACTIONS) {
    await openHarness(page, a.maxWidth ? 375 : 1280, 800)
    for (let i = 0; i < 10; i++) await page.locator(a.trigger).first().click()
    expect(await page.locator('[data-header-menu-panel]').count()).toBeLessThanOrEqual(1)
  }
})
test('[REQ-346/RedTeam] 別アクションを開くと前のアクションが閉じる', async ({ page }) => {
  const [workflow, kebab] = ACTIONS
  const future = ACTIONS[3]
  await openHarness(page, 1280, 800)
  await openAction(page, workflow)
  await openAction(page, future)
  await expect(page.locator(workflow.panel)).toHaveCount(0)
  await openAction(page, kebab)
  await expect(page.locator(future.panel)).toHaveCount(0)
})

// A4 (hover type) harness-level overlap check only; full A4 matrix is owned by T10.
for (const w of [639, 640, 768, 1024, 1280]) {
  test(`[REQ-346/AC-5] A4 hover overlap @${w}: resource-hover-card がヘッダー下+6pxに出て隠れない`, async ({ page }) => {
    await openHarness(page, w, 800)
    const card = page.getByTestId('resource-hover-card')
    await page.getByTestId('resource-hover-monitor').hover()
    if (w < 640) {
      await expect(card).toBeHidden()
      await expect(page.locator('[data-header-menu-bridge]')).toHaveCount(0)
      return
    }
    await expect(card).toBeVisible()
    const hb = await headerBottom(page)
    const c = await box(card)
    const vp = page.viewportSize()!
    expect(c.bottom).toBeGreaterThan(hb)
    expect(Math.abs(c.y - (hb + ANCHOR_GAP))).toBeLessThanOrEqual(1)
    expect(c.y).toBeGreaterThanOrEqual(0)
    expect(c.bottom).toBeLessThanOrEqual(vp.height)
    expect(await inside(page, '[data-testid="resource-hover-card"]', c.x + 10, c.y + 10)).toBe(true)
    expect(await inside(page, '[data-testid="resource-hover-card"]', c.x + c.width / 2, c.y + c.height / 2)).toBe(true)
  })
}
