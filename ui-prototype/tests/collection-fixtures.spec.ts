import { test, expect } from '@playwright/test'

for (const entry of [{ route: '/loras', card: '[id^="lora-card-"]', title: 'LoRAs' }, { route: '/tags', card: '[id^="tagset-card-"]', title: 'Tag Sets' }]) {
  test(entry.title + ' collection fixture displays multiple scroll rows on mobile', async ({ page }, info) => {
    test.skip(!info.project.name.includes('mobile'))
    await page.goto(entry.route + '?ui=baseline')
    await expect(page.locator(entry.card).first()).toBeVisible()
    expect(await page.locator(entry.card).count()).toBeGreaterThanOrEqual(12)
    const scroll = page.locator('.overflow-y-auto.custom-scrollbar').last()
    const metrics = await scroll.evaluate(el => ({ total: el.scrollHeight, view: el.clientHeight }))
    expect(metrics.total).toBeGreaterThan(metrics.view)
    await scroll.evaluate(el => { el.scrollTop = el.scrollHeight })
    await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  })
}
