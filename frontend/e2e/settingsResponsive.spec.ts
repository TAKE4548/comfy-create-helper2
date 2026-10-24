import { test, expect, type Page, type Locator } from '@playwright/test';
import type { MappingMasterV2 } from '../src/api/types';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';

const MASTERS = [
  {
    id: 1, group_id: null, base_key: 'positive_prompt',
    name: 'とても長い表示名のマッピングマスタ（ポジティブプロンプト入力用ノード）',
    param_name: 'text', input_type: 'textarea',
    expected_class_types: ['CLIPTextEncode', 'CLIPTextEncodeSDXL', 'ShowText'],
    base_title_patterns: ['positive'], sort_order: 1, variants: [],
  },
  {
    id: 2, group_id: null, base_key: 'seed', name: 'Seed', param_name: 'seed', input_type: 'int',
    expected_class_types: ['KSampler'], base_title_patterns: null, sort_order: 2,
    variants: [
      { id: 21, master_id: 2, stage_id: 1, stage_key: 'main', stage_name: 'Main',
        stage_suffix: '', custom_role_override: null, computed_role: 'seed', extra_title_patterns: null, is_enabled: true },
      { id: 22, master_id: 2, stage_id: 2, stage_key: 'upscaler', stage_name: 'Upscaler',
        stage_suffix: '_upscale', custom_role_override: null, computed_role: 'seed_upscale', extra_title_patterns: null, is_enabled: true },
    ],
  },
  {
    id: 3, group_id: null, base_key: 'steps', name: 'Steps', param_name: 'steps', input_type: 'int',
    expected_class_types: ['KSampler'], base_title_patterns: null, sort_order: 3, variants: [],
  },
] satisfies MappingMasterV2[];
const MASTER_CARD = '.settings-mobile-card:has(.settings-mobile-card__target-node)';
const VRAM = { vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 8, vram_total_gb: 12 };
const SETTINGS_STAMP = '2026-01-01T00:00:00Z';
const SETTINGS_PARAMS = { temperature: 0.2, top_p: 1, max_tokens: 1000, presence_penalty: 0, frequency_penalty: 0 };
const SETTINGS_PARAM_KEYS = ['llm_params_audit', 'llm_params_scene_generate', 'llm_params_translation', 'llm_params_speech_draft'];
const SETTINGS_PROMPT_KEYS = ['audit_interference', 'audit_interference_anima', 'audit_vocabulary', 'audit_physical', 'scene_generate', 'scene_generate_anima', 'translation_ja_to_en', 'translation_en_to_ja', 'speech_draft_vlm_prompt', 'speech_draft_llm_prompt', 'speech_rewrite_system_prompt'];
const SETTINGS_KEYS: Record<string, string> = {
  bubble_detection_params: JSON.stringify({ min_area: 1000, min_brightness: 150 }),
  translation_provider: 'fugumt', translation_debounce: '500', translation_api_key: '', translation_api_url: '',
  translation_model: 'test-model', speech_draft_vlm_model: 'test-model', speech_draft_llm_model: 'test-model',
};
const SETTINGS_TONE = { id: 17, name: '丁寧', prompt: '丁寧に話す', description: '説明', sort_order: 2, created_at: SETTINGS_STAMP };
const SETTINGS_WORKFLOW = { id: 1, name: 'wf-e2e', created_at: SETTINGS_STAMP,
  json_body: { nodes: { '1': { class_type: 'KSampler', inputs: { seed: 1 } } } }, mappings: [],
  target_base_model_id: null, default_applied_assets: null };
let managerProcess: ChildProcessWithoutNullStreams;
let managerUrl = '';
let managerControlUrl = '';
let managerOutput = '';

async function startManagerSandbox(): Promise<void> {
  managerProcess = spawn(resolve(process.cwd(), '../backend/.venv/Scripts/python.exe'),
    [resolve(process.cwd(), '../tests/support/server_manager_sandbox.py')],
    { cwd: resolve(process.cwd(), '..'), stdio: 'pipe' });
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`Manager sandbox startup timed out: ${managerOutput}`)), 10000);
    managerProcess.stdout.on('data', (chunk: Buffer) => {
      managerOutput += chunk.toString('utf8');
      const line = managerOutput.split(/\r?\n/)[0];
      if (line.startsWith('{')) {
        clearTimeout(timer);
        try {
          const value = JSON.parse(line) as { manager_url: string; control_url: string };
          managerUrl = value.manager_url;
          managerControlUrl = value.control_url;
          resolveReady();
        } catch (error) { reject(error); }
      }
    });
    managerProcess.stderr.on('data', (chunk: Buffer) => { managerOutput += chunk.toString('utf8'); });
    managerProcess.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Manager sandbox exited before startup (${code}): ${managerOutput}`));
    });
  });
}

async function setManagerState(value: object): Promise<void> {
  const response = await fetch(`${managerControlUrl}/control/state`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error(`Manager sandbox state returned ${response.status}`);
}

// Stub only backend API calls (pathname starts with /api/); never Vite module requests like /src/api/*.
async function stubApi(page: Page): Promise<void> {
  const keys = { ...SETTINGS_KEYS };
  const prompts = new Map<string, string>([
    ...SETTINGS_PARAM_KEYS.map((key) => [key, JSON.stringify(SETTINGS_PARAMS)] as [string, string]),
    ...SETTINGS_PROMPT_KEYS.map((key) => [key, '基準プロンプト'] as [string, string]),
    ...Object.entries(keys),
    ['current-model', 'test-model'],
  ]);
  const llmPrompt = (key: string, content: string) => ({ id: SETTINGS_PROMPT_KEYS.indexOf(key) + 1, key, content, description: null, updated_at: SETTINGS_STAMP });
  const llmRecords = () => [...prompts.entries()].map(([key, content]) => llmPrompt(key, content));
  let workflow = SETTINGS_WORKFLOW;
  const tone = { ...SETTINGS_TONE };
  const putRequests: Array<{ path: string; body: unknown }> = [];
  (page as Page & { __settingsPutRequests?: typeof putRequests }).__settingsPutRequests = putRequests;
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();
    const payload = method === 'GET' ? undefined : req.postDataJSON();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'PUT' || method === 'POST') putRequests.push({ path, body: payload });
    if (path === '/llm-prompts' && method === 'GET') return json(llmRecords());
    if (path === '/llm-prompts/models' && method === 'GET') return json(['test-model']);
    if (path === '/llm-prompts/current-model' && method === 'GET') return json(llmPrompt('current-model', prompts.get('current-model')!));
    if (path === '/llm-prompts/current-model' && method === 'PUT') {
      const model = (payload as { model: string }).model;
      prompts.set('current-model', model);
      return json(llmPrompt('current-model', model));
    }
    const promptMatch = path.match(/^\/llm-prompts\/([^/]+)$/);
    if (promptMatch && method === 'PUT') {
      const key = decodeURIComponent(promptMatch[1]);
      const content = (payload as { content: string }).content;
      prompts.set(key, content);
      return json(llmPrompt(key, content));
    }
    if (path === '/settings/vram' && method === 'PUT') return json({ ...VRAM, ...(payload as object) });
    if (path === '/settings/vram' && method === 'GET') return json(VRAM);
    if (path === '/speech-tone-presets' && method === 'GET') return json([tone]);
    if (path === '/speech-tone-presets' && method === 'POST') return json({ ...tone, ...(payload as object), id: 18 });
    if (path === '/speech-tone-presets/17' && method === 'PUT') return json({ ...tone, ...(payload as object) });
    if (path === '/workflows' && method === 'GET') return json([{ id: 1, name: 'wf-e2e', created_at: SETTINGS_STAMP }]);
    if (path === '/workflows/1' && method === 'GET') return json(workflow);
    if (path === '/workflows/1' && method === 'PUT') { workflow = { ...workflow, ...(payload as object) }; return json(workflow); }
    if (method !== 'GET') return json({});
    if (path === '/mapping-masters') return json(MASTERS);
    if (path === '/translate/dictionary') return json({ rules: [] });
    if (path === '/snapshots') return json([]);
    if (path === '/translate/stats') return json({ cached_entries_count: 0 });
    if (/\/speech-tone-presets$/.test(path)) return json([tone]);
    if (/\/stage-masters$|\/base-models$/.test(path)) return json([]);
    if (/\/(usages|status)$/.test(path) || /\/[0-9]+$/.test(path) || /settings|config|health/.test(path)) return json({});
    return json([]);
  });
}

async function openSettings(page: Page, width: number, height = 900, hash = 'workflows'): Promise<void> {
  await stubApi(page);
  await page.setViewportSize({ width, height });
  await page.goto(`/settings#${hash}`);
  await expect(page.locator(`#settings-panel-${hash}`)).toBeVisible();
}

test.beforeAll(async () => { await startManagerSandbox(); });
test.afterAll(async () => {
  if (managerProcess && managerProcess.exitCode === null) {
    await fetch(`${managerControlUrl}/control/shutdown`, { method: 'POST', body: '{}' });
    await new Promise<void>((resolveExit) => managerProcess.once('exit', () => resolveExit()));
  }
});

async function box(loc: Locator) {
  await expect(loc).toBeVisible();
  const b = await loc.boundingBox();
  if (!b) throw new Error('no boundingBox');
  return b;
}

test.describe('Settings responsive E2E', () => {
  test('[REQ-365/AC-1] 1280px: dual pane', async ({ page }) => {
    await openSettings(page, 1280);
    // Wait for deterministic readiness (mapping master rows rendered) and for the layout to stop moving,
    // reading all three rects in one atomic evaluate so cards cannot be measured at different load phases.
    await expect(page.getByTestId('settings-card-mapping').getByText('Seed').first()).toBeVisible();
    const rects = () => page.evaluate(() => {
      const r = (id: string) => {
        const b = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
        return { x: b.x, y: b.y + window.scrollY, width: b.width, height: b.height };
      };
      return { wf: r('settings-card-workflow'), bm: r('settings-card-basemodel'), mp: r('settings-card-mapping') };
    });
    let prev = JSON.stringify(await rects());
    await expect.poll(async () => {
      const cur = JSON.stringify(await rects());
      const stable = cur === prev;
      prev = cur;
      return stable;
    }, { intervals: [100, 100, 200, 250], timeout: 10_000 }).toBe(true);
    const { wf, bm, mp } = await rects();
    expect(bm.x).toBeCloseTo(wf.x, 0);
    expect(mp.x).toBeGreaterThan(wf.x + 1);
    expect(bm.y).toBeGreaterThanOrEqual(wf.y + wf.height - 1);
    expect(bm.y - (wf.y + wf.height)).toBeLessThanOrEqual(24);
    expect(Math.abs(mp.y - wf.y)).toBeLessThanOrEqual(2);
  });

  test('[REQ-365/AC-1] 1279px: single column order', async ({ page }) => {
    await openSettings(page, 1279);
    const wf = await box(page.getByTestId('settings-card-workflow'));
    const mp = await box(page.getByTestId('settings-card-mapping'));
    const bm = await box(page.getByTestId('settings-card-basemodel'));
    expect(mp.x).toBeCloseTo(wf.x, 0);
    expect(bm.x).toBeCloseTo(wf.x, 0);
    expect(wf.y).toBeLessThan(mp.y);
    expect(mp.y).toBeLessThan(bm.y);
  });

  test('[REQ-365/AC-2] 767px: horizontal swipe tablist with numbered compact labels', async ({ page }) => {
    await openSettings(page, 767);
    const tablist = page.getByRole('tablist', { name: '設定カテゴリー' });
    await expect(tablist).toBeVisible();
    const s = await tablist.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { overflowX: cs.overflowX, snap: cs.scrollSnapType, sw: el.scrollWidth, cw: el.clientWidth };
    });
    expect(s.sw > s.cw || s.overflowX === 'auto').toBe(true);
    expect(s.snap).toContain('x');
    expect(s.snap).toContain('mandatory');
    await expect(tablist.getByRole('tab').first()).toContainText('① モデル');
    await expect(tablist.getByRole('tab').last()).toContainText('⑤ システム');
  });

  test('[REQ-365/AC-2] 768px: grid tabs with long labels', async ({ page }) => {
    await openSettings(page, 768);
    const tablist = page.getByRole('tablist', { name: '設定カテゴリー' });
    await expect(tablist).toHaveCSS('display', 'grid');
    await expect(tablist.getByText('ワークフロー・モデル')).toBeVisible();
    await expect(tablist.getByText('システム・一般')).toBeVisible();
    const scroller = page.getByTestId('settings-content-container').locator('..');
    await expect(scroller).toHaveCSS('padding-bottom', '20px');
  });

  test('[REQ-365/AC-2] 375px: interactive controls are >=44px', async ({ page }) => {
    await openSettings(page, 375, 667);
    await expect(page.locator(MASTER_CARD).first()).toBeVisible();
    const violations = await page.evaluate(() => {
      const sel = 'button, select, input:not([type=checkbox]):not([type=radio]), [role=tab]';
      const out: string[] = [];
      document.querySelectorAll('.req314-settings').forEach((root) => {
        root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || r.height === 0) return;
          if (el.closest('[hidden]')) return;
          const iconOnly = el.tagName === 'BUTTON' && !(el.textContent ?? '').trim();
          const bad = r.height < 44 - 0.5 || (iconOnly && r.width < 44 - 0.5);
          if (bad) {
            out.push(`${el.tagName.toLowerCase()}[${el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 20)}] ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
        });
      });
      return out;
    });
    expect(violations, `under 44px:\n${violations.join('\n')}`).toEqual([]);
  });

  test('[REQ-365/AC-3] 375px: mapping master cards', async ({ page }) => {
    await openSettings(page, 375, 667);
    const card = page.locator(MASTER_CARD).first();
    await expect(card).toBeVisible();
    await expect(card).toHaveCSS('display', 'grid');
    await expect(card.locator('.settings-mobile-card__target-node')).toHaveCSS('display', 'none');
    const cb = await box(card);
    const ab = await box(card.locator('.settings-mobile-card__actions'));
    expect(cb.x + cb.width - (ab.x + ab.width)).toBeLessThanOrEqual(16);
    await expect(page.getByTestId('settings-card-mapping').locator('thead:visible')).toHaveCount(0);
  });

  test('[REQ-365/AC-9] 375px: param type manager opens as bottom sheet', async ({ page }) => {
    const vh = 667;
    await openSettings(page, 375, vh);
    await openMappingManagementItem(page, 'カスタム型マスタ');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const b = await box(dialog);
    expect(Math.abs(b.y + b.height - vh)).toBeLessThanOrEqual(1);
    await expect(dialog).toHaveCSS('border-top-left-radius', '16px');
    await expect(dialog).toHaveCSS('border-top-right-radius', '16px');
    await expect(page.getByTestId('modal-sheet-handle')).toBeVisible();
    // Exactly one drag handle: the legacy ::before handle must not render on the common Modal.
    await expect(page.getByTestId('modal-sheet-handle')).toHaveCount(1);
    const beforeContent = await dialog.evaluate((el) => getComputedStyle(el, '::before').content);
    expect(['none', 'normal']).toContain(beforeContent);
    const maxH = await dialog.evaluate((el) => parseFloat(getComputedStyle(el).maxHeight));
    expect(maxH).toBeLessThanOrEqual(vh * 0.85 + 1);
    console.log('[REQ-365/AC-9] custom type modal geometry', JSON.stringify({ viewport: { width: 375, height: vh }, rect: b, maxHeight: maxH }));
  });

  test('[REQ-365/AC-9] 768px: same dialog is centered, not a sheet', async ({ page }) => {
    const vw = 768;
    const vh = 900;
    await openSettings(page, vw, vh);
    await page.getByRole('button', { name: 'カスタム型マスタ', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const b = await box(dialog);
    expect(b.y + b.height).toBeLessThan(vh - 1);
    expect(Math.abs(b.x + b.width / 2 - vw / 2)).toBeLessThanOrEqual(2);
  });

  async function openMappingManagementItem(page: Page, item: 'ステージ管理' | 'カスタム型マスタ'): Promise<void> {
    if ((page.viewportSize()?.width ?? 1280) < 768) {
      const mapping = page.getByTestId('settings-card-mapping');
      await mapping.getByRole('button', { name: '管理 ⋯', exact: true }).click();
      await page.getByRole('menu', { name: 'Mapping master管理' }).getByRole('menuitem', { name: item, exact: true }).click();
      return;
    }
    await page.getByRole('button', { name: item, exact: true }).click();
  }

  const SHEET_TARGETS = [
    {
      name: 'stage manager',
      dialogName: /ステージ管理/,
      open: (page: Page) => openMappingManagementItem(page, 'ステージ管理'),
    },
    {
      name: 'mapping master edit',
      dialogName: /新規マッピングマスター作成/,
      open: (page: Page) => page.getByRole('button', { name: /Add Master/ }).click(),
    },
  ];

  for (const target of SHEET_TARGETS) {
    test(`[REQ-365/AC-9] 375px: ${target.name} opens as bottom sheet (one handle, 16px top radius, <=85dvh, no legacy ::before)`, async ({ page }) => {
      const vh = 667;
      await openSettings(page, 375, vh);
      await target.open(page);
      const dialog = page.getByRole('dialog', { name: target.dialogName });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      const b = await box(dialog);
      expect(Math.abs(b.y + b.height - vh)).toBeLessThanOrEqual(1);
      await expect(dialog).toHaveCSS('border-top-left-radius', '16px');
      await expect(dialog).toHaveCSS('border-top-right-radius', '16px');
      await expect(page.getByTestId('modal-sheet-handle')).toHaveCount(1);
      await expect(page.getByTestId('modal-sheet-handle')).toBeVisible();
      const beforeContent = await dialog.evaluate((el) => getComputedStyle(el, '::before').content);
      expect(['none', 'normal']).toContain(beforeContent);
      const maxH = await dialog.evaluate((el) => parseFloat(getComputedStyle(el).maxHeight));
      expect(maxH).toBeLessThanOrEqual(vh * 0.85 + 1);
    });

    test(`[REQ-365/AC-9] 1280px: ${target.name} is centered, not a sheet`, async ({ page }) => {
      const vw = 1280;
      const vh = 900;
      await openSettings(page, vw, vh);
      await target.open(page);
      const dialog = page.getByRole('dialog', { name: target.dialogName });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      const b = await box(dialog);
      expect(b.y + b.height).toBeLessThan(vh - 1);
      expect(Math.abs(b.x + b.width / 2 - vw / 2)).toBeLessThanOrEqual(2);
      await expect(page.getByTestId('modal-sheet-handle')).toBeHidden();
    });

    // Escape close is tracked separately (D-1: common Modal stopPropagation) and out of REQ-365 scope
  }

  // REQ-365-T30: additional migrated dialogs (same checks as SHEET_TARGETS above).
  async function stubWorkflows(page: Page): Promise<void> {
    await page.route((url) => url.pathname === '/api/workflows', async (route) => {
      if (route.request().method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 1, name: 'wf-e2e', created_at: '2026-01-01T00:00:00Z' }]),
      });
    });
  }
  async function openWorkflowMenu(page: Page, item: string): Promise<void> {
    test.setTimeout(30_000); // reload + list refetch makes these cases slower than the 10s default under CPU load
    await stubWorkflows(page);
    await page.reload();
    const trigger = page.getByRole('button', { name: 'wf-e2e の操作メニュー' });
    const menuItem = page.getByRole('menuitem', { name: item });
    await expect(trigger).toBeVisible();
    // Under load the list can re-render right after the first click and close the menu; reopen only if closed.
    await expect(async () => {
      if (!(await menuItem.isVisible())) await trigger.click({ timeout: 2_000 });
      await menuItem.click({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  }

  const EXTRA_SHEET_TARGETS = [
    {
      name: 'speech tone preset',
      hash: 'dialogue',
      dialogName: /新規口調プリセット作成/,
      open: (page: Page) => page.getByRole('button', { name: /プリセット追加/ }).click(),
    },
    {
      name: 'mapping master delete',
      hash: 'workflows',
      dialogName: /Delete Mapping Master\?/,
      open: (page: Page) => page.locator(MASTER_CARD).first().getByRole('button', { name: /を削除$/ }).click(),
    },
    {
      name: 'workflow rename',
      hash: 'workflows',
      dialogName: /ワークフロー名の変更/,
      open: (page: Page) => openWorkflowMenu(page, '名前変更'),
    },
    {
      name: 'workflow copy',
      hash: 'workflows',
      dialogName: /ワークフローのコピー/,
      open: (page: Page) => openWorkflowMenu(page, 'コピー'),
    },
    {
      name: 'workflow delete',
      hash: 'workflows',
      dialogName: /ワークフロー「.+」を削除しますか？/,
      open: (page: Page) => openWorkflowMenu(page, '削除'),
    },
  ];

  for (const target of EXTRA_SHEET_TARGETS) {
    test(`[REQ-365/AC-9] 375px: ${target.name} opens as bottom sheet (one handle, 16px top radius, <=85dvh, no legacy ::before)`, async ({ page }) => {
      const vh = 667;
      await openSettings(page, 375, vh, target.hash);
      await target.open(page);
      const dialog = page.getByRole('dialog', { name: target.dialogName });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      const b = await box(dialog);
      expect(Math.abs(b.y + b.height - vh)).toBeLessThanOrEqual(1);
      await expect(dialog).toHaveCSS('border-top-left-radius', '16px');
      await expect(dialog).toHaveCSS('border-top-right-radius', '16px');
      await expect(page.getByTestId('modal-sheet-handle')).toHaveCount(1);
      await expect(page.getByTestId('modal-sheet-handle')).toBeVisible();
      const beforeContent = await dialog.evaluate((el) => getComputedStyle(el, '::before').content);
      expect(['none', 'normal']).toContain(beforeContent);
      const maxH = await dialog.evaluate((el) => parseFloat(getComputedStyle(el).maxHeight));
      expect(maxH).toBeLessThanOrEqual(vh * 0.85 + 1);
    });

    test(`[REQ-365/AC-9] 1280px: ${target.name} is centered, not a sheet`, async ({ page }) => {
      const vw = 1280;
      const vh = 900;
      await openSettings(page, vw, vh, target.hash);
      await target.open(page);
      const dialog = page.getByRole('dialog', { name: target.dialogName });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      const b = await box(dialog);
      expect(b.y + b.height).toBeLessThan(vh - 1);
      expect(Math.abs(b.x + b.width / 2 - vw / 2)).toBeLessThanOrEqual(2);
      await expect(page.getByTestId('modal-sheet-handle')).toBeHidden();
    });
  }

  // REQ-365-T32: backdrop must cover the whole viewport for EVERY dialog (D-R3-1 regression guard).
  const BASE_MODEL_TARGETS = [
    {
      name: 'base model manager',
      hash: 'workflows',
      dialogName: /ベースモデルマスタ管理/,
      open: (page: Page) => page.getByTestId('settings-card-basemodel').getByRole('button', { name: 'モデルマスタ管理', exact: true }).click(),
    },
    {
      name: 'base model create',
      hash: 'workflows',
      dialogName: /ベースモデル作成/,
      open: async (page: Page) => {
        await page.getByTestId('settings-card-basemodel').getByRole('button', { name: 'モデルマスタ管理', exact: true }).click();
        await page.getByRole('dialog', { name: /ベースモデルマスタ管理/ }).getByRole('button', { name: /モデル追加/ }).click();
      },
    },
    {
      name: 'checkpoint mapping add',
      hash: 'workflows',
      dialogName: /チェックポイントマッピング追加/,
      open: (page: Page) => page.getByTestId('settings-card-basemodel').getByRole('button', { name: /マッピング追加/ }).click(),
    },
  ];

  const PARAM_TYPE_TARGETS = [
    {
      name: 'param type manager',
      hash: 'workflows',
      dialogName: /カスタム型マスタ管理/,
      open: (page: Page) => openMappingManagementItem(page, 'カスタム型マスタ'),
    },
    {
      name: 'param type create',
      hash: 'workflows',
      dialogName: /カスタム型マスター作成/,
      open: async (page: Page) => {
        await openMappingManagementItem(page, 'カスタム型マスタ');
        const manager = page.getByRole('dialog', { name: /カスタム型マスタ管理/ });
        await expect(manager).toBeVisible();
        const createButton = manager.getByRole('button', { name: /新規型を作成/ });
        await expect(createButton).toBeVisible();
        await createButton.click();
      },
    },
  ];

  const BACKDROP_TARGETS: Array<{ name: string; hash: string; dialogName: RegExp; open: (page: Page) => Promise<unknown> }> = [
    ...SHEET_TARGETS.map((t) => ({ ...t, hash: 'workflows' })),
    ...EXTRA_SHEET_TARGETS,
    ...BASE_MODEL_TARGETS,
    ...PARAM_TYPE_TARGETS,
  ];

  for (const target of BACKDROP_TARGETS) {
    for (const [vw, vh] of [[375, 667], [1280, 900]] as const) {
      test(`[REQ-365/AC-9] ${vw}px: ${target.name} backdrop covers the full viewport and blocks the header`, async ({ page }) => {
        await openSettings(page, vw, vh, target.hash);
        await target.open(page);
        await expect(page.getByRole('dialog', { name: target.dialogName })).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(1);
        const backdrop = page.locator('.modal-backdrop');
        await expect(backdrop).toHaveCount(1);
        const b = await box(backdrop);
        expect(Math.abs(b.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(b.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(b.width - vw)).toBeLessThanOrEqual(1);
        expect(Math.abs(b.height - vh)).toBeLessThanOrEqual(1);
        // Top strip (header area) must be covered by the backdrop itself, not by page content.
        const hit = await backdrop.evaluate((el, point) => document.elementFromPoint(point.x, point.y) === el, { x: Math.floor(vw / 2), y: 6 });
        expect(hit).toBe(true);
      });
    }
  }

  test('[REQ-365/AC-9] 375px: sheet backdrop is not shrunk (modal-backdrop covers the full viewport height)', async ({ page }) => {
    const vh = 667;
    await openSettings(page, 375, vh, 'dialogue');
    await page.getByRole('button', { name: /プリセット追加/ }).click();
    await expect(page.getByRole('dialog', { name: /新規口調プリセット作成/ })).toBeVisible();
    const bd = await box(page.locator('.modal-backdrop'));
    expect(Math.abs(bd.height - vh)).toBeLessThanOrEqual(1);
  });

  test('[REQ-365/AC-2] 375px: content bottom padding clears the bottom nav', async ({ page }) => {
    const vh = 667;
    await openSettings(page, 375, vh, 'system');
    const panel = page.locator('#settings-panel-system');
    await expect(panel).toBeVisible();
    const scroller = page.getByTestId('settings-content-container').locator('..');
    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const gap = await panel.evaluate((el) => {
      const last = el.lastElementChild as HTMLElement;
      return window.innerHeight - last.getBoundingClientRect().bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(54);
  });

  test('[REQ-380/AC-1] [REQ-381/AC-11] 375/767/768/1280px: Manager action stays accessible and contained', async ({ page }) => {
    test.setTimeout(30_000);
    await setManagerState({ running: [], pending: [], free_delay: 0, free_status: 200,
      queue_mode: 'normal', comfy_stopped: false });
    await stubApi(page);
    const managerRequestMeta: string[] = [];
    await page.route('http://127.0.0.1:8899/api/**', async (route) => {
      const original = new URL(route.request().url());
      managerRequestMeta.push(`${route.request().method()} ${original.pathname}${original.search}`);
      const destination = new URL(original.pathname + original.search, managerUrl);
      const response = await route.fetch({ url: destination.href });
      await route.fulfill({ response });
    });
    const widths = [375, 767, 768, 1280];
    let memoryButton = page.getByRole('button', { name: /ComfyUIのメモリ解放/ });
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('http://127.0.0.1:5173/settings#system');
      await expect(page.locator('#settings-panel-system')).toBeVisible();
      await expect(page.getByRole('button', { name: /Comfy LISTEN/ })).toBeVisible();
      memoryButton = page.getByRole('button', { name: /ComfyUIのメモリ解放/ });
      const row = page.getByRole('listitem', { name: 'ComfyUI' });
      await expect(row).toBeVisible();
      const lamp = row.getByRole('img', { name: /^死活: (稼働中|停止中|不明)$/ });
      await expect(lamp).toBeVisible();
      await expect(memoryButton).toBeVisible();
      const bounds = await memoryButton.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      if (width === 375 || width === 768) await page.screenshot({ path: test.info().outputPath(`REQ-381-manager-${width}.png`), fullPage: true, mask: [page.locator('#service-log-comfy')] });
      const logToggle = row.getByRole('button', { name: /^ログ [▼▲]$/ });
      const logBefore = await logToggle.evaluate((el) => ({ expanded: el.getAttribute('aria-expanded'), controls: el.getAttribute('aria-controls'), disabled: (el as HTMLButtonElement).disabled }));
      if (logBefore.expanded === 'true') {
        await logToggle.click();
        await expect(logToggle).toHaveAttribute('aria-expanded', 'false');
      }
      await logToggle.click();
      await expect.poll(async () => logToggle.getAttribute('aria-expanded'), { timeout: 3000 }).toBe('true').catch(async () => {
        const logAfter = await logToggle.evaluate((el) => ({ expanded: el.getAttribute('aria-expanded'), controls: el.getAttribute('aria-controls'), disabled: (el as HTMLButtonElement).disabled }));
        const controlCount = await page.locator('#service-log-comfy').count();
        throw new Error(`Manager log toggle did not open: ${JSON.stringify({ logBefore, logAfter, controlCount, managerRequestMeta, href: page.url() })}`);
      });
      const logRegion = row.getByRole('region', { name: 'ComfyUI のログ', exact: true });
      await expect(logRegion).toBeVisible();
      await expect(page.locator('#service-log-comfy')).toBeVisible();
      await expect(logRegion.getByRole('button', { name: 'ComfyUI のログを再取得', exact: true })).toBeVisible();
      const logBounds = await box(logRegion);
      expect(logBounds.x).toBeGreaterThanOrEqual(0);
      expect(logBounds.x + logBounds.width).toBeLessThanOrEqual(width);
      const memoryBoundsWithLog = await memoryButton.boundingBox();
      expect(memoryBoundsWithLog).not.toBeNull();
      expect(memoryBoundsWithLog!.x + memoryBoundsWithLog!.width <= logBounds.x || logBounds.x + logBounds.width <= memoryBoundsWithLog!.x || memoryBoundsWithLog!.y + memoryBoundsWithLog!.height <= logBounds.y || logBounds.y + logBounds.height <= memoryBoundsWithLog!.y).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`REQ-380-${width}.png`), mask: [page.locator('#service-log-comfy')] });
      if (width === 375) {
        await memoryButton.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('[role="status"]').filter({ hasText: /受付|受け付け/ })).toBeVisible();
      }
    }
  });

  const SETTINGS_TABS = [
    ['workflows', 'ワークフロー・モデル'], ['prompt', 'プロンプト支援'], ['dialogue', 'セリフ支援'],
    ['translation', '翻訳'], ['system', 'システム・一般'],
  ] as const;
  const selectSettingsTab = async (page: Page, hash: typeof SETTINGS_TABS[number][0]) => {
    const tab = page.getByRole('tablist', { name: '設定カテゴリー' }).getByRole('tab', { name: SETTINGS_TABS.find(([key]) => key === hash)![1] });
    await tab.click();
    await expect(page.locator(`#settings-panel-${hash}`)).toBeVisible();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    for (const [otherHash] of SETTINGS_TABS) {
      const otherPanel = page.locator(`#settings-panel-${otherHash}`);
      if (otherHash === hash) await expect(otherPanel).toBeVisible();
      else await expect(otherPanel).toBeHidden();
    }
    return tab;
  };
  const expectSelectedTabWithinViewport = async (page: Page, hash: typeof SETTINGS_TABS[number][0]) => {
    const tabs = page.getByRole('tablist', { name: '設定カテゴリー' });
    const tab = tabs.getByRole('tab', { name: SETTINGS_TABS.find(([key]) => key === hash)![1] });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(new RegExp(`#${hash}$`));
    const geometry = await tab.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, viewportWidth: document.documentElement.clientWidth };
    });
    console.log(`[REQ-381/T1] selected ${hash} tab geometry`, JSON.stringify(geometry));
    expect(geometry.left, `${hash} selected tab left edge`).toBeGreaterThanOrEqual(0);
    expect(geometry.right, `${hash} selected tab right edge`).toBeLessThanOrEqual(geometry.viewportWidth);
    return geometry;
  };
  const putRequests = (page: Page) => (page as Page & { __settingsPutRequests?: Array<{ path: string; body: unknown }> }).__settingsPutRequests ?? [];

  test('[REQ-381/AC-9] 375px: direct #system selection scrolls the selected tab fully into view', async ({ page }) => {
    await openSettings(page, 375, 812, 'system');
    const geometry = await expectSelectedTabWithinViewport(page, 'system');
    await page.screenshot({ path: test.info().outputPath('REQ-381-T1-system-initial-375.png'), fullPage: true });
    expect(geometry.width).toBeGreaterThan(0);
  });

  test('[REQ-381/AC-1] 375px: all Settings tabs and representative values survive tab changes', async ({ page }) => {
    await openSettings(page, 375, 812, 'workflows');
    for (const [hash] of SETTINGS_TABS) {
      const tab = await selectSettingsTab(page, hash);
      if (hash === 'workflows') {
        await expect(page.getByTestId('settings-card-workflow')).toBeVisible();
        await expect(page.getByTestId('settings-card-basemodel')).toBeVisible();
        await expect(page.getByTestId('settings-card-mapping')).toBeVisible();
      } else if (hash === 'prompt') {
        await expect(page.locator('#settings-panel-prompt')).toContainText('プロンプト');
      } else if (hash === 'dialogue') {
        await expect(page.getByRole('button', { name: /プリセット追加/ })).toBeVisible();
        await expect(page.getByRole('spinbutton', { name: '最小面積 (min_area: 画素数)' })).toHaveValue('1000');
      } else if (hash === 'translation') {
        await expect(page.locator('#translation-debounce')).toHaveValue('500');
      } else {
        await expect(page.getByRole('region', { name: 'サービス管理' })).toBeVisible();
        await expect(page.getByRole('spinbutton', { name: '最小面積 (min_area: 画素数)' })).toHaveCount(0);
      }
    }
    await selectSettingsTab(page, 'translation');
    await expect(page.locator('#translation-debounce')).toHaveValue('500');
    await selectSettingsTab(page, 'dialogue');
    await expect(page.getByRole('spinbutton', { name: '最小面積 (min_area: 画素数)' })).toHaveValue('1000');
    await selectSettingsTab(page, 'system');
    await expect(page.getByRole('spinbutton', { name: '最小面積 (min_area: 画素数)' })).toHaveCount(0);
    expect(putRequests(page)).toHaveLength(0);
  });

  test('[REQ-381/AC-2] 320/375/767px: every Settings panel stays within viewport and cards do not overlap', async ({ page }) => {
    for (const width of [320, 375, 767]) {
      await openSettings(page, width, 812, 'workflows');
      for (const [hash] of SETTINGS_TABS) {
        await selectSettingsTab(page, hash);
        const bounds = await page.evaluate(() => ({
          doc: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          panel: (() => { const e = document.querySelector('[id^="settings-panel-"]:not([hidden])') as HTMLElement; return !e || e.scrollWidth <= e.clientWidth; })(),
        }));
        expect(bounds.doc, `${width}px ${hash} document overflow`).toBe(true);
        expect(bounds.panel, `${width}px ${hash} panel overflow`).toBe(true);
      }
      if (width === 375) await page.screenshot({ path: test.info().outputPath('REQ-381-375.png'), fullPage: true });
    }
  });

  test('[REQ-381/AC-3] 375px: Add Master remains directly available beside the management menu', async ({ page }) => {
    await openSettings(page, 375, 812, 'workflows');
    const card = page.getByTestId('settings-card-mapping');
    const add = card.getByRole('button', { name: /マスタ追加|Add Master/ });
    const menu = card.getByRole('button', { name: '管理 ⋯', exact: true });
    await expect(add).toBeVisible();
    await expect(menu).toBeVisible();
    const addBox = await box(add); const menuBox = await box(menu);
    expect(addBox.x + addBox.width <= menuBox.x || menuBox.x + menuBox.width <= addBox.x || addBox.y + addBox.height <= menuBox.y || menuBox.y + menuBox.height <= addBox.y).toBe(true);
    await add.click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
  });

  test('[REQ-381/AC-4] 375px: mapping management menu opens and Escape restores focus', async ({ page }) => {
    await openSettings(page, 375, 812, 'workflows');
    const trigger = page.getByTestId('settings-card-mapping').getByRole('button', { name: '管理 ⋯', exact: true });
    await trigger.click();
    const menu = page.getByRole('menu', { name: 'Mapping master管理' });
    await expect(menu.getByRole('menuitem', { name: 'ステージ管理' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'カスタム型マスタ' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    const stageMenu = page.getByRole('menu', { name: 'Mapping master管理' });
    await stageMenu.getByRole('menuitem', { name: 'ステージ管理' }).click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await expect(stageMenu).toHaveCount(0);
    const customPage = await page.context().newPage();
    await openSettings(customPage, 375, 812, 'workflows');
    const customTrigger = customPage.getByTestId('settings-card-mapping').getByRole('button', { name: '管理 ⋯', exact: true });
    await customTrigger.click();
    const reopenedMenu = customPage.getByRole('menu', { name: 'Mapping master管理' });
    await reopenedMenu.getByRole('menuitem', { name: 'カスタム型マスタ' }).click();
    await expect(customPage.getByRole('dialog').first()).toBeVisible();
    await expect(reopenedMenu).toHaveCount(0);
    await customPage.close();
  });

  test('[REQ-381/AC-5] 375px: info explanations stay inline while validation text remains visible', async ({ page }) => {
    await openSettings(page, 375, 812, 'dialogue');
    const info = page.getByRole('button', { name: '説明: 最小面積の説明' });
    await info.scrollIntoViewIfNeeded();
    await expect(info).toBeInViewport();
    const scroller = page.getByTestId('settings-content-container').locator('..');
    const scrollBefore = await scroller.evaluate((el) => el.scrollTop);
    await info.click();
    const tip = page.getByRole('dialog', { name: '最小面積の説明' });
    await expect(tip).toBeVisible();
    expect(await scroller.evaluate((el) => el.scrollTop), 'outer Settings scroll must remain stable during info open').toBe(scrollBefore);
    await expect(tip).toContainText('吹き出しと判定する最小の画素サイズです。検出されない場合は小さくしてください。');
    const tipBox = await box(tip); const infoBox = await box(info);
    expect(tipBox.x + tipBox.width <= infoBox.x || infoBox.x + infoBox.width <= tipBox.x || tipBox.y + tipBox.height <= infoBox.y || infoBox.y + infoBox.height <= tipBox.y).toBe(true);
    await page.getByRole('heading', { name: /画像処理フィルタパラメータ/ }).click();
    await expect(tip).toHaveCount(0);
  });

  test('[REQ-381/AC-6] 375px: info popup has opaque readable content and closes on Escape', async ({ page }) => {
    await openSettings(page, 375, 812, 'dialogue');
    const info = page.getByRole('button', { name: '説明: 最小面積の説明' });
    await info.scrollIntoViewIfNeeded();
    await expect(info).toBeInViewport();
    const scroller = page.getByTestId('settings-content-container').locator('..');
    const scrollBefore = await scroller.evaluate((el) => el.scrollTop);
    await info.click();
    const tip = page.getByRole('dialog', { name: '最小面積の説明' });
    await expect(tip).toBeVisible();
    expect(await scroller.evaluate((el) => el.scrollTop), 'outer Settings scroll must remain stable during info open').toBe(scrollBefore);
    expect(await tip.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(24, 24, 27)');
    const bounds = await box(tip);
    expect(bounds.x).toBeGreaterThanOrEqual(8); expect(bounds.y).toBeGreaterThanOrEqual(8);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(367); expect(bounds.y + bounds.height).toBeLessThanOrEqual(804);
    const popupScroll = await tip.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    if (popupScroll.scrollHeight > popupScroll.clientHeight) {
      await tip.hover();
      await page.mouse.wheel(0, 40);
      await expect(tip).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
    await info.click();
    await expect(tip).toBeVisible();
    await page.mouse.wheel(0, 40);
    await expect(tip).toHaveCount(0);
    await info.scrollIntoViewIfNeeded();
    await info.click();
    await expect(tip).toBeVisible();
    await page.setViewportSize({ width: 360, height: 812 });
    await expect(tip).toHaveCount(0);
    await info.scrollIntoViewIfNeeded();
    await info.click();
    await expect(tip).toBeVisible();
    await selectSettingsTab(page, 'translation');
    await expect(tip).toHaveCount(0);
  });

  test('[REQ-381/AC-7] 375px: numeric draft is not sent until commit and repeated blur is idempotent', async ({ page }) => {
    await openSettings(page, 375, 812, 'dialogue');
    const area = page.getByRole('spinbutton', { name: '最小面積 (min_area: 画素数)' });
    await area.fill('1200');
    expect(putRequests(page)).toHaveLength(0);
    await area.press('Enter');
    await expect.poll(() => putRequests(page).filter((r) => r.path === '/llm-prompts/bubble_detection_params').length).toBe(1);
    await area.blur();
    expect(putRequests(page).filter((r) => r.path === '/llm-prompts/bubble_detection_params')).toHaveLength(1);
  });

  test('[REQ-381/AC-7] 375px: a 503 commit preserves the numeric draft and exposes failure', async ({ page }) => {
    await openSettings(page, 375, 812, 'dialogue');
    let attempts = 0;
    await page.route('**/api/llm-prompts/bubble_detection_params', async (route) => {
      attempts += 1;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'fixture failure' }) });
    });
    const area = page.getByRole('spinbutton', { name: '最小面積 (min_area: 画素数)' });
    await area.fill('1350');
    expect(putRequests(page)).toHaveLength(0);
    await area.press('Enter');
    await expect.poll(() => attempts).toBe(1);
    await expect(area).toHaveValue('1350');
    await expect(page.getByRole('alert').first()).toBeVisible();
    expect(attempts).toBe(1);
  });

  test('[REQ-381/AC-8] 375px: prompt and translation drafts wait for explicit Save', async ({ page }) => {
    await openSettings(page, 375, 812, 'prompt');
    const prompt = page.locator('#settings-panel-prompt');
    const toggle = prompt.getByRole('button', { name: 'プロンプト診断・生成の詳細設定', exact: true });
    if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    await prompt.locator('#prompt-type-select').selectOption('audit_interference');
    const content = prompt.locator('#prompt-content-audit_interference');
    await content.fill('編集済みプロンプト');
    expect(putRequests(page)).toHaveLength(0);
    await prompt.locator('#prompt-save-audit_interference').click();
    await expect.poll(() => putRequests(page).filter((r) => r.path === '/llm-prompts/audit_interference').length).toBe(1);
    expect(putRequests(page).find((r) => r.path === '/llm-prompts/audit_interference')?.body).toEqual({ content: '編集済みプロンプト' });
    await selectSettingsTab(page, 'translation');
    const translation = page.locator('#settings-panel-translation');
    await translation.locator('input[type="radio"][name="provider"][value="google_cloud"]').check();
    await translation.getByPlaceholder('AIzaSy...', { exact: true }).fill('fixture-only-key');
    await translation.getByPlaceholder('https://api-free.deepl.com/v2/translate (省略時は自動判別)', { exact: true }).fill('https://fixture.invalid/translate');
    expect(putRequests(page)).toHaveLength(1);
    await translation.getByRole('button', { name: '設定を保存', exact: true }).click();
    await expect.poll(() => putRequests(page).filter((r) => r.path === '/llm-prompts/translation_provider').length).toBe(1);
    expect(putRequests(page).filter((r) => r.path.startsWith('/llm-prompts/translation_'))).toHaveLength(3);
  });

  test('[REQ-381/AC-8] 375px: workflow import preview requires the final explicit apply', async ({ page }) => {
    test.setTimeout(30_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
    page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()); });
    await openSettings(page, 375, 812, 'workflows');
    const workflowCard = page.getByTestId('settings-card-workflow');
    await workflowCard.getByRole('button', { name: '対応付け・設定', exact: true }).click();
    const config = page.locator('[aria-label="ワークフロー対応付け設定"]');
    const configHeading = config.getByRole('heading', { name: 'wf-e2e の対応付け', exact: true });
    const renderError = page.getByRole('heading', { name: 'システムエラーが発生しました', exact: true });
    await expect.poll(async () => {
      if (await configHeading.isVisible()) return 'ready';
      if (await renderError.isVisible()) return `render-error: ${pageErrors.join('\n')}`;
      return 'loading';
    }, { timeout: 15_000 }).toBe('ready');
    const importFixture = { format: 'prompt-surgeon-workflow-config', version: 1, name: 'wf-e2e',
      json_body: { nodes: { '1': { class_type: 'KSampler', inputs: { seed: 9 } } } }, mappings: [],
      target_base_model_id: null, default_applied_assets: null };
    await config.getByRole('textbox', { name: '設定JSONをインポート', exact: true }).fill(JSON.stringify(importFixture));
    await config.getByRole('button', { name: 'インポート内容を確認', exact: true }).click();
    await config.getByRole('button', { name: '適用を確認', exact: true }).click();
    expect(putRequests(page).filter((r) => r.path === '/workflows/1')).toHaveLength(0);
    await config.getByRole('button', { name: 'この内容を適用する', exact: true }).click();
    await expect.poll(() => putRequests(page).filter((r) => r.path === '/workflows/1').length).toBe(1);
  });

  test('[REQ-381/AC-9] 375px: Settings tab buttons support direct keyboard selection', async ({ page }) => {
    await openSettings(page, 375, 812, 'workflows');
    const tabs = page.getByRole('tablist', { name: '設定カテゴリー' });
    await tabs.getByRole('tab', { name: 'プロンプト支援' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#settings-panel-prompt')).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'プロンプト支援' })).toHaveAttribute('aria-selected', 'true');
  });

  test('[REQ-381/AC-9] 375px: native Chromium touch swipe honors distance threshold and changes tabs', async ({ page }) => {
    const browser = page.context().browser();
    expect(browser).not.toBeNull();
    const context = await browser!.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
    const touchPage = await context.newPage();
    try {
      await openSettings(touchPage, 375, 812, 'workflows');
      const workflow = await box(touchPage.getByTestId('settings-card-workflow'));
      const basemodel = await box(touchPage.getByTestId('settings-card-basemodel'));
      const x = Math.floor((workflow.x + workflow.width / 2));
      const y = Math.floor((workflow.y + workflow.height + basemodel.y) / 2);
      const neutral = await touchPage.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return !!el && !el.closest('button,a,input,select,textarea,[role="button"],[role="tab"],[role="menu"],[role="dialog"]');
      }, { x, y });
      expect(neutral).toBe(true);
      const cdp = await context.newCDPSession(touchPage);
      const dispatch = async (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: Array<{ x: number; y: number; id: number }>) => {
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
      };
      const swipe = async (dx: number, dy = 0) => {
        await dispatch('touchStart', [{ x, y, id: 1 }]);
        await dispatch('touchMove', [{ x: x + dx, y: y + dy, id: 1 }]);
        await dispatch('touchEnd', []);
      };
      await swipe(80);
      await expect(touchPage.locator('#settings-panel-workflows')).toBeVisible();
      await swipe(-47);
      await expect(touchPage.locator('#settings-panel-workflows')).toBeVisible();
      await swipe(-18, 12);
      await expect(touchPage.locator('#settings-panel-workflows')).toBeVisible();
      await dispatch('touchStart', [{ x, y, id: 1 }]);
      await dispatch('touchMove', [{ x, y: y + 13, id: 1 }]);
      await dispatch('touchMove', [{ x: x - 80, y: y + 13, id: 1 }]);
      await dispatch('touchEnd', []);
      await expect(touchPage.locator('#settings-panel-workflows')).toBeVisible();
      await dispatch('touchStart', [{ x, y, id: 1 }, { x: x + 12, y, id: 2 }]);
      await dispatch('touchMove', [{ x: x - 80, y, id: 1 }, { x: x - 68, y, id: 2 }]);
      await dispatch('touchEnd', []);
      await expect(touchPage.locator('#settings-panel-workflows')).toBeVisible();
      await dispatch('touchStart', [{ x, y, id: 1 }]);
      await dispatch('touchMove', [{ x: x - 80, y, id: 1 }]);
      await dispatch('touchCancel', []);
      await expect(touchPage.locator('#settings-panel-workflows')).toBeVisible();
      const contentScroller = touchPage.getByTestId('settings-content-container').locator('..');
      const scrollBefore = await contentScroller.evaluate((el) => el.scrollTop);
      await dispatch('touchStart', [{ x, y, id: 1 }]);
      await dispatch('touchMove', [{ x, y: y - 100, id: 1 }]);
      await dispatch('touchEnd', []);
      await expect.poll(() => contentScroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(scrollBefore);
      await swipe(-48);
      await expect(touchPage.locator('#settings-panel-prompt')).toBeVisible();
      await expectSelectedTabWithinViewport(touchPage, 'prompt');
      await touchPage.screenshot({ path: test.info().outputPath('REQ-381-T1-native-swipe-prompt-375.png'), fullPage: true });
      await swipe(48);
      await expect(touchPage.locator('#settings-panel-workflows')).toBeVisible();
      await selectSettingsTab(touchPage, 'dialogue');
      const input = await box(touchPage.getByRole('spinbutton', { name: '最小面積 (min_area: 画素数)' }));
      const ix = Math.floor(input.x + input.width / 2); const iy = Math.floor(input.y + input.height / 2);
      await dispatch('touchStart', [{ x: ix, y: iy, id: 1 }]);
      await dispatch('touchMove', [{ x: ix - 80, y: iy, id: 1 }]);
      await dispatch('touchEnd', []);
      await expect(touchPage.locator('#settings-panel-dialogue')).toBeVisible();
      await cdp.detach();
    } finally {
      await context.close();
    }
  });

  test('[REQ-381/AC-10] 375x450: tone create modal keeps Cancel and Save visible', async ({ page }) => {
    await openSettings(page, 375, 450, 'dialogue');
    await page.getByRole('button', { name: /プリセット追加/ }).click();
    const dialog = page.getByRole('dialog', { name: '新規口調プリセット作成', exact: true });
    await expect(dialog).toBeVisible();
    const diagnostic = await dialog.evaluate((el) => {
      const rect = (node: Element) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      const styleData = (node: Element) => {
        const style = getComputedStyle(node);
        return { tag: node.tagName, className: (node as HTMLElement).className, rect: rect(node),
          flexWrap: style.flexWrap, flexDirection: style.flexDirection, minWidth: style.minWidth,
          width: style.width, maxWidth: style.maxWidth, overflowX: style.overflowX };
      };
      const form = el.querySelector('form'); const backdrop = document.querySelector('.modal-backdrop');
      return { viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight,
        visualWidth: window.visualViewport?.width, visualHeight: window.visualViewport?.height },
        dialog: styleData(el), backdrop: backdrop ? styleData(backdrop) : null,
        form: form ? styleData(form) : null,
        formChildren: form ? Array.from(form.children).map(styleData) : Array.from(el.children).map(styleData) };
    });
    console.log('[REQ-381/AC-10] pre-fix 375x450 tone layout', JSON.stringify(diagnostic));
    await page.screenshot({ path: test.info().outputPath('REQ-381-tone-375x450.png'), fullPage: true,
      mask: [dialog.locator('input,textarea'), page.locator('#service-log-comfy')] });
    const cancel = dialog.getByRole('button', { name: 'キャンセル', exact: true });
    const save = dialog.getByRole('button', { name: '保存', exact: true });
    const cancelBox = await box(cancel); const saveBox = await box(save);
    const dialogBox = await box(dialog);
    console.log('[REQ-381/AC-10] 375x450 tone modal geometry', JSON.stringify({ viewport: { width: 375, height: 450 }, dialog: dialogBox, cancel: cancelBox, save: saveBox }));
    expect(cancelBox.x).toBeGreaterThanOrEqual(0); expect(saveBox.x).toBeGreaterThanOrEqual(0);
    expect(cancelBox.x + cancelBox.width).toBeLessThanOrEqual(375); expect(saveBox.x + saveBox.width).toBeLessThanOrEqual(375);
    expect(cancelBox.x).toBeLessThan(saveBox.x);
    expect(cancelBox.height).toBeGreaterThanOrEqual(44); expect(saveBox.height).toBeGreaterThanOrEqual(44);
    expect(cancelBox.y + cancelBox.height).toBeLessThanOrEqual(450); expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(450);
    await dialog.getByPlaceholder('例: ツンデレ風, お嬢様風', { exact: true }).fill('テスト口調');
    await dialog.locator('textarea[required]').fill('テスト用の指示');
    expect(putRequests(page)).toHaveLength(0);
    await save.click();
    await expect.poll(() => putRequests(page).filter((r) => r.path === '/speech-tone-presets').length).toBe(1);
  });

  test('[REQ-381/AC-10] 375px: tone edit Cancel keeps draft local until explicit Save', async ({ page }) => {
    await openSettings(page, 375, 812, 'dialogue');
    const section = page.getByTestId('speech-tone-presets-settings-section');
    await section.getByTitle('編集', { exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '口調プリセット編集', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder('例: ツンデレ風, お嬢様風', { exact: true }).fill('更新した口調');
    expect(putRequests(page).filter((r) => r.path === '/speech-tone-presets/17')).toHaveLength(0);
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    expect(putRequests(page).filter((r) => r.path === '/speech-tone-presets/17')).toHaveLength(0);
    await section.getByTitle('編集', { exact: true }).click();
    const editAgain = page.getByRole('dialog', { name: '口調プリセット編集', exact: true });
    await editAgain.getByPlaceholder('例: ツンデレ風, お嬢様風', { exact: true }).fill('更新した口調');
    await editAgain.getByRole('button', { name: '保存', exact: true }).click();
    await expect.poll(() => putRequests(page).filter((r) => r.path === '/speech-tone-presets/17').length).toBe(1);
    expect(putRequests(page).find((r) => r.path === '/speech-tone-presets/17')?.body).toMatchObject({ name: '更新した口調', prompt: '丁寧に話す' });
  });

  test('[REQ-381/AC-10] 375x812: simulated visualViewport keeps tone footer above the keyboard boundary', async ({ page }) => {
    await openSettings(page, 375, 812, 'dialogue');
    await page.getByRole('button', { name: /プリセット追加/ }).click();
    const dialog = page.getByRole('dialog', { name: '新規口調プリセット作成', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.locator('textarea[required]').focus();
    const viewport = await page.evaluate(() => {
      const visual = window.visualViewport;
      if (!visual) throw new Error('Chromium visualViewport is unavailable');
      Object.defineProperty(visual, 'height', { configurable: true, value: 450 });
      Object.defineProperty(visual, 'offsetTop', { configurable: true, value: 362 });
      visual.dispatchEvent(new Event('resize'));
      return { innerHeight: window.innerHeight, visualHeight: visual.height, visualOffset: visual.offsetTop };
    });
    expect(viewport.innerHeight).toBe(812);
    expect(viewport.visualHeight).toBe(450);
    const visibleBottom = viewport.visualOffset + viewport.visualHeight;
    const cancelButton = dialog.getByRole('button', { name: 'キャンセル', exact: true });
    const saveButton = dialog.getByRole('button', { name: '保存', exact: true });
    const dialogBox = await box(dialog); const cancelBox = await box(cancelButton); const saveBox = await box(saveButton);
    console.log('[REQ-381/AC-10] simulated visualViewport geometry', JSON.stringify({ viewport, visibleBottom, dialog: dialogBox, cancel: cancelBox, save: saveBox }));
    await expect.poll(async () => {
      const cancel = await cancelButton.boundingBox(); const save = await saveButton.boundingBox();
      return !!cancel && !!save && cancel.y >= viewport.visualOffset && save.y >= viewport.visualOffset
        && cancel.y + cancel.height <= visibleBottom && save.y + save.height <= visibleBottom;
    }, { timeout: 1500 }).toBe(true).catch(async () => {
      const geometry = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
        const backdrop = document.querySelector('.modal-backdrop') as HTMLElement | null;
        const styleData = (el: HTMLElement | null) => {
          if (!el) return null;
          const style = getComputedStyle(el); const rect = el.getBoundingClientRect();
          return { className: el.className, inlineStyle: el.getAttribute('style'), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            computed: { height: style.height, maxHeight: style.maxHeight, transform: style.transform, filter: style.filter, perspective: style.perspective, contain: style.contain, willChange: style.willChange } };
        };
        const ancestors: unknown[] = [];
        for (let el = dialog; el; el = el.parentElement) {
          const style = getComputedStyle(el); const rect = el.getBoundingClientRect();
          const vars = Array.from(style).filter((name) => name.startsWith('--') && /viewport|keyboard/i.test(name)).map((name) => [name, style.getPropertyValue(name)]);
          ancestors.push({ tag: el.tagName, className: el.className, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            scroll: { left: el.scrollLeft, top: el.scrollTop }, computed: { transform: style.transform, filter: style.filter,
              perspective: style.perspective, contain: style.contain, willChange: style.willChange }, vars });
        }
        const rootStyle = getComputedStyle(document.documentElement);
        const rootVars = Array.from(rootStyle).filter((name) => name.startsWith('--') && /viewport|keyboard/i.test(name)).map((name) => [name, rootStyle.getPropertyValue(name)]);
        return { viewport: { innerHeight: window.innerHeight, visualHeight: window.visualViewport?.height, visualOffset: window.visualViewport?.offsetTop },
          backdrop: styleData(backdrop), dialog: styleData(dialog), rootInlineStyle: document.documentElement.getAttribute('style'), rootVars, ancestors };
      });
      await page.screenshot({ path: test.info().outputPath('REQ-381-visual-viewport-failure.png'), mask: [page.locator('#service-log-comfy')] });
      throw new Error(`Tone footer outside simulated visualViewport: ${JSON.stringify(geometry)}`);
    });
    const settledCancel = await box(cancelButton); const settledSave = await box(saveButton);
    console.log('[REQ-381/AC-10] settled visualViewport geometry', JSON.stringify({ viewport, visibleBottom,
      dialog: await box(dialog), cancel: settledCancel, save: settledSave }));
    expect(settledCancel.x).toBeGreaterThanOrEqual(0); expect(settledSave.x).toBeGreaterThanOrEqual(0);
    expect(settledCancel.x + settledCancel.width).toBeLessThanOrEqual(375);
    expect(settledSave.x + settledSave.width).toBeLessThanOrEqual(375);
    await page.screenshot({ path: test.info().outputPath('REQ-381-tone-visual-viewport.png'), fullPage: true,
      mask: [dialog.locator('input,textarea'), page.locator('#service-log-comfy')] });
    expect(putRequests(page)).toHaveLength(0);
  });

  test('[REQ-381/AC-12] 767/768: resize preserves numeric draft without saving', async ({ page }) => {
    await openSettings(page, 767, 900, 'dialogue');
    const area = page.getByRole('spinbutton', { name: '最小面積 (min_area: 画素数)' });
    await area.fill('1250');
    await page.setViewportSize({ width: 768, height: 900 });
    await expect(area).toHaveValue('1250');
    expect(putRequests(page)).toHaveLength(0);
    await page.setViewportSize({ width: 1280, height: 900 });
    const save = page.locator('#settings-panel-dialogue').getByRole('button', { name: /保存/ }).first();
    await expect(save).toBeVisible();
    await save.click();
    await expect.poll(() => putRequests(page).filter((r) => r.path === '/llm-prompts/bubble_detection_params').length).toBe(1);
    const desktopPayload = (putRequests(page).find((r) => r.path === '/llm-prompts/bubble_detection_params')?.body as { content: string }).content;
    expect(JSON.parse(desktopPayload)).toMatchObject({ min_area: 1250 });
  });

  test('[REQ-381/AC-12] dirty native reload beforeunload Cancel keeps the latest draft', async ({ page }) => {
    await openSettings(page, 768, 900, 'prompt');
    const prompt = page.locator('#settings-panel-prompt');
    const details = prompt.getByRole('button', { name: 'プロンプト診断・生成の詳細設定', exact: true });
    if (await details.getAttribute('aria-expanded') === 'false') await details.click();
    const field = prompt.locator('#prompt-content-audit_interference');
    await field.click();
    await field.fill('');
    await field.pressSequentially('reload確認draft');
    await field.blur();
    await expect(field).toHaveValue('reload確認draft');
    await page.waitForLoadState('networkidle');
    const dirtyGesture = await page.evaluate(() => ({
      url: location.href,
      historyLength: history.length,
      hasBeenActive: navigator.userActivation.hasBeenActive,
    }));
    const nav = page.getByRole('navigation', { name: 'Primary navigation', exact: true });
    await nav.getByRole('link', { name: 'History', exact: true }).click();
    const guard = page.getByRole('dialog', { name: '未保存の設定', exact: true });
    await expect(guard).toBeVisible();
    await guard.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(page).toHaveURL(/\/settings#prompt$/);
    await expect(field).toHaveValue('reload確認draft');
    const cdp = await page.context().newCDPSession(page);
    const windowObject = await cdp.send('Runtime.evaluate', { expression: 'window' });
    const eventListeners = await cdp.send('DOMDebugger.getEventListeners', { objectId: windowObject.result.objectId });
    const beforeUnloadListenerCount = eventListeners.listeners.filter((listener: { type: string }) => listener.type === 'beforeunload').length;
    let beforeUnloadSeen = false;
    let dialogType: string | undefined;
    page.on('dialog', async (dialog) => {
      dialogType = dialog.type();
      if (dialog.type() === 'beforeunload') {
        beforeUnloadSeen = true;
        await dialog.dismiss();
      }
    });
    const reloadAttempt = page.reload({ timeout: 3000 }).catch(() => undefined);
    await Promise.race([reloadAttempt, new Promise((resolve) => setTimeout(resolve, 500))]);
    console.log('[REQ-381/AC-12] beforeunload diagnostic', JSON.stringify({
      dirtyGesture,
      beforeUnloadListenerCount,
      dialogType: dialogType ?? null,
      beforeUnloadSeen,
      urlAfterReloadAttempt: page.url(),
    }));
    expect(dirtyGesture.url).toMatch(/\/settings#prompt$/);
    expect(dirtyGesture.hasBeenActive).toBe(true);
    expect(beforeUnloadSeen).toBe(true);
    await expect(page).toHaveURL(/\/settings#prompt$/);
    await expect(field).toHaveValue('reload確認draft');
    expect(putRequests(page)).toHaveLength(0);
  });

  test('[REQ-381/AC-12] dirty POP Cancel after real Settings history navigation preserves draft', async ({ page }) => {
    await openSettings(page, 768, 900, 'prompt');
    const primaryNav = page.getByRole('navigation', { name: 'Primary navigation', exact: true });
    await primaryNav.getByRole('link', { name: 'History', exact: true }).click();
    await expect(page).toHaveURL(/\/history$/);
    await primaryNav.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings#workflows$/);
    await selectSettingsTab(page, 'prompt');
    const prompt = page.locator('#settings-panel-prompt');
    const details = prompt.getByRole('button', { name: 'プロンプト診断・生成の詳細設定', exact: true });
    if (await details.getAttribute('aria-expanded') === 'false') await details.click();
    const field = prompt.locator('#prompt-content-audit_interference');
    await field.fill('POP確認draft');
    await field.blur();
    await expect(field).toHaveValue('POP確認draft');
    await page.waitForLoadState('networkidle');
    const beforePop = await page.evaluate(() => ({ url: location.href, historyLength: history.length }));
    await page.goBack();
    const afterFirstPop = page.url();
    if (afterFirstPop.includes('#workflows')) await page.goBack();
    const guard = page.getByRole('dialog', { name: '未保存の設定', exact: true });
    await expect(guard).toBeVisible();
    await guard.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(page).toHaveURL(/\/settings#workflows$/);
    await expect(field).toHaveValue('POP確認draft');
    expect(beforePop.url).toMatch(/\/settings#prompt$/);
    expect(putRequests(page)).toHaveLength(0);
  });

  for (const outcome of [{ status: 200, label: 'success' }, { status: 503, label: 'failure' }]) {
    test(`[REQ-381/AC-12] in-flight Save ${outcome.label} keeps Leave disabled until settle without auto-navigation`, async ({ page }) => {
      await openSettings(page, 768, 900, 'prompt');
      const prompt = page.locator('#settings-panel-prompt');
      const details = prompt.getByRole('button', { name: 'プロンプト診断・生成の詳細設定', exact: true });
      if (await details.getAttribute('aria-expanded') === 'false') await details.click();
      await prompt.locator('#prompt-content-audit_interference').fill(`inflight ${outcome.label}`);
      let settleRequest!: () => void;
      let releaseRequest!: () => void;
      const requestStarted = new Promise<void>((resolve) => { settleRequest = resolve; });
      const responseGate = new Promise<void>((resolve) => { releaseRequest = resolve; });
      await page.route('**/api/llm-prompts/audit_interference', async (route) => {
        settleRequest();
        await responseGate;
        if (outcome.status === 200) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            id: 1, key: 'audit_interference', content: `inflight ${outcome.label}`, description: null, updated_at: SETTINGS_STAMP,
          }) });
        } else {
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'temporary failure' }) });
        }
      });
      await prompt.locator('#prompt-save-audit_interference').click();
      await requestStarted;
      const primaryNav = page.getByRole('navigation', { name: 'Primary navigation', exact: true });
      await primaryNav.getByRole('link', { name: 'History', exact: true }).click();
      const guard = page.getByRole('dialog', { name: '未保存の設定', exact: true });
      await expect(guard).toBeVisible();
      const leave = guard.getByRole('button', { name: '変更を破棄して移動', exact: true });
      await expect(leave).toBeDisabled();
      releaseRequest();
      if (outcome.status === 200) {
        await expect(prompt.locator('#prompt-save-audit_interference')).toHaveText(/保存済み|保存しました/);
      } else {
        await expect(prompt.getByRole('alert')).toBeVisible();
      }
      await expect(page).toHaveURL(/\/settings#prompt$/);
      await expect(leave).toBeVisible();
      await expect(leave).toBeEnabled();
    });
  }

  test('[REQ-381/AC-12] 768/1024/1280px: desktop layout, Settings hash history and History navigation work', async ({ page }) => {
    for (const width of [768, 1024, 1280]) {
      await openSettings(page, width, 900, 'workflows');
      const tabs = page.getByRole('tablist', { name: '設定カテゴリー' });
      await expect(tabs.getByRole('tab', { name: 'ワークフロー・モデル' })).toBeVisible();
      const workflow = await box(page.getByTestId('settings-card-workflow'));
      const mapping = await box(page.getByTestId('settings-card-mapping'));
      if (width === 1280) expect(workflow.x).toBeLessThan(mapping.x);
      expect(workflow.x + workflow.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: test.info().outputPath(`REQ-381-${width}.png`), fullPage: true });
    }
    await openSettings(page, 768, 900, 'workflows');
    await selectSettingsTab(page, 'prompt');
    await expect(page).toHaveURL(/#prompt$/);
    await selectSettingsTab(page, 'translation');
    await page.goBack();
    await expect(page.locator('#settings-panel-prompt')).toBeVisible();
    await page.goForward();
    await expect(page.locator('#settings-panel-translation')).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Primary navigation', exact: true });
    await nav.getByRole('link', { name: 'History', exact: true }).click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(nav.getByRole('link', { name: 'History', exact: true })).toHaveAttribute('aria-current', 'page');
    await openSettings(page, 768, 900, 'prompt');
    const prompt = page.locator('#settings-panel-prompt');
    const details = prompt.getByRole('button', { name: 'プロンプト診断・生成の詳細設定', exact: true });
    if (await details.getAttribute('aria-expanded') === 'false') await details.click();
    await prompt.locator('#prompt-type-select').selectOption('audit_interference');
    await prompt.locator('#prompt-content-audit_interference').fill('離脱確認draft');
    const navAgain = page.getByRole('navigation', { name: 'Primary navigation', exact: true });
    await navAgain.getByRole('link', { name: 'History', exact: true }).click();
    const guard = page.getByRole('dialog', { name: '未保存の設定', exact: true });
    await expect(guard).toBeVisible();
    await guard.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(page.locator('#prompt-content-audit_interference')).toHaveValue('離脱確認draft');
    await navAgain.getByRole('link', { name: 'History', exact: true }).click();
    const leaveGuard = page.getByRole('dialog', { name: '未保存の設定', exact: true });
    await leaveGuard.getByRole('button', { name: '変更を破棄して移動', exact: true }).click();
    await expect(page).toHaveURL(/\/history$/);
  });
});
