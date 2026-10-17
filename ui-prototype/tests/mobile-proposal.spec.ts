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
