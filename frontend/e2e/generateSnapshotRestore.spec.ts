import { test, expect, type Page } from '@playwright/test'

const stamp = '2026-01-01T00:00:00Z'
const WORKFLOW_LIST = [{ id: 1, name: 'W1', created_at: stamp }]
const WORKFLOW = {
  id: 1,
  name: 'W1',
  json_body: {
    '6': { class_type: 'CLIPTextEncode', inputs: { text: 'initial prompt' } },
  },
  mappings: [
    {
      id: 1,
      master_id: 1,
      node_id: '6',
      role: 'positive',
      param_name: 'text',
      input_type: 'textarea',
      display_name: 'Prompt',
    },
  ],
  target_base_model_id: null,
  created_at: stamp,
}

const MAPPING_MASTERS = [
  {
    id: 1,
    role: 'positive',
    param_name: 'text',
    input_type: 'textarea',
    display_name: 'Prompt',
    expected_class_types: ['CLIPTextEncode'],
    title_patterns: null,
    sort_order: 0,
  },
]

const VRAM = { vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 8, vram_total_gb: 12 }

const EMPTY_GEN_STATE = {
  version: 1,
  epoch: 'epoch-1',
  revision: 1,
  normal_group_id: 'normal-group-1',
  jobs: [],
  batches: [],
  upstream: { http_ready: true, ws_connected: true, failure_since: null },
}

const SNAPSHOT_SUMMARIES = [
  {
    id: 101,
    workflow_id: 1,
    image_path: '/view?filename=snap101.png',
    thumbnail_path: '/view?filename=snap101.png',
    params: { positive: 'masterpiece, 1girl, blue sky', steps: 28 },
    created_at: '2026-01-02T10:00:00Z',
  },
  {
    id: 102,
    workflow_id: 1,
    image_path: '/view?filename=snap102.png',
    thumbnail_path: '/view?filename=snap102.png',
    params: { positive: 'night city, neon lights', steps: 35 },
    created_at: '2026-01-03T12:00:00Z',
  },
]

const SNAPSHOT_DETAILS: Record<number, Record<string, unknown>> = {
  101: {
    ...SNAPSHOT_SUMMARIES[0],
    loras: [{ id: 1, lora_id: 11, strength: 0.8 }],
    tag_sets: [],
    lora_trigger_sets: [],
  },
  102: {
    ...SNAPSHOT_SUMMARIES[1],
    loras: [{ id: 2, lora_id: 12, strength: 0.7 }],
    tag_sets: [{ id: 1, tag_set_id: 21 }],
    lora_trigger_sets: [],
  },
}

async function stubApi(page: Page) {
  await page.routeWebSocket((url) => url.pathname === '/api/ws', () => {})

  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname.replace(/^\/api/, '')
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (req.method() !== 'GET') return json({})
    if (path === '/workflows') return json(WORKFLOW_LIST)
    if (path === '/workflows/1') return json(WORKFLOW)
    if (path === '/mapping-masters') return json(MAPPING_MASTERS)
    if (path === '/settings/vram') return json(VRAM)
    if (path === '/config') return json({ comfy_url: 'http://127.0.0.1:8188' })
    if (path === '/generation/state') return json(EMPTY_GEN_STATE)
    if (path === '/generation/upstream-queue') return json({ running: [], pending: [] })
    if (path === '/translate/dictionary') return json({ rules: [] })
    if (path === '/snapshots') return json(SNAPSHOT_SUMMARIES)
    const snapDetailMatch = path.match(/^\/snapshots\/(\d+)$/)
    if (snapDetailMatch) {
      const id = Number(snapDetailMatch[1])
      return json(SNAPSHOT_DETAILS[id] ?? SNAPSHOT_DETAILS[101])
    }
    if (path.startsWith('/comfy/object_info') || path.startsWith('/comfy/history')) return json({})
    if (path === '/comfy/queue') return json({ queue_running: [], queue_pending: [] })
    if (/\/(usages|status)$/.test(path) || /\/[0-9]+$/.test(path) || /settings|config|health/.test(path)) return json({})
    return json([])
  })

  await page.route((url) => url.pathname === '/view', async (route) => {
    const filename = new URL(route.request().url()).searchParams.get('filename') ?? 'snap.png'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="250"><rect width="200" height="250" fill="#1f2937"/><text x="16" y="40" fill="#fff" font-size="16">${filename}</text></svg>`
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg })
  })
}

async function openGenerate(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => {
    localStorage.clear()
    localStorage.setItem('prompt-surgeon-workflow-id', '1')
    localStorage.setItem('prompt-surgeon-client-id', 'test-session')
    try {
      indexedDB.deleteDatabase('REACT_QUERY_OFFLINE_CACHE')
    } catch {}
  })
  await stubApi(page)
  await page.goto('/')
  await expect(page.locator('#workflow-actions-btn')).toBeVisible()
}

test.describe('GeneratePage Snapshot Restore [REQ-265]', () => {
  test('[REQ-265/AC-5] Desktop: opens SnapshotRestoreModal from dedicated button and snapshot card, previews details, and restores preset', async ({
    page,
  }) => {
    await openGenerate(page, 1280, 800)

    // Expand the gallery drawer on desktop if collapsed
    const expandBtn = page.getByRole('button', { name: '履歴を展開' })
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
    }

    // Switch to snapshots tab
    await page.getByRole('button', { name: 'スナップショット (Snapshots)' }).click()

    // Dedicated button is visible and enabled
    const openBtn = page.locator('#open-snapshot-restore-btn')
    await expect(openBtn).toBeVisible()
    await expect(openBtn).toBeEnabled()

    // Open via dedicated button
    await openBtn.click()
    const dialog = page.getByRole('dialog', { name: 'スナップショットから復元' })
    await expect(dialog).toBeVisible()

    // Select snapshot #102 in modal grid and verify preview details
    await dialog.getByRole('button', { name: /night city, neon lights/ }).click()
    await expect(dialog.getByText('LoRA: 1件')).toBeVisible()
    await expect(dialog.getByText('TagSet: 1件')).toBeVisible()
    await expect(dialog.getByText('night city, neon lights').nth(1)).toBeVisible()

    // Restore to active preset
    await dialog.getByRole('button', { name: 'アクティブプリセットに復元' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('night city').first()).toBeVisible()

    // Clicking a snapshot card directly also opens preview modal with that snapshot selected (not silent overwrite)
    await page.getByRole('button', { name: /masterpiece, 1girl/ }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: /masterpiece, 1girl/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  test('[REQ-265/AC-6] Mobile (390x844): dedicated button fits without horizontal overflow and restores snapshot via sheet modal', async ({
    page,
  }) => {
    await openGenerate(page, 390, 844)

    // Switch to history section on mobile
    await page.getByRole('group', { name: '表示セクション' }).getByRole('button', { name: '履歴' }).click()

    // Switch to snapshots tab on mobile
    await page.getByRole('button', { name: 'スナップショット', exact: true }).click()

    const mobileBtn = page.locator('#open-snapshot-restore-btn-mobile')
    await expect(mobileBtn).toBeVisible()
    await expect(mobileBtn).toBeEnabled()

    // Verify no horizontal overflow at 390px width
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
    expect(hasOverflow).toBe(false)

    // Open modal, select snapshot #102, and restore
    await mobileBtn.click()
    const dialog = page.getByRole('dialog', { name: 'スナップショットから復元' })
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: /night city, neon lights/ }).click()
    await expect(dialog.getByText('LoRA: 1件')).toBeVisible()
    await expect(dialog.getByText('TagSet: 1件')).toBeVisible()

    await dialog.getByRole('button', { name: 'アクティブプリセットに復元' }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole('group', { name: '表示セクション' }).getByRole('button', { name: 'プロンプト' }).click()
    await expect(page.getByRole('region', { name: 'プロンプト' }).getByText('night city').first()).toBeVisible()
  })
})
