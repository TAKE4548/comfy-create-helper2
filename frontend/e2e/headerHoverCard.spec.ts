import { expect, test, type Locator, type Page } from '@playwright/test';

const VRAM = { vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 8, vram_total_gb: 12 };
const VIEWPORTS = [
  { w: 640, h: 800 },
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
  { w: 1280, h: 800 },
];
const HEADER = '[data-page-header-root]';
const MONITOR = '[data-testid="resource-hover-monitor"]';
const CARD = '[data-testid="resource-hover-card"]';
const BRIDGE = '[data-testid="resource-hover-card-bridge"]';
const PANEL = '[data-header-menu-panel]';
const FREE_BTN = '[data-testid="resource-free-memory-button"]';

const MANAGER_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}
const MANAGER_IDLE = {
  fe: { running: true, status: 'running' },
  be: { running: true, status: 'running' },
  comfy: { running: true, status: 'LISTEN', execution_state: 'idle', queue_running: 0, queue_pending: 0 },
  action_in_progress: null,
}
const FREE_ACCEPTED = { status: 'ok', action: 'free-memory', outcome: 'accepted' }
interface ManagerStub {
  posts: number
  release: () => void
}
interface ManagerOptions {
  status?: unknown
  post?: 'ok' | '504' | 'abort' | 'hold'
  postDelayMs?: number
}

/** Registered after stubApi so it wins for the Manager origin (port 8899). Counts free-memory POSTs. status 'abort' drops the connection. */
async function stubManager(page: Page, o: ManagerOptions = {}): Promise<ManagerStub> {
  let open!: () => void
  const gate = new Promise<void>((resolve) => { open = resolve })
  const state: ManagerStub = { posts: 0, release: () => open() }
  await page.route((url) => url.port === '8899', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: MANAGER_CORS })
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, headers: MANAGER_CORS, contentType: 'application/json', body: JSON.stringify(body) })
    if (req.method() === 'POST') {
      state.posts += 1
      const mode = o.post ?? 'ok'
      if (mode === 'abort') return route.abort('failed')
      if (mode === 'hold') await gate
      if (o.postDelayMs) await new Promise((r) => setTimeout(r, o.postDelayMs))
      return mode === '504' ? json(504, {}) : json(200, FREE_ACCEPTED)
    }
    if (o.status === 'abort') return route.abort('failed')
    return json(200, o.status ?? MANAGER_IDLE)
  })
  return state
}

async function stubApi(page: Page): Promise<void> {
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() !== 'GET') return json({});
    if (path === '/settings/vram') return json(VRAM);
    if (path === '/translate/dictionary') return json({ rules: [] });
    if (/\/(usages|status)$/.test(path) || /\/[0-9]+$/.test(path) || /settings|config|health/.test(path)) return json({});
    return json([]);
  });
}

async function openSettings(page: Page, w: number, h: number, manager?: ManagerOptions, hash = 'workflows'): Promise<ManagerStub> {
  await stubApi(page);
  const stub = await stubManager(page, manager);
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`/settings#${hash}`);
  await expect(page.locator('h1').filter({ hasText: 'Settings' })).toBeVisible();
  return stub;
}

async function box(loc: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await loc.boundingBox();
  if (!b) throw new Error('element has no bounding box');
  return b;
}

async function headerBottom(page: Page): Promise<number> {
  const b = await box(page.locator(HEADER).first());
  return b.y + b.height;
}

async function leave(page: Page): Promise<void> {
  const vp = page.viewportSize();
  if (!vp) throw new Error('no viewport');
  await page.mouse.move(5, vp.height - 5);
}

async function hoverMonitor(page: Page): Promise<void> {
  await leave(page);
  await page.locator(MONITOR).hover();
}

async function layoutSnapshot(page: Page) {
  const header = (await box(page.locator(HEADER).first())).height;
  const dims = await page.evaluate(() => ({
    html: document.documentElement.scrollHeight,
    body: document.body.scrollHeight,
  }));
  return { header, ...dims };
}

async function cardMetrics(card: Locator) {
  return card.evaluate((n) => {
    const el = n as HTMLElement;
    return {
      maxH: parseFloat(el.style.maxHeight),
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
      scrollTop: el.scrollTop,
    };
  });
}

async function pointInside(loc: Locator, dx: number, dy: number): Promise<{ ok: boolean; hit: string }> {
  return loc.evaluate((node, d) => {
    const r = node.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + d.dx, r.top + d.dy);
    return {
      ok: !!el && (el === node || node.contains(el)),
      hit: el ? `${el.tagName} testid=${el.getAttribute('data-testid')} class=${el.getAttribute('class')}`.slice(0, 200) : 'null',
    };
  }, { dx, dy });
}

for (const v of VIEWPORTS) {
  const tag = `@${v.w}x${v.h}`;

  test(`[REQ-346/AC-1] A4 hover card opens below the header bottom without pushing the layout ${tag}`, async ({ page }) => {
    await openSettings(page, v.w, v.h);
    await leave(page);
    const before = await layoutSnapshot(page);
    await hoverMonitor(page);
    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    const after = await layoutSnapshot(page);
    for (const k of ['header', 'html', 'body'] as const) {
      expect(Math.abs(after[k] - before[k]), `layout ${k} changed`).toBeLessThanOrEqual(1);
    }
    const c = await box(card);
    const m = await box(page.locator(MONITOR));
    const hb = await headerBottom(page);
    expect(c.y, 'card top must be below monitor bottom').toBeGreaterThanOrEqual(m.y + m.height);
    expect(Math.abs(c.y - (hb + 6)), `card y=${c.y} header bottom=${hb}`).toBeLessThanOrEqual(1);
    expect(c.y + c.height).toBeGreaterThan(hb);
    expect(await card.evaluate((n) => n.parentElement === document.body)).toBe(true);
  });

  test(`[REQ-346/AC-2] A4 hover continuity: moving the real pointer from the monitor through the gap into the card keeps it open ${tag}`, async ({ page }) => {
    await openSettings(page, v.w, v.h);
    await hoverMonitor(page);
    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    const c = await box(card);
    const m = await box(page.locator(MONITOR));
    const cx = c.x + c.width / 2;
    await page.mouse.move(Math.min(Math.max(cx, m.x + 1), m.x + m.width - 1), m.y + m.height - 2);
    await page.mouse.move(cx, c.y + 12, { steps: 15 });
    await expect(card).toBeVisible();
    await expect(card.getByText('GPU:').first()).toBeVisible();
    await page.mouse.wheel(0, 40);
    await expect(card).toBeVisible();
    const bridge = await box(page.locator(BRIDGE));
    expect(Math.abs(bridge.y - (m.y + m.height)), `bridge top=${bridge.y}`).toBeLessThanOrEqual(1);
    expect(bridge.y + bridge.height).toBeGreaterThanOrEqual(c.y);
    expect(Math.abs(bridge.x - m.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(bridge.x + bridge.width - (m.x + m.width))).toBeLessThanOrEqual(1);
    const mid = { x: m.x + m.width / 2, y: (m.y + m.height + c.y) / 2 };
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return {
        isBridge: !!el && !!el.closest('[data-testid="resource-hover-card-bridge"]'),
        desc: el ? `${el.tagName} testid=${el.getAttribute('data-testid')} class=${el.getAttribute('class')}` : 'null',
      };
    }, mid);
    expect(hit.isBridge, `gap midpoint hit: ${hit.desc}`).toBe(true);
  });

  test(`[REQ-346/AC-4] A4 closes when the pointer leaves, when pressing outside, and has no click toggle ${tag}`, async ({ page }) => {
    await openSettings(page, v.w, v.h);
    const card = page.locator(CARD);
    await hoverMonitor(page);
    await expect(card).toBeVisible();
    await leave(page);
    await expect(card).toBeHidden();
    await hoverMonitor(page);
    await expect(card).toBeVisible();
    await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await expect(card).toBeHidden();
    await hoverMonitor(page);
    await expect(card).toBeVisible();
    await page.locator(MONITOR).click();
    await expect(card).toBeVisible();
  });

  test(`[REQ-346/AC-5] A4 hover card stays inside the viewport and is not covered ${tag}`, async ({ page }) => {
    await openSettings(page, v.w, v.h);
    await hoverMonitor(page);
    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    expect(await card.evaluate((n) => n.hasAttribute('role'))).toBe(false);
    await expect(card.locator(':scope > [role="group"][aria-label="リソース詳細"]')).toHaveCount(1);
    const c = await box(card);
    const vp = page.viewportSize();
    if (!vp) throw new Error('no viewport');
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(vp.width);
    expect(c.y + c.height).toBeLessThanOrEqual(vp.height);
    const corner = await pointInside(card, 10, 10);
    expect(corner.ok, `corner hit: ${corner.hit}`).toBe(true);
    const center = await pointInside(card, c.width / 2, c.height / 2);
    expect(center.ok, `center hit: ${center.hit}`).toBe(true);
  });

  test(`[REQ-412/AC-1] the real pointer moves from the monitor through the bridge to the free-memory button and it is pressable ${tag}`, async ({ page }) => {
    const manager = await openSettings(page, v.w, v.h);
    await hoverMonitor(page);
    const card = page.locator(CARD);
    await expect(card).toBeVisible();
    const button = page.locator(FREE_BTN);
    await expect(button).toBeEnabled();
    const m = await box(page.locator(MONITOR));
    const b = await box(button);
    await page.mouse.move(m.x + m.width / 2, m.y + m.height - 2);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
    await expect(card).toBeVisible();
    const hit = await pointInside(button, b.width / 2, b.height / 2);
    expect(hit.ok, `button hit: ${hit.hit}`).toBe(true);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => manager.posts).toBe(1);
    await expect(card).toBeVisible();
  });
}

test('[REQ-346/AC-3] A4 hover card scrolls inside the viewport-capped height and the last row is reachable @1024x768', async ({ page }) => {
  await openSettings(page, 1024, 768);
  const hb = await headerBottom(page);
  let H = Math.ceil(hb + 6 + 100 + 8);
  await page.setViewportSize({ width: 1024, height: H });
  await hoverMonitor(page);
  const card = page.locator(CARD);
  await expect(card).toBeVisible();
  let m = await cardMetrics(card);
  while (m.scrollH <= m.clientH && m.maxH - 10 >= 96) {
    H -= 10;
    await page.setViewportSize({ width: 1024, height: H });
    await hoverMonitor(page);
    await expect(card).toBeVisible();
    m = await cardMetrics(card);
  }
  expect(m.maxH, `maxHeight at H=${H}`).toBeGreaterThanOrEqual(96);
  expect(m.maxH).toBeLessThanOrEqual(101);
  expect(m.scrollH, `scrollHeight vs clientHeight at H=${H}`).toBeGreaterThan(m.clientH);
  const c = await box(card);
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.wheel(0, 400);
  await expect.poll(async () => (await cardMetrics(card)).scrollTop).toBeGreaterThan(0);
  await expect(card).toBeVisible();
  const gpu = await box(card.getByText('GPU:').first());
  expect(gpu.y).toBeGreaterThanOrEqual(0);
  expect(gpu.y + gpu.height).toBeLessThanOrEqual(H);
  const inside = await pointInside(card, c.width / 2, c.height / 2);
  expect(inside.ok, `hit inside card: ${inside.hit}`).toBe(true);
});

test('[REQ-346/AC-6] A4 recomputes after resize while hovered and is hidden below 640px @1280x800', async ({ page }) => {
  await openSettings(page, 1280, 800);
  const card = page.locator(CARD);
  await hoverMonitor(page);
  await expect(card).toBeVisible();
  for (const [w, h] of [[800, 400], [1024, 768]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await hoverMonitor(page);
    await expect(card).toBeVisible();
    const c = await box(card);
    const maxH = (await cardMetrics(card)).maxH;
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(w);
    expect(c.y + c.height).toBeLessThanOrEqual(h);
    expect(Math.abs(maxH - (h - c.y - 8)), `maxHeight=${maxH} at ${w}x${h}`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 639, height: 667 });
  await hoverMonitor(page);
  await expect(card).toBeHidden();
  await expect(page.locator(`${PANEL}:visible`)).toHaveCount(0);
});

test('[REQ-346/AC-1] A4 is not shown at 639px (A3 pill is responsible) @639x667', async ({ page }) => {
  await openSettings(page, 639, 667);
  await hoverMonitor(page);
  await expect(page.locator(CARD)).toBeHidden();
  await expect(page.locator('[data-header-menu-bridge]')).toHaveCount(0);
  await expect(page.getByTestId('mobile-vram-pill')).toBeVisible();
});

test('[REQ-346/AC-3] A4 auto-closes when the remaining height is below 96px @1024x768', async ({ page }) => {
  await openSettings(page, 1024, 768);
  const hb = await headerBottom(page);
  await page.setViewportSize({ width: 1024, height: Math.ceil(hb + 6 + 90 + 8) });
  await hoverMonitor(page);
  await expect(page.locator(CARD)).toBeHidden();
});

test('[REQ-346/AC-4] rapid hover in/out ten times leaves no orphan panel @1024x768', async ({ page }) => {
  await openSettings(page, 1024, 768);
  const vp = page.viewportSize();
  if (!vp) throw new Error('no viewport');
  for (let i = 0; i < 10; i++) {
    await page.locator(MONITOR).hover();
    await page.mouse.move(5, vp.height - 5);
  }
  await expect(page.locator(PANEL)).toHaveCount(0);
  await hoverMonitor(page);
  await expect(page.locator(CARD)).toBeVisible();
  expect(await page.locator(PANEL).count()).toBeLessThanOrEqual(1);
});

test('[REQ-346/AC-4] opening the header menu while the A4 card is open leaves only one body-level panel @1024x768', async ({ page }) => {
  await openSettings(page, 1024, 768);
  await hoverMonitor(page);
  await expect(page.locator(CARD)).toBeVisible();
  await page.getByTestId('header-kebab-menu-button').click();
  await expect(page.locator(PANEL)).toHaveCount(1);
});

const ACCEPTED_TEXT = '解放要求を受け付けました。空き容量は監視値で確認してください';

test('[REQ-412/AC-3][REQ-412/AC-4] idle request is sent once, the button is busy until confirmation, and acceptance wording is shown @1280x800', async ({ page }) => {
  const manager = await openSettings(page, 1280, 800, { post: 'ok', postDelayMs: 800 });
  await hoverMonitor(page);
  const button = page.locator(FREE_BTN);
  await expect(button).toBeEnabled();
  await button.dblclick();
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByTestId('resource-free-memory-status')).toHaveText(ACCEPTED_TEXT);
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('resource-free-memory-status')).not.toHaveText(/完了|解放しました/);
  expect(manager.posts).toBe(1);
});

test('[REQ-412/AC-5] executing, queued and unreachable Manager disable the button with a reason @1280x800', async ({ page }) => {
  const cases = [
    { status: { ...MANAGER_IDLE, comfy: { running: true, status: 'LISTEN', execution_state: 'executing', queue_running: 1, queue_pending: 0 } }, reason: 'ComfyUIで生成中です。' },
    { status: { ...MANAGER_IDLE, comfy: { running: true, status: 'LISTEN', execution_state: 'idle', queue_running: 0, queue_pending: 2 } }, reason: 'ComfyUIのキューが空ではありません。' },
    { status: 'abort' as const, reason: 'Manager状態を確認できません。' },
  ];
  for (const c of cases) {
    const manager = await openSettings(page, 1280, 800, { status: c.status });
    await hoverMonitor(page);
    await expect(page.locator(FREE_BTN)).toBeDisabled();
    await expect(page.getByTestId('resource-free-memory-reason')).toHaveText(c.reason);
    await page.locator(FREE_BTN).click({ force: true });
    expect(manager.posts).toBe(0);
  }
});

test('[REQ-412/AC-6] HTTP 504 and a dropped connection show 要求結果未確認 without resending @1280x800', async ({ page }) => {
  for (const post of ['504', 'abort'] as const) {
    const manager = await openSettings(page, 1280, 800, { post });
    await hoverMonitor(page);
    const button = page.locator(FREE_BTN);
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.getByTestId('resource-free-memory-status')).toContainText('要求結果未確認');
    await expect(button).toBeEnabled();
    await page.waitForTimeout(500);
    expect(manager.posts, `POST count for ${post}`).toBe(1);
  }
});

test('[REQ-412/AC-7] on a short viewport the card scrolls internally and the free-memory button is reachable at header + 6px @1024x768', async ({ page }) => {
  await openSettings(page, 1024, 768);
  const hb = await headerBottom(page);
  const H = Math.ceil(hb + 6 + 200 + 8);
  await page.setViewportSize({ width: 1024, height: H });
  await hoverMonitor(page);
  const card = page.locator(CARD);
  await expect(card).toBeVisible();
  const c = await box(card);
  expect(Math.abs(c.y - (hb + 6)), `card y=${c.y} header bottom=${hb}`).toBeLessThanOrEqual(1);
  const m = await cardMetrics(card);
  expect(m.scrollH, `scrollHeight vs clientHeight at H=${H}`).toBeGreaterThan(m.clientH);
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await card.evaluate((n) => { (n as HTMLElement).scrollTop = (n as HTMLElement).scrollHeight; });
  await expect(card).toBeVisible();
  const button = page.locator(FREE_BTN);
  const b = await box(button);
  expect(b.y).toBeGreaterThanOrEqual(c.y);
  expect(b.y + b.height).toBeLessThanOrEqual(Math.min(c.y + c.height, H));
  const hit = await pointInside(button, b.width / 2, b.height / 2);
  expect(hit.ok, `button hit: ${hit.hit}`).toBe(true);
  await button.click({ trial: true });
});

test('[REQ-412/AC-1] leaving the card from the disabled button closes the card @1280x800', async ({ page }) => {
  const manager = await openSettings(page, 1280, 800, { status: 'abort' });
  await hoverMonitor(page);
  const card = page.locator(CARD);
  await expect(card).toBeVisible();
  const button = page.locator(FREE_BTN);
  await expect(button).toBeDisabled();
  const b = await box(button);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await expect(card).toBeVisible();
  await leave(page);
  await expect(card).toBeHidden();
  expect(manager.posts).toBe(0);
});

test('[REQ-412/AC-3] a header request while Settings is already sending is not sent twice @1280x800', async ({ page }) => {
  const manager = await openSettings(page, 1280, 800, { post: 'hold' }, 'system');
  const settingsButton = page.getByRole('button', { name: 'ComfyUIのメモリ解放' });
  await expect(settingsButton).toBeEnabled();
  await settingsButton.click();
  await expect.poll(() => manager.posts).toBe(1);
  await hoverMonitor(page);
  const headerButton = page.locator(FREE_BTN);
  await expect(headerButton).toBeDisabled();
  await headerButton.click({ force: true });
  expect(manager.posts).toBe(1);
  manager.release();
  await expect(page.getByTestId('resource-free-memory-status')).toHaveText(ACCEPTED_TEXT);
  await expect(headerButton).toBeEnabled();
  expect(manager.posts).toBe(1);
});
