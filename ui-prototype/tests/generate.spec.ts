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
    if (/\/api\/|\/health/.test(new URL(req.url()).pathname)) requests.push(req.url())
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
