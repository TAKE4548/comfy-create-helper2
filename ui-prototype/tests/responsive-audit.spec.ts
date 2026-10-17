import { writeFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

test('mobile fixed actions and scroll-end reachability audit', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile', '375px mobile audit')
  await page.goto('/')
  await expect(page.locator('body')).toContainText('UI review / Sample SDXL')
  const result = await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>('.overflow-y-auto.overscroll-contain')
    const action = [...document.querySelectorAll<HTMLElement>('button')].find(el =>
      el.textContent?.includes('Generate Batch') && getComputedStyle(el).display !== 'none')
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Mobile navigation"]')
    const inspect = (el: HTMLElement | null) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { text: el.textContent?.trim().slice(0, 70), top: r.top, bottom: r.bottom, height: r.height,
        visible: r.width > 0 && r.height > 0 }
    }
    if (scroll) scroll.scrollTop = scroll.scrollHeight
    const scrollAtEnd = scroll ? Math.abs(scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop) <= 2 : false
    const allFocusable = scroll ? [...scroll.querySelectorAll<HTMLElement>('button, input, textarea, [tabindex="0"]')]
      .filter(el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0) : []
    const finalFocusable = allFocusable.at(-1) ?? null
    const finalRect = finalFocusable?.getBoundingClientRect() ?? null
    const actionBar = action?.closest<HTMLElement>('.fixed') ?? null
    const actionRect = actionBar?.getBoundingClientRect() ?? null
    const navRect = nav?.getBoundingClientRect() ?? null
    return {
      viewport: { width: innerWidth, height: innerHeight }, scrollPresent: !!scroll, scrollAtEnd,
      scroll: scroll && { clientHeight: scroll.clientHeight, scrollHeight: scroll.scrollHeight, scrollTop: scroll.scrollTop },
      finalFocusable: inspect(finalFocusable), action: inspect(action), actionBar: inspect(actionBar), nav: inspect(nav),
      lastControlOverlapsBar: !!finalRect && !!actionRect && finalRect.bottom > actionRect.top && finalRect.top < actionRect.bottom,
      barOverlapsNav: !!actionRect && !!navRect && actionRect.bottom > navRect.top,
    }
  })
  const mobileJson = testInfo.outputPath('mobile-reachability.json')
  await writeFile(mobileJson, JSON.stringify(result, null, 2))
  await testInfo.attach('mobile-reachability.json', { path: mobileJson, contentType: 'application/json' })
  await page.screenshot({ path: testInfo.outputPath('mobile-scroll-end.png'), fullPage: false })
  expect(result.scrollPresent).toBe(true)
  expect(result.scrollAtEnd).toBe(true)
})

test('tablet header width and wrapping audit', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-tablet', '768px tablet audit')
  await page.goto('/')
  await expect(page.locator('body')).toContainText('UI review / Sample SDXL')
  const result = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-page-header-root]')
    if (!root) return null
    const rootRect = root.getBoundingClientRect()
    const elements = [...root.querySelectorAll<HTMLElement>('button, label, h1, [data-testid="resource-hover-monitor"]')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
      .map(el => { const r = el.getBoundingClientRect(); return {
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 65),
        tag: el.tagName, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width,
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      } })
    return { header: { left: rootRect.left, right: rootRect.right, width: rootRect.width,
      scrollWidth: root.scrollWidth, clientWidth: root.clientWidth }, elements }
  })
  const tabletJson = testInfo.outputPath('tablet-header.json')
  await writeFile(tabletJson, JSON.stringify(result, null, 2))
  await testInfo.attach('tablet-header.json', { path: tabletJson, contentType: 'application/json' })
  await page.screenshot({ path: testInfo.outputPath('tablet-header.png'), fullPage: false })
  expect(result).not.toBeNull()
})
