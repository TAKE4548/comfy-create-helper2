import { test, expect } from '@playwright/test'

test('Generate baseline renders and saves a screenshot', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('body')).toContainText('UI review / Sample SDXL', { timeout: 20000 })
  await expect(page.locator('body')).toContainText('UI review / Sample SDXL', { timeout: 20000 })
  await page.screenshot({ path: testInfo.outputPath('generate-baseline.png'), fullPage: true })
  await testInfo.attach('generate-baseline', { path: testInfo.outputPath('generate-baseline.png'), contentType: 'image/png' })
  expect(errors).toEqual([])
})

test('offline prototype never reaches live API services', async ({ page }) => {
  const requests: string[] = []
  page.on('request', req => {
    const pathname = new URL(req.url()).pathname
    if (pathname === '/api' || pathname.startsWith('/api/') || pathname === '/health') requests.push(req.url())
  })
  await page.goto('/')
  await expect(page.locator('body')).toContainText('UI review / Sample SDXL', { timeout: 20000 })
  expect(requests).toEqual([])
})

test('body does not overflow horizontally', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toContainText('UI review / Sample SDXL', { timeout: 20000 })
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1)
})

test('frontend Tailwind theme is applied', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toContainText('UI review / Sample SDXL', { timeout: 20000 })
  const appearance = await page.locator('body').evaluate(el => ({
    background: getComputedStyle(el).backgroundColor,
    color: getComputedStyle(el).color,
  }))
  expect(appearance.background).toBe('rgb(9, 9, 11)')
  expect(appearance.color).toBe('rgb(212, 212, 216)')
})

test('layout utility classes from frontend are generated', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(() => {
    const element = document.createElement('div')
    element.className = 'flex p-4'
    document.body.appendChild(element)
    const style = getComputedStyle(element)
    const value = { display: style.display, padding: style.paddingTop }
    element.remove()
    return value
  })
  expect(result).toEqual({ display: 'flex', padding: '16px' })
})

test('offline preset CRUD works without network writes', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const route = '/api/workflow-presets'
    const create = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'UI test preset', workflow_id: 91001, param_values: {} }) })
    const item = await create.json()
    const list = await (await fetch(route + '?workflow_id=91001')).json()
    const update = await fetch(route + '/' + item.id, { method: 'PUT',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Renamed' }) })
    const renamed = await update.json()
    const deleted = await fetch(route + '/' + item.id, { method: 'DELETE' })
    const remaining = await (await fetch(route)).json()
    const forbidden = await fetch('/api/workflows', { method: 'POST', body: '{}' })
    return { created: create.status, listed: list.some((p: { id: number }) => p.id === item.id),
      name: renamed.name, deleted: deleted.status, removed: !remaining.some((p: { id: number }) => p.id === item.id),
      forbidden: forbidden.status }
  })
  expect(result).toEqual({ created: 201, listed: true, name: 'Renamed',
    deleted: 200, removed: true, forbidden: 403 })
})

test('resource monitor displays deterministic offline hardware metrics on desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Desktop chip layout only')
  await page.goto('/')
  const monitor = page.getByTestId('resource-hover-monitor')
  await expect(monitor).toBeVisible()
  await expect(monitor).toContainText('CPU 23%')
  await expect(monitor).toContainText('RAM 29%')
  await expect(monitor).toContainText('GPU 37%')
  await expect(monitor).toContainText('VRAM 38%')
  await monitor.hover()
  await expect(page.getByTestId('resource-hover-card')).toBeVisible()
  await expect(page.getByTestId('resource-hover-card')).toContainText('9.2 / 24.0 GB')
})


test('Generate proposal uses a continuous latest-first horizontal reel', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Desktop Generate proposal only')
  await page.goto('/?ui=proposal')
  await expect(page.locator('body')).toContainText('UI review / Sample SDXL', { timeout: 20000 })

  const reel = page.locator('[data-generate-reel-proposal="true"]')
  await expect(reel).toBeVisible()
  await expect(reel.locator('[data-generate-reel-tile="true"]')).toHaveCount(12)
  await expect(reel.locator('[data-generate-reel-tile="true"]').first()).toContainText('LATEST')

  const initial = await reel.evaluate((el) => ({ left: el.scrollLeft, width: el.scrollWidth, client: el.clientWidth }))
  expect(initial.left).toBe(0)
  expect(initial.width).toBeGreaterThan(initial.client)

  await reel.hover()
  await page.mouse.wheel(0, 700)
  await expect.poll(() => reel.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50)

  const latest = page.locator('[data-generate-reel-latest="true"]')
  await expect(latest).toBeVisible()
  await latest.click()
  await expect.poll(() => reel.evaluate((el) => el.scrollLeft)).toBeLessThan(8)

  const toggle = page.locator('[data-generate-reel-history-toggle="true"]')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('[data-generate-reel-history-pane="true"]')).toBeVisible()

  await page.screenshot({ path: testInfo.outputPath('generate-reel-proposal.png'), fullPage: true })
  await testInfo.attach('generate-reel-proposal', {
    path: testInfo.outputPath('generate-reel-proposal.png'),
    contentType: 'image/png',
  })
})
