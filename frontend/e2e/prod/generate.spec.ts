import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { installApiStub, type StubRequest } from './support/apiStub'
import { promptChipInput, promptRoot, switchPromptToTextMode, type Vp } from './support/promptInput'

// Generate page behaviour on the production bundle (REQ-309 AC-3 / AC-4).
const LOG_DIR = path.resolve(process.cwd(), process.env.REQ309_LOG_DIR ?? '../docs/logs/REQ-309')
const CHUNK_MAP: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(LOG_DIR, 'candidate', 'chunk-report.json'), 'utf8'),
).map
const chunkName = (src: string): string => path.basename(CHUNK_MAP[src])

const VIEWPORTS: Record<Vp, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 667 },
}

const STAMP = '2026-10-27T00:00:00Z'

/** A select mapping makes ParamPanel render its bypass / param-sync sections (the text-only stub does not). */
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

const annotate = (caseId: string) => [
  { type: 'ac', description: 'REQ-309/AC-3' },
  { type: 'layer', description: 'e2e' },
  { type: 'caseId', description: caseId },
]

/** Counts requests for a given chunk file name (path suffix match on the emitted asset). */
function chunkCounter(page: Page, file: string): { count: () => number } {
  let n = 0
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.endsWith(`/assets/${file}`)) n += 1
  })
  return { count: () => n }
}

async function closeModal(page: Page, body: Locator): Promise<void> {
  await page.keyboard.press('Escape')
  if (await body.first().waitFor({ state: 'hidden', timeout: 1500 }).then(() => true).catch(() => false)) return
  // Fallback: the modal's own 閉じる control (scoped to the dialog when one exists).
  const dialogClose = page.getByRole('dialog').getByRole('button', { name: '閉じる' })
  if (await dialogClose.count()) await dialogClose.first().click()
  else await page.getByRole('button', { name: '閉じる' }).last().click()
}

const MODALS: Array<{
  name: string
  src: string
  mode: 'latch' | 'while-open'
  open: (page: Page) => Promise<void>
  /** Visible content marker of the open modal. */
  content: (page: Page) => Locator
  workflow?: unknown
  /** Close affordance when Escape / the modal's 閉じる control do not apply (overlay click for preset manager). */
  close?: (page: Page) => Promise<void>
}> = [
  {
    name: 'job-management',
    src: 'src/components/JobManagementModal.tsx',
    mode: 'latch',
    open: async (page) => page.locator('#queue-open-btn').click(),
    content: (p) => p.getByText(/ジョブ管理/),
  },
  {
    name: 'prompt-translation',
    src: 'src/pages/GeneratePage/components/PromptTranslationModal.tsx',
    mode: 'latch',
    open: async (page) => page.getByRole('button', { name: '翻訳' }).first().click(),
    content: (p) => p.getByText(/プロンプト翻訳/),
  },
  {
    name: 'preset-manager',
    src: 'src/components/PresetManagerPanel.tsx',
    mode: 'while-open',
    open: async (page) => page.locator('#manage-presets-btn').click(),
    content: (p) => p.getByTestId('preset-manager-modal'),
    close: async (page) => page.getByTestId('preset-manager-overlay').click({ position: { x: 5, y: 5 } }),
  },
  {
    name: 'bypass-settings',
    src: 'src/components/BypassSettingsModal.tsx',
    mode: 'while-open',
    open: async (page) => page.locator('#bypass-settings-btn').click(),
    content: (p) => p.getByText(/Bypass Settings/),
    workflow: CKPT_WORKFLOW,
  },
  {
    name: 'param-sync',
    src: 'src/components/ParamSyncModal.tsx',
    mode: 'while-open',
    open: async (page) => page.locator('#param-sync-settings-btn').click(),
    content: (p) => p.getByText(/Parameter Sync Settings/),
    workflow: CKPT_WORKFLOW,
  },
  {
    name: 'save-as-tag-set',
    src: 'src/pages/GeneratePage/components/SaveAsTagSetModal.tsx',
    mode: 'while-open',
    open: async (page) => {
      // The text mode persists after the first open; switch only when the textarea is not yet shown.
      if (!(await promptRoot(page, 'desktop').locator('textarea').count())) await switchPromptToTextMode(page, 'desktop')
      await promptRoot(page, 'desktop').locator('textarea').fill('tag-seed')
      await page.getByRole('button', { name: /クリップボード・履歴メニュー/ }).first().click()
      await page.getByRole('button', { name: 'タグセットとして保存' }).click()
    },
    content: (p) => p.getByText(/タグセットとして保存/),
  },
]

for (const vp of ['desktop', 'mobile'] as Vp[]) {
  test(`[REQ-309/AC-3] prompt-edit-keeps-value-${vp}`, { annotation: annotate(`prompt-edit-keeps-value-${vp}`) }, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[vp])
    await installApiStub(page)
    await page.goto('/')
    await expect(promptChipInput(page, vp)).toBeEditable()
    const textarea = await switchPromptToTextMode(page, vp)
    await textarea.fill('値保持テスト')
    await expect(textarea).toHaveValue('値保持テスト')
    await expect(promptRoot(page, vp).locator('textarea')).toHaveValue('値保持テスト')
  })
}

test('[REQ-309/AC-4] checkpoint-select-and-generate', { annotation: [
  { type: 'ac', description: 'REQ-309/AC-4' },
  { type: 'layer', description: 'e2e' },
  { type: 'caseId', description: 'checkpoint-select-and-generate' },
] }, async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  const lora = (id: number, name: string) => ({
    id,
    model_name: name,
    description: name,
    recommended_strength_min: null,
    recommended_strength_max: null,
    category_id: null,
    thumbnail_path: null,
    file_path: null,
    trigger_word_sets: [],
  })
  const posted: StubRequest[] = []
  await installApiStub(page, {
    workflow: CKPT_WORKFLOW,
    override: (req: StubRequest) => {
      if (req.method === 'GET' && req.path === '/loras') {
        return { body: [lora(1, 'lora-a.safetensors'), lora(2, 'lora-b.safetensors')] }
      }
      if (req.method === 'POST' && req.path === '/generation/batches') {
        posted.push(req)
        return { body: { batch_id: 'b-prod-1', job_ids: [], epoch: 'prod-measure', revision: 2 } }
      }
      return undefined
    },
  })
  await page.goto('/')
  await expect(promptChipInput(page, 'desktop')).toBeEditable()
  await page.getByRole('button', { name: 'Select option…' }).first().click()
  await page.getByPlaceholder('Search by name, desc, path...').fill('lora-b')
  await page.getByRole('button', { name: /lora-b\.safetensors/ }).first().click()
  await page.locator('#generate-btn').click()
  await expect.poll(() => posted.length).toBeGreaterThan(0)
  expect(JSON.stringify(posted[0].body)).toContain('lora-b.safetensors')
})

for (const m of MODALS) {
  test(`[REQ-309/AC-3] modals-open-close-reopen-${m.name}`, { annotation: annotate(`modals-open-close-reopen-${m.name}`) }, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop)
    await installApiStub(page, m.workflow ? { workflow: m.workflow } : undefined)
    const counter = chunkCounter(page, chunkName(m.src))
    await page.goto('/')
    await expect(promptChipInput(page, 'desktop')).toBeEditable()
    expect(counter.count()).toBe(0)

    await m.open(page)
    await expect.poll(() => counter.count()).toBe(1)
    await expect(m.content(page).first()).toBeVisible()

    if (m.close) await m.close(page)
    else await closeModal(page, m.content(page))
    await expect(m.content(page).first()).toBeHidden()

    await m.open(page)
    await expect(m.content(page).first()).toBeVisible()
    expect(counter.count()).toBe(1)
  })
}

test('[REQ-309/AC-3] viewport-switch-keeps-prompt-and-modals', { annotation: annotate('viewport-switch-keeps-prompt-and-modals') }, async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await installApiStub(page)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  const textarea = await switchPromptToTextMode(page, 'desktop')
  await textarea.fill('幅切替保持')
  await page.locator('#manage-presets-btn').click()
  await expect(page.getByTestId('preset-manager-modal')).toBeVisible()

  await page.setViewportSize({ width: 700, height: 800 })
  await expect(promptRoot(page, 'mobile')).toBeVisible()
  await expect(promptRoot(page, 'mobile').locator('textarea')).toHaveValue('幅切替保持')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByTestId('preset-manager-modal')).toBeVisible()
  expect(errors).toEqual([])
})
