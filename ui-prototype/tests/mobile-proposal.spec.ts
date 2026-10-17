import { test, expect } from '@playwright/test'

test('mobile proposal hides persistent preview and retains baseline', async ({ page }, info) => {
  test.skip(!info.project.name.includes('mobile'))
  await page.goto('/?ui=proposal')
  await expect(page.getByTestId('mobile-main-preview')).toBeHidden()
  await expect(page.getByTestId('mobile-action-bar')).toBeVisible()
  await page.goto('/?ui=baseline')
  await expect(page.getByTestId('mobile-main-preview')).toBeVisible()
})

test('mobile proposal history thumbnail opens sheet and full image', async ({ page }, info) => {
  test.skip(!info.project.name.includes('mobile'))
  await page.goto('/?ui=proposal')
  const historySwitch = page.locator('button[aria-controls="mobile-history-panel"]')
  await historySwitch.click()
  const thumb = page.locator('button[id^="thumb-mobile-"]:not([disabled])').first()
  if (await thumb.count() === 0) test.skip(true, 'Fixture has no usable history image')
  await thumb.click()
  const sheet = page.getByRole('dialog', { name: '画像プレビュー' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: '画像を全画面表示' }).click()
  await expect(page.getByRole('dialog', { name: '画像全画面表示' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('offline SVG fixture thumbnails are clickable without original check', async ({ page }, info) => {
  test.skip(!info.project.name.includes('mobile'))
  await page.goto('/?ui=proposal')
  await page.locator('button[aria-controls="mobile-history-panel"]').click()
  const thumb = page.locator('button[id^="thumb-mobile-"]').first()
  await expect(thumb).toBeVisible()
  await expect(thumb).toBeEnabled()
  await thumb.click()
  await expect(page.getByRole('dialog', { name: '画像プレビュー' })).toBeVisible()
})

test('history thumbnails allow native horizontal panning in proposal', async ({ page }, info) => {
  test.skip(!info.project.name.includes('mobile'))
  await page.goto('/?ui=proposal')
  await page.locator('button[aria-controls="mobile-history-panel"]').click()
  const rail = page.locator('#mobile-history-panel .overflow-x-auto').first()
  await expect(rail).toBeVisible()
  await expect(rail).toHaveCSS('touch-action', 'auto')
})

test('proposal mobile history uses three-column grid while baseline stays horizontal', async ({ page }, info) => {
  test.skip(!info.project.name.includes('mobile'))
  await page.goto('/?ui=proposal')
  await page.locator('button[aria-controls="mobile-history-panel"]').click()
  const gallery = page.locator('#mobile-history-panel .overflow-x-auto.custom-scrollbar').first()
  await expect(gallery).toHaveCSS('display', 'grid')
  await expect(gallery).toHaveCSS('grid-template-columns', /.+ .+ .+/)
  await page.goto('/?ui=baseline')
  await page.locator('button[aria-controls="mobile-history-panel"]').click()
  await expect(page.locator('#mobile-history-panel .overflow-x-auto.custom-scrollbar').first()).toHaveCSS('display', 'flex')
})

test('proposal mobile scroller fits available AppShell content height', async ({ page }, info) => {
  test.skip(!info.project.name.includes('mobile'))
  await page.goto('/?ui=proposal')
  const scroller = page.locator('main > div:has(> [data-testid="mobile-progress-line"])')
  await expect(scroller).toBeVisible()
  const metrics = await scroller.evaluate(el => {
    const main = el.parentElement!
    return {
      rootHeight: el.getBoundingClientRect().height,
      mainHeight: main.getBoundingClientRect().height,
      bottomPad: getComputedStyle(el).paddingBottom,
    }
  })
  expect(Math.abs(metrics.rootHeight - metrics.mainHeight)).toBeLessThanOrEqual(2)
  expect(metrics.bottomPad).toBe('72px')
})
