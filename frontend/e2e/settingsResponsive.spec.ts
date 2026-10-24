import { test, expect, type Page, type Locator } from '@playwright/test';
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
      { id: 21, stage_id: 1, param_name: 'seed', title_patterns: null },
      { id: 22, stage_id: 2, param_name: 'noise_seed', title_patterns: null },
    ],
  },
  {
    id: 3, group_id: null, base_key: 'steps', name: 'Steps', param_name: 'steps', input_type: 'int',
    expected_class_types: ['KSampler'], base_title_patterns: null, sort_order: 3, variants: [],
  },
];
const MASTER_CARD = '.settings-mobile-card:has(.settings-mobile-card__target-node)';
const VRAM = { vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 8, vram_total_gb: 12 };

let managerProcess: ChildProcessWithoutNullStreams;
let managerUrl = '';
let managerControlUrl = '';
let managerOutput = '';

async function startManagerSandbox(): Promise<void> {
  managerProcess = spawn(resolve(process.cwd(), '../backend/.venv/Scripts/python.exe'),
    [resolve(process.cwd(), '../tests/support/server_manager_sandbox.py')],
    { cwd: resolve(process.cwd(), '..'), stdio: 'pipe' });
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('Manager sandbox startup timed out: ' + managerOutput)), 10000);
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
      reject(new Error('Manager sandbox exited before startup (' + code + '): ' + managerOutput));
    });
  });
}

async function setManagerState(value: object): Promise<void> {
  const response = await fetch(managerControlUrl + '/control/state', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error('Manager sandbox state returned ' + response.status);
}

test.beforeAll(async () => { await startManagerSandbox(); });
test.afterAll(async () => {
  if (managerProcess && managerProcess.exitCode === null) {
    await fetch(managerControlUrl + '/control/shutdown', { method: 'POST', body: '{}' });
    await new Promise<void>((resolveExit) => managerProcess.once('exit', () => resolveExit()));
  }
});


// Stub only backend API calls (pathname starts with /api/); never Vite module requests like /src/api/*.
async function stubApi(page: Page): Promise<void> {
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() !== 'GET') return json({});
    if (path === '/mapping-masters') return json(MASTERS);
    if (path === '/settings/vram') return json(VRAM);
    if (path === '/translate/dictionary') return json({ rules: [] });
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

async function box(loc: Locator) {
  await expect(loc).toBeVisible();
  const b = await loc.boundingBox();
  if (!b) throw new Error('no boundingBox');
  return b;
}

test.describe('Settings responsive E2E', () => {
  test('[REQ-380/AC-1] 375/767/768/1280px: memory action stays visible and reachable', async ({ page }) => {
    test.setTimeout(30_000);
    await setManagerState({ running: [], pending: [], free_delay: 0, free_status: 200, queue_mode: 'normal', comfy_stopped: false });
    await stubApi(page);
    await page.route(
      (url) => url.hostname === 'localhost' && url.port === '8899' && url.pathname.startsWith('/api/'),
      async (route) => {
        const originalUrl = new URL(route.request().url());
        const destination = new URL(originalUrl.pathname + originalUrl.search, managerUrl);
        const response = await route.fetch({ url: destination.href });
        await route.fulfill({ response });
      },
    );
    for (const width of [375, 767, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/settings#system');
      await expect(page.locator('#settings-panel-system')).toBeVisible();
      const button = page.getByRole('button', { name: 'ComfyUIのメモリ解放', exact: true });
      await expect(button).toBeVisible();
      const bounds = await button.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      if (width === 375) {
        await button.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('status').filter({ hasText: /受け付けました/ })).toBeVisible();
      }
    }
  });

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
    await page.getByRole('button', { name: 'カスタム型マスタ', exact: true }).click();
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

  const SHEET_TARGETS = [
    {
      name: 'stage manager',
      dialogName: /ステージ管理/,
      open: (page: Page) => page.getByRole('button', { name: /ステージ管理/ }).click(),
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
      open: (page: Page) => page.getByRole('button', { name: 'カスタム型マスタ', exact: true }).click(),
    },
    {
      name: 'param type create',
      hash: 'workflows',
      dialogName: /カスタム型マスター作成/,
      open: async (page: Page) => {
        await page.getByRole('button', { name: 'カスタム型マスタ', exact: true }).click();
        await page.getByRole('dialog', { name: /カスタム型マスタ管理/ }).getByRole('button', { name: /新規型を作成/ }).click();
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
});
