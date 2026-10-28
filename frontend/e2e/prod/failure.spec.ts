import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page, type Route as PwRoute } from '@playwright/test'
import { installApiStub } from './support/apiStub'
import { promptChipInput, promptRoot, switchPromptToTextMode } from './support/promptInput'

// Failure and recovery scenarios on the production bundle (REQ-309 AC-3 / AC-5).
const LOG_DIR = path.resolve(process.cwd(), process.env.REQ309_LOG_DIR ?? '../docs/logs/REQ-309')
const CHUNK_MAP: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(LOG_DIR, 'candidate', 'chunk-report.json'), 'utf8'),
).map
const chunkFile = (src: string): string => path.basename(CHUNK_MAP[src])
const CAND_DIST = path.resolve(process.cwd(), process.env.PROD_DIST_DIR ?? '../docs/logs/REQ-309/candidate/dist')
const STALE_DIST = path.resolve(process.cwd(), process.env.STALE_SWAP_DIR ?? '../docs/logs/REQ-309/baseline/dist')

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
const SRC: Record<Route, string> = {
  generate: 'src/pages/GeneratePage.tsx',
  studio: 'src/pages/DatasetStudioPage/index.tsx',
  loras: 'src/pages/LoRAsPage.tsx',
  tags: 'src/pages/TagsPage.tsx',
  history: 'src/pages/HistoryPage.tsx',
  settings: 'src/pages/SettingsPage.tsx',
}

function marker(page: Page, route: Route) {
  switch (route) {
    case 'generate':
      return promptChipInput(page, 'desktop')
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

const STAMP = '2026-10-27T00:00:00Z'
/** A select mapping makes ParamPanel render its bypass / param-sync sections. */
const CKPT_WORKFLOW = {
  id: 1,
  name: 'W1',
  created_at: STAMP,
  target_base_model_id: null,
  json_body: {
    '6': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
    '7': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'default.safetensors' } },
  },
  mappings: [
    { id: 1, master_id: 1, node_id: '6', role: 'positive', param_name: 'text', input_type: 'textarea', display_name: 'Prompt' },
    { id: 2, master_id: 2, node_id: '7', role: 'Checkpoint_Name', param_name: 'ckpt_name', input_type: 'select', display_name: 'Checkpoint' },
  ],
}

/** URL predicate for one emitted asset file name. */
const assetPredicate = (file: string) => (url: URL) => url.pathname.endsWith(`/assets/${file}`)

const annotate = (caseId: string, ac = 'REQ-309/AC-5') => [
  { type: 'ac', description: ac },
  { type: 'layer', description: 'e2e' },
  { type: 'caseId', description: caseId },
]

test.afterEach(async ({ request }) => {
  // Restore the candidate dist after the stale-swap case so that later specs see the candidate.
  await request.post('/__control/dist', { params: { dir: CAND_DIST } })
})

for (const r of ['generate', 'studio', 'loras', 'tags', 'history', 'settings'] as Route[]) {
  test(`[REQ-309/AC-5] route-chunk-abort-${r}`, { annotation: annotate(`route-chunk-abort-${r}`) }, async ({ page }) => {
    await installApiStub(page)
    // Generate's chunk is needed on first load, so enter from /studio and navigate to Generate.
    const start: Route = r === 'generate' ? 'studio' : 'generate'
    await page.goto(ROUTE_PATH[start])
    await expect(marker(page, start).first()).toBeVisible()

    const pred = assetPredicate(chunkFile(SRC[r]))
    const handler = (route: PwRoute) => route.abort()
    await page.route(pred, handler)
    await page.locator(NAV_ID[r]).click()
    await expect(page.getByText('システムエラーが発生しました')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ページを再読み込み' })).toBeVisible()

    await page.unroute(pred, handler)
    await page.reload()
    await expect(marker(page, r).first()).toBeVisible()
  })
}

test('[REQ-309/AC-5] navigate-while-chunk-delayed', { annotation: annotate('navigate-while-chunk-delayed') }, async ({ page }) => {
  await installApiStub(page)
  const pred = assetPredicate(chunkFile(SRC.history))
  const handler = async (route: PwRoute) => {
    await new Promise((res) => setTimeout(res, 1500))
    await route.continue()
  }
  await page.route(pred, handler)
  await page.goto('/')
  await expect(promptChipInput(page, 'desktop')).toBeEditable()
  await page.locator(NAV_ID.history).click()
  await page.locator(NAV_ID.loras).click()
  await expect(page.getByPlaceholder('Search LoRAs…')).toBeVisible()
  await page.waitForTimeout(2500)
  await expect(page.getByTestId('history-snapshot-count')).toHaveCount(0)
  await expect(page.getByPlaceholder('Search LoRAs…')).toBeVisible()
  await page.unroute(pred, handler)
})

for (const m of ['job-management', 'bypass-settings'] as const) {
  test(`[REQ-309/AC-3] modal-chunk-abort-${m}`, { annotation: annotate(`modal-chunk-abort-${m}`, 'REQ-309/AC-3') }, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    // A select mapping makes ParamPanel render its bypass section (the text-only stub does not).
    await installApiStub(page, m === 'bypass-settings' ? { workflow: CKPT_WORKFLOW } : undefined)
    await page.goto('/')
    const textarea = await switchPromptToTextMode(page, 'desktop')
    await textarea.fill('abort-keep')

    const src = m === 'job-management' ? 'src/components/JobManagementModal.tsx' : 'src/components/BypassSettingsModal.tsx'
    const trigger = m === 'job-management' ? page.locator('#queue-open-btn') : page.locator('#bypass-settings-btn')
    const pred = assetPredicate(chunkFile(src))
    const handler = (route: PwRoute) => route.abort()
    await page.route(pred, handler)

    await trigger.click()
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('読み込めませんでした')
    await expect(promptRoot(page, 'desktop').locator('textarea')).toHaveValue('abort-keep')
    await expect(page.locator('#generate-btn')).toBeVisible()

    await alert.getByRole('button', { name: '閉じる' }).click()
    await expect(alert).toHaveCount(0)

    await trigger.click()
    await expect(page.getByRole('alert')).toContainText('読み込めませんでした')

    await page.unroute(pred, handler)
  })
}

test('[REQ-309/AC-5] stale-chunk-after-redeploy', { annotation: annotate('stale-chunk-after-redeploy') }, async ({ page }) => {
  await installApiStub(page)
  await page.goto('/')
  await expect(promptChipInput(page, 'desktop')).toBeEditable()

  let mainNavigations = 0
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) mainNavigations += 1
  })
  const swap = await page.request.post('/__control/dist', { params: { dir: STALE_DIST } })
  expect(swap.status()).toBe(200)

  await page.locator(NAV_ID.history).click()
  await expect(page.getByText('システムエラーが発生しました')).toBeVisible({ timeout: 15_000 })
  const before = mainNavigations
  await page.waitForTimeout(3000)
  expect(mainNavigations).toBe(before)

  await page.reload()
  await expect(page.getByTestId('history-snapshot-count')).toBeVisible()
})
