import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

test('tablet before/after comparison, same fixture and viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-tablet', '768px comparison')
  const results: Record<string, unknown> = {}
  for (const variant of ['baseline', 'proposal'] as const) {
    await page.goto('/?ui=' + variant)
    await expect(page.locator('body')).toContainText('UI review / Sample SDXL')
    const data = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-page-header-root]')
      const anima = document.querySelector<HTMLElement>('label:has(#anima-mode-toggle)')
      const monitor = document.querySelector<HTMLElement>('[data-testid="resource-hover-monitor"]')
      const undo = document.querySelector<HTMLElement>('#header-undo-btn')
      const redo = document.querySelector<HTMLElement>('#header-redo-btn')
      const rect = (el: HTMLElement | null) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
      }
      const overlap = (a: HTMLElement | null, b: HTMLElement | null) => {
        if (!a || !b) return null
        const x = a.getBoundingClientRect(), y = b.getBoundingClientRect()
        return Math.max(0, Math.min(x.right, y.right) - Math.max(x.left, y.left)) *
          Math.max(0, Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top))
      }
      return { variant: document.documentElement.dataset.prototypeVariant, header: rect(root),
        anima: rect(anima), monitor: rect(monitor), undo: rect(undo), redo: rect(redo),
        overlapAnimaMonitorPx2: overlap(anima, monitor), overlapUndoMonitorPx2: overlap(undo, monitor),
        overlapRedoMonitorPx2: overlap(redo, monitor) }
    })
    results[variant] = data
    await page.screenshot({ path: testInfo.outputPath('tablet-' + variant + '.png'), fullPage: false })
  }
  const file = testInfo.outputPath('tablet-comparison.json')
  await writeFile(file, JSON.stringify(results, null, 2))
  await testInfo.attach('tablet-comparison.json', { path: file, contentType: 'application/json' })
  const proposal = results.proposal as { overlapAnimaMonitorPx2: number | null; overlapUndoMonitorPx2: number | null; overlapRedoMonitorPx2: number | null }
  expect(proposal.overlapAnimaMonitorPx2).toBe(0)
  expect(proposal.overlapUndoMonitorPx2).toBe(0)
  expect(proposal.overlapRedoMonitorPx2).toBe(0)
})
