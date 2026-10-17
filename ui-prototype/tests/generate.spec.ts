import { test, expect } from '@playwright/test'

test('Generate baseline renders and saves a screenshot', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByText('Generate').first()).toBeVisible({ timeout: 20000 })
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
  await expect(page.getByText('Generate').first()).toBeVisible({ timeout: 20000 })
  expect(requests).toEqual([])
})

test('body does not overflow horizontally', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Generate').first()).toBeVisible({ timeout: 20000 })
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1)
})

test('frontend Tailwind theme is applied', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Generate').first()).toBeVisible({ timeout: 20000 })
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
