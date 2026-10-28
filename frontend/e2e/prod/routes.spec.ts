import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { installApiStub, type StubRequest } from './support/apiStub'
import { promptChipInput, promptRoot, switchPromptToTextMode } from './support/promptInput'

// Route-level acceptance on the production bundle (REQ-309 AC-5 / AC-6).
const LOG_DIR = path.resolve(process.cwd(), process.env.REQ309_LOG_DIR ?? '../docs/logs/REQ-309')
const CHUNK_MAP: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(LOG_DIR, 'candidate', 'chunk-report.json'), 'utf8'),
).map
const chunkFile = (src: string): string => path.basename(CHUNK_MAP[src])

type Route = 'generate' | 'studio' | 'loras' | 'tags' | 'history' | 'settings'

const ROUTE_PATH: Record<Route, string> = {
  generate: '/',
  studio: '/studio',
  loras: '/loras',
  tags: '/tags',
  history: '/history',
  settings: '/settings',
}

const NAV_ID: Record<Route, string> = {
  generate: '#nav-generate',
  studio: '#nav-studio',
  loras: '#nav-loras',
  tags: '#nav-tags',
  history: '#nav-history',
  settings: '#nav-settings',
}

/** Stable per-page marker taken from each page's top-level markup (see page JSX). */
function marker(page: Page, route: Route) {
  switch (route) {
    case 'generate':
      // Root marker (mode-independent): the chip input is absent once text mode is active.
      return promptRoot(page, 'desktop')
    case 'studio':
      return page.getByTestId('project-selector')
    case 'loras':
      return page.getByPlaceholder('Search LoRAs…')
    case 'tags':
      return page.getByPlaceholder('Search tags…')
    case 'history':
      return page.getByTestId('history-snapshot-count')
    case 'settings':
      return page.getByTestId('settings-workflows-grid')
  }
}

const SRC: Record<Route, string> = {
  generate: 'src/pages/GeneratePage.tsx',
  studio: 'src/pages/DatasetStudioPage/index.tsx',
  loras: 'src/pages/LoRAsPage.tsx',
  tags: 'src/pages/TagsPage.tsx',
  history: 'src/pages/HistoryPage.tsx',
  settings: 'src/pages/SettingsPage.tsx',
}

const annotate = (caseId: string, ac = 'REQ-309/AC-5') => [
  { type: 'ac', description: ac },
  { type: 'layer', description: 'e2e' },
  { type: 'caseId', description: caseId },
]


/** Opens the settings tab that contains the VRAM guard section so its number input is operable. */
async function expandVram(page: Page): Promise<Locator> {
  const input = page.locator('#vram-min-free-input')
  // VRAM guard lives in the 'システム・一般' settings tab; other tabs keep it hidden.
  if (!(await input.isVisible())) await page.locator('#settings-tab-system').click()
  await expect(input).toBeVisible()
  return input
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

for (const r of ['generate', 'studio', 'loras', 'tags', 'history', 'settings'] as Route[]) {
  test(`[REQ-309/AC-5] route-operable-${r}`, { annotation: annotate(`route-operable-${r}`, r === 'settings' ? 'REQ-309/AC-5' : 'REQ-309/AC-5') }, async ({ page }) => {
    await installApiStub(page)
    await page.goto(ROUTE_PATH[r])
    const m = marker(page, r)
    await expect(m.first()).toBeVisible()
    if (r === 'generate') {
      const chip = promptChipInput(page, 'desktop')
      await expect(chip).toBeEditable()
      await chip.fill('probe')
      await expect(chip).toHaveValue('probe')
    }
    if (r === 'loras') {
      await page.getByPlaceholder('Search LoRAs…').fill('abc')
      await expect(page.getByPlaceholder('Search LoRAs…')).toHaveValue('abc')
    }
    if (r === 'tags') {
      await page.getByPlaceholder('Search tags…').fill('abc')
      await expect(page.getByPlaceholder('Search tags…')).toHaveValue('abc')
    }
  })
}

test('[REQ-309/AC-5] history-items-browsable', { annotation: annotate('history-items-browsable') }, async ({ page }) => {
  const snapshot = {
    id: 501,
    workflow_id: 1,
    image_path: null,
    thumbnail_path: null,
    created_at: '2026-10-27T00:00:00Z',
  }
  const seen: StubRequest[] = []
  await installApiStub(page, {
    override: (req) => {
      if (req.method === 'GET' && req.path === '/snapshots') {
        seen.push(req)
        return { body: [snapshot] }
      }
      return undefined
    },
  })
  await page.goto('/')
  await page.locator(NAV_ID.history).click()
  await expect(page.getByTestId('history-snapshot-count')).toBeVisible()
  await expect(page.getByTestId('history-snapshot-count')).toContainText('1')
  expect(seen.length).toBeGreaterThan(0)
})

test('[REQ-309/AC-6] settings-items-browsable', { annotation: [...annotate('settings-items-browsable', 'REQ-309/AC-6'), { type: 'ac', description: 'REQ-309/AC-5' }] }, async ({ page }) => {
  await installApiStub(page, {
    override: (req) => {
      if (req.method === 'GET' && req.path === '/settings/vram') {
        return { body: { vram_min_free_gb: 7, vram_guard_enabled: true, vram_free_gb: 9, vram_total_gb: 12 } }
      }
      return undefined
    },
  })
  await page.goto('/')
  await page.locator(NAV_ID.settings).click()
  await expect(page.locator('#vram-min-free-input')).toHaveValue('7')
})

test('[REQ-309/AC-5] all-routes-tour-no-errors', { annotation: annotate('all-routes-tour-no-errors') }, async ({ page }, testInfo) => {
  await installApiStub(page)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
  })
  const chunkRequests = new Map<string, number>()
  page.on('request', (req) => {
    const p = new URL(req.url()).pathname
    if (/\/assets\/.+\.js$/.test(p)) chunkRequests.set(p, (chunkRequests.get(p) ?? 0) + 1)
  })

  await page.goto('/')
  const prompt = await switchPromptToTextMode(page, 'desktop')
  await prompt.fill('tour-keep')
  await expect(prompt).toHaveValue('tour-keep')
  await page.waitForTimeout(1500)
  for (const r of ['studio', 'loras', 'tags', 'history', 'settings', 'generate'] as Route[]) {
    await page.locator(NAV_ID[r]).click()
    await expect(marker(page, r).first()).toBeVisible()
  }
  // Out of scope: prompt retention across route round-trips (pre-existing baseline behavior; separate PBI candidate).
  // Only verify that the returned Generate page renders and remains operable.
  await expect(page.getByRole('heading', { name: 'システムエラーが発生しました', exact: true })).toHaveCount(0)
  // Text mode persists in the in-memory store across SPA navigation; the textarea must be operable.
  const returnedTextarea = promptRoot(page, 'desktop').locator('textarea')
  await expect(returnedTextarea).toBeEditable()
  // Observation only (no assertion): post-return initial value is attached for the record, read before fill.
  const observedInitial = await returnedTextarea.inputValue()
  await testInfo.attach('post-return-initial-prompt', { body: observedInitial, contentType: 'text/plain' })
  await returnedTextarea.fill('tour-after')
  await expect(returnedTextarea).toHaveValue('tour-after')
  expect(chunkRequests.size).toBeGreaterThanOrEqual(6)
  for (const [url, n] of chunkRequests) expect(n, `chunk requested more than once: ${url}`).toBe(1)
  expect(errors).toEqual([])
})

test('[REQ-309/AC-6] leave-guard-lazy-cancel', { annotation: annotate('leave-guard-lazy-cancel', 'REQ-309/AC-6') }, async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  const vram = { vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 6, vram_total_gb: 12 }
  await installApiStub(page, {
    override: async (req) => {
      if (req.method === 'GET' && req.path === '/settings/vram') return { body: vram }
      if (req.method === 'PUT' && req.path === '/settings/vram') {
        await gate
        return { body: { vram_min_free_gb: 9, vram_guard_enabled: true, vram_free_gb: 9, vram_total_gb: 12 } }
      }
      return undefined
    },
  })
  const historyChunk = chunkFile(SRC.history)
  let historyRequests = 0
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.endsWith(`/assets/${historyChunk}`)) historyRequests += 1
  })
  await page.goto('/settings')
  const input = await expandVram(page)
  await input.fill('9')
  await expect(page.getByText('未保存').first()).toBeVisible()
  await page.locator(NAV_ID.history).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'キャンセル' }).click()
  await expect(dialog).toHaveCount(0)
  expect(page.url()).toContain('/settings')
  await expect(input).toHaveValue('9')
  expect(historyRequests).toBe(0)
  release()
})

test('[REQ-309/AC-6] leave-guard-lazy-discard', { annotation: annotate('leave-guard-lazy-discard', 'REQ-309/AC-6') }, async ({ page }) => {
  await installApiStub(page, {
    override: (req) => {
      if (req.method === 'GET' && req.path === '/settings/vram') {
        return { body: { vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 6, vram_total_gb: 12 } }
      }
      if (req.method === 'PUT' && req.path === '/settings/vram') {
        return { status: 500, body: { detail: 'prod-measure failure' } }
      }
      return undefined
    },
  })
  const historyChunk = chunkFile(SRC.history)
  let historyRequests = 0
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.endsWith(`/assets/${historyChunk}`)) historyRequests += 1
  })
  await page.goto('/settings')
  const input = await expandVram(page)
  await input.fill('9')
  await expect(page.getByText('未保存').first()).toBeVisible()
  await page.locator(NAV_ID.history).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  expect(historyRequests).toBe(0)
  await dialog.getByRole('button', { name: '変更を破棄して移動' }).click()
  await expect(page.getByTestId('history-snapshot-count')).toBeVisible()
  expect(historyRequests).toBe(1)
  await sleep(0)
})
