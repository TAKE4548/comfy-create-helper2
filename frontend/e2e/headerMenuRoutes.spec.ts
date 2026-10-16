import { test, expect, type Page, type Locator } from '@playwright/test';

const WORKFLOW_LIST = [{ id: 1, name: 'W1', created_at: '2026-01-01T00:00:00Z' }];
const WORKFLOW = {
  id: 1, name: 'W1', json_body: {}, mappings: [], target_base_model_id: null, created_at: '2026-01-01T00:00:00Z',
};
const VRAM = { vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 8, vram_total_gb: 12 };
const DESKTOP: [number, number][] = [[1280, 800], [1024, 768], [768, 1024]];
const MOBILE: [number, number][] = [[375, 667], [375, 360]];
type Vp = [number, number];

// Stub only backend API calls (pathname starts with /api/); Vite module requests are never stubbed.
async function stubApi(page: Page): Promise<void> {
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() !== 'GET') return json({});
    if (path === '/workflows') return json(WORKFLOW_LIST);
    if (path === '/workflows/1') return json(WORKFLOW);
    if (path === '/settings/vram') return json(VRAM);
    if (path === '/translate/dictionary') return json({ rules: [] });
    if (/\/(usages|status)$/.test(path) || /\/[0-9]+$/.test(path) || /settings|config|health/.test(path)) return json({});
    return json([]);
  });
}

async function openGenerate(page: Page, width: number, height: number): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('prompt-surgeon-workflow-id', '1'));
  await stubApi(page);
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await expect(page.locator('#workflow-actions-btn')).toBeVisible();
}

async function rect(loc: Locator) {
  await expect(loc).toBeVisible();
  const b = await loc.boundingBox();
  if (!b) throw new Error('no boundingBox');
  return b;
}

const headerRoot = (page: Page) => page.locator('[data-page-header-root]').first();

// Returns the element at a viewport point as a diagnostic string (class/testid) for failure messages.
async function describeAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return 'null';
    return `${el.tagName} id="${el.id}" class="${el.getAttribute('class') ?? ''}" testid="${el.getAttribute('data-testid') ?? ''}"`;
  }, [x, y]);
}

async function isInside(page: Page, x: number, y: number, containerSel: string): Promise<boolean> {
  return page.evaluate(([px, py, sel]) => {
    const el = document.elementFromPoint(px, py);
    return !!el?.closest(sel);
  }, [x, y, containerSel] as const);
}

async function openWorkflowMenu(page: Page): Promise<Locator> {
  await page.locator('#workflow-actions-btn').click();
  const menu = page.locator('[role="menu"]').first();
  await expect(menu).toBeVisible();
  return menu;
}

async function docScrollHeight(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollHeight);
}

type Snap = {
  vp: string; menus: number; hbBottom: number; panelY: number; trigBottom: number;
  lastHit: boolean; hit: string;
};

// Measures the workflow menu state at the current viewport (reveal scrolls the last item into its nearest view).
async function snap(page: Page, reveal: boolean): Promise<Snap> {
  const vp = page.viewportSize();
  const hb = await headerRoot(page).boundingBox();
  const tb = await page.locator('#workflow-actions-btn').boundingBox();
  const menus = await page.locator('[role="menu"]').count();
  let panelY = NaN;
  let lastHit = false;
  let hit = 'n/a';
  if (menus === 1) {
    panelY = (await page.locator('[role="menu"]').first().boundingBox())?.y ?? NaN;
    if (reveal) {
      const last = page.locator('#workflow-actions-rescan');
      await last.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
      const lb = await last.boundingBox();
      if (lb) {
        hit = await describeAt(page, lb.x + lb.width / 2, lb.y + lb.height / 2);
        lastHit = hit.includes('workflow-actions-rescan');
      }
    }
  }
  return {
    vp: `${vp?.width}x${vp?.height}`, menus, hbBottom: hb ? hb.y + hb.height : NaN,
    panelY, trigBottom: tb ? tb.y + tb.height : NaN, lastHit, hit,
  };
}

// Polls until the predicate holds (bounded ~3s) and returns the last measurement for failure messages.
async function settle(page: Page, ok: (s: Snap) => boolean, reveal = true): Promise<Snap> {
  let s = await snap(page, reveal);
  for (let i = 0; i < 30 && !ok(s); i++) {
    await page.waitForTimeout(100);
    s = await snap(page, reveal);
  }
  return s;
}

const followOk = (s: Snap) => s.menus === 1 && Math.abs(s.panelY - (s.hbBottom + 6)) <= 1;
const fmt = (v: unknown) => JSON.stringify(v);

test.describe('Header menu routes E2E (real Generate route)', () => {
  for (const [w, h] of [...DESKTOP, ...MOBILE]) {
    test(`[REQ-346/AC-1] Generate ${w}x${h}: workflow menu top is header bottom + 6px and does not overlap the header`, async ({ page }) => {
      await openGenerate(page, w, h);
      const header = await rect(headerRoot(page));
      const scrollBefore = await docScrollHeight(page);
      const menu = await openWorkflowMenu(page);
      const m = await rect(menu);
      console.log(`[AC-1 ${w}x${h}] top point: ${await describeAt(page, m.x + 10, m.y + 10)}`);
      expect(m.y, `menu.y=${m.y} header.bottom=${header.y + header.height}`).toBeGreaterThanOrEqual(header.y + header.height);
      expect(Math.abs(m.y - (header.y + header.height + 6)), `menu.y=${m.y} header.bottom=${header.y + header.height}`).toBeLessThanOrEqual(1);
      expect(await docScrollHeight(page)).toBeLessThanOrEqual(scrollBefore + 1);
    });
  }

  test('[REQ-346/AC-1] Generate 1280x800: kebab dropdown top is header bottom + 6px', async ({ page }) => {
    await openGenerate(page, 1280, 800);
    const header = await rect(headerRoot(page));
    await page.getByTestId('header-kebab-menu-button').click();
    const dd = await rect(page.getByTestId('header-kebab-dropdown'));
    expect(dd.y, await describeAt(page, dd.x + 10, dd.y + 10)).toBeGreaterThanOrEqual(header.y + header.height);
    expect(Math.abs(dd.y - (header.y + header.height + 6))).toBeLessThanOrEqual(1);
  });

  for (const [w, h] of [[375, 667], [639, 800]] as Vp[]) {
    test(`[REQ-346/AC-1] Generate ${w}x${h}: VRAM pill overlay sits below the wrapped header (header bottom + 6px)`, async ({ page }) => {
      await openGenerate(page, w, h);
      const header = await rect(headerRoot(page));
      await page.getByTestId('resource-hover-monitor').click();
      const ov = await rect(page.getByTestId('mobile-resource-overlay'));
      expect(ov.y, await describeAt(page, ov.x + 10, ov.y + 10)).toBeGreaterThanOrEqual(header.y + header.height);
      expect(Math.abs(ov.y - (header.y + header.height + 6))).toBeLessThanOrEqual(1);
    });
  }

  for (const dy of [20, 60]) {
    test(`[REQ-346/AC-1] Generate 375x360 (red team): open menu follows header bottom when the route scrolls ${dy}px`, async ({ page }) => {
      await openGenerate(page, 375, 360);
      await openWorkflowMenu(page);
      // Scroll the nearest scrollable ancestor of the header (Mobile root container); fall back to the document.
      const scroll = await page.evaluate((d: number) => {
        const hdr = document.querySelector('[data-page-header-root]');
        let el: Element | null = hdr?.parentElement ?? null;
        while (el && !(/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight)) {
          el = el.parentElement;
        }
        const sc: Element = el ?? document.scrollingElement!;
        const before = sc.scrollTop;
        sc.scrollBy(0, d);
        return { container: el ? el.className : 'document', before, after: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight };
      }, dy);
      expect(scroll.after - scroll.before, fmt(scroll)).toBe(dy);
      const s = await settle(page, (x) => followOk(x) || (x.menus === 0 && x.trigBottom < 0), false);
      if (s.menus === 0) {
        expect(s.trigBottom, `menu closed while trigger still on screen; ${fmt({ scroll, s })}`).toBeLessThan(0);
      } else {
        expect(Math.abs(s.panelY - (s.hbBottom + 6)), `menu floated away from header; ${fmt({ scroll, s })}`).toBeLessThanOrEqual(1);
      }
    });
  }

  test('[REQ-346/AC-2] Generate 1280x800: clicking 名前を変更 below the header runs the action and closes the menu', async ({ page }) => {
    await openGenerate(page, 1280, 800);
    const header = await rect(headerRoot(page));
    const menu = await openWorkflowMenu(page);
    const item = menu.getByText('名前を変更').first();
    const ib = await rect(item);
    expect(ib.y).toBeGreaterThan(header.y + header.height);
    await item.click();
    await expect(menu).toBeHidden();
  });

  test('[REQ-346/AC-3] Generate 375x360: last item (ノード再スキャン) is reachable', async ({ page }) => {
    await openGenerate(page, 375, 360);
    const menu = await openWorkflowMenu(page);
    const panel = await rect(menu);
    expect(panel.y + panel.height, 'panel must fit within maxHeight').toBeLessThanOrEqual(360 - 8 + 0.5);
    const last = page.locator('#workflow-actions-rescan');
    await last.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
    const lb = await rect(last);
    const cx = lb.x + lb.width / 2;
    const cy = lb.y + lb.height / 2;
    expect(await describeAt(page, cx, cy), 'last item must not be covered').toContain('workflow-actions-rescan');
    await last.click({ trial: true });
  });

  test('[REQ-346/AC-5] Generate 1280x800: kebab dropdown stays inside viewport and not covered', async ({ page }) => {
    await openGenerate(page, 1280, 800);
    await page.getByTestId('header-kebab-menu-button').click();
    const dd = await rect(page.getByTestId('header-kebab-dropdown'));
    const x = dd.x + 10;
    const y = dd.y + 10;
    expect(dd.y + dd.height).toBeLessThanOrEqual(800);
    expect(await isInside(page, x, y, '[data-testid="header-kebab-dropdown"]'), await describeAt(page, x, y)).toBe(true);
    const settingsLink = page.getByTestId('header-settings-link');
    const sb = await rect(settingsLink);
    expect(await isInside(page, sb.x + sb.width / 2, sb.y + sb.height / 2, '[data-testid="header-kebab-dropdown"]'),
      await describeAt(page, sb.x + sb.width / 2, sb.y + sb.height / 2)).toBe(true);
  });

  test('[REQ-346/AC-5] Generate 375x667: VRAM overlay stays inside the viewport and its last control is not covered by bottom navigation', async ({ page }) => {
    await openGenerate(page, 375, 667);
    await page.getByTestId('resource-hover-monitor').click();
    const ov = await rect(page.getByTestId('mobile-resource-overlay'));
    const ovSel = '[data-testid="mobile-resource-overlay"]';
    expect(ov.x >= 0 && ov.y >= 0 && ov.x + ov.width <= 375 && ov.y + ov.height <= 667,
      `overlay rect=${fmt(ov)} viewport=375x667`).toBe(true);
    expect(await isInside(page, ov.x + 10, ov.y + 10, ovSel), await describeAt(page, ov.x + 10, ov.y + 10)).toBe(true);
    const lastCtl = await rect(page.getByTestId('mobile-resource-overlay').locator('button, a, [role="button"]').last());
    const cx = lastCtl.x + lastCtl.width / 2;
    const cy = lastCtl.y + lastCtl.height / 2;
    expect(await isInside(page, cx, cy, ovSel), `last control rect=${fmt(lastCtl)} hit=${await describeAt(page, cx, cy)}`).toBe(true);
  });

  for (const [from, to] of [[[1280, 800], [1024, 768]], [[700, 900], [375, 667]], [[375, 667], [375, 360]]] as [Vp, Vp][]) {
    test(`[REQ-346/AC-6] Generate (same layout): resize while workflow menu is open keeps it open and last item reachable @${from}->${to}`, async ({ page }) => {
      await openGenerate(page, from[0], from[1]);
      await openWorkflowMenu(page);
      const before = await snap(page, true);
      await page.setViewportSize({ width: to[0], height: to[1] });
      const s = await settle(page, (x) => followOk(x) && x.lastHit);
      const ctx = fmt({ from, to, before, after: s });
      expect(s.menus, `same-layout resize closed the menu (regression); ${ctx}`).toBe(1);
      expect(Math.abs(s.panelY - (s.hbBottom + 6)), `menu not at header bottom + 6px; ${ctx}`).toBeLessThanOrEqual(1);
      expect(s.lastHit, `last item not hit-testable; ${ctx}`).toBe(true);
      await page.locator('#workflow-actions-rescan').click({ trial: true });
    });
  }

  for (const [from, to] of [[[1280, 800], [375, 360]], [[375, 667], [1280, 800]]] as [Vp, Vp][]) {
    test(`[REQ-346/AC-6] Generate (layout boundary 768px): crossing the boundary closes the menu and re-opening makes the last item reachable @${from}->${to}`, async ({ page }) => {
      await openGenerate(page, from[0], from[1]);
      await openWorkflowMenu(page);
      await page.setViewportSize({ width: to[0], height: to[1] });
      await expect(page.locator('#workflow-actions-btn')).toBeVisible();
      const closed = await settle(page, (x) => x.menus === 0, false);
      expect(closed.menus, `boundary crossing left a menu open (unexpected; design HEO-7/T-17); ${fmt({ from, to, closed })}`).toBe(0);
      await openWorkflowMenu(page);
      const s = await settle(page, (x) => followOk(x) && x.lastHit);
      const ctx = fmt({ from, to, reopened: s });
      expect(s.menus, `re-open failed; ${ctx}`).toBe(1);
      expect(Math.abs(s.panelY - (s.hbBottom + 6)), `re-opened menu not at header bottom + 6px; ${ctx}`).toBeLessThanOrEqual(1);
      expect(s.lastHit, `last item not hit-testable after re-open; ${ctx}`).toBe(true);
      await page.locator('#workflow-actions-rescan').click({ trial: true });
    });
  }

  test('[REQ-346/AC-4] Generate 1280x800: toggling the trigger twice closes the menu', async ({ page }) => {
    await openGenerate(page, 1280, 800);
    const menu = await openWorkflowMenu(page);
    await page.locator('#workflow-actions-btn').click();
    await expect(menu).toBeHidden();
  });

  for (const [w, h] of DESKTOP) {
    test(`[REQ-346/AC-5] Generate Desktop ${w}x${h}: A4 hover card is not covered by the preset tab bar`, async ({ page }) => {
      await openGenerate(page, w, h);
      const header = await rect(headerRoot(page));
      await expect(page.locator('#desktop-preset-tabs-bar')).toBeVisible();
      await page.getByTestId('resource-hover-monitor').hover();
      const card = await rect(page.getByTestId('resource-hover-card'));
      expect(card.y + card.height, `card.bottom=${card.y + card.height} header.bottom=${header.y + header.height}`).toBeGreaterThan(header.y + header.height);
      const hit = await describeAt(page, card.x + 10, card.y + 10);
      expect(await isInside(page, card.x + 10, card.y + 10, '[data-testid="resource-hover-card"]'), `hit=${hit}`).toBe(true);
    });
  }

  test('[REQ-346/AC-5] Generate 700x900 (wrapped header): A4 card top is header bottom + 6px and the hover bridge carries the pointer', async ({ page }) => {
    await openGenerate(page, 700, 900);
    const header = await rect(headerRoot(page));
    const hb = header.y + header.height;
    const mon = page.getByTestId('resource-hover-monitor');
    await mon.hover();
    const card = await rect(page.getByTestId('resource-hover-card'));
    const t = await rect(mon);
    const tb = t.y + t.height;
    expect(Math.abs(card.y - (hb + 6)), `card.y=${card.y} header.bottom=${hb} hit=${await describeAt(page, card.x + 10, card.y + 10)}`).toBeLessThanOrEqual(1);
    console.log(`[AC-5 700x900] trigger.bottom=${tb} card.top=${card.y} gap=${card.y - tb}`);
    await page.mouse.move(card.x + card.width / 2, card.y + 12, { steps: 20 });
    await expect(page.getByTestId('resource-hover-card'), 'card must stay open while pointer crosses the bridge').toBeVisible();
    await expect(page.locator('[data-header-menu-bridge]'), 'bridge count').toHaveCount(1);
    const mx = t.x + t.width / 2;
    const my = (tb + card.y) / 2;
    expect(await isInside(page, mx, my, '[data-header-menu-bridge]'), `bridge midpoint hit=${await describeAt(page, mx, my)}`).toBe(true);
    await page.mouse.move(5, 895, { steps: 10 });
    await expect(page.getByTestId('resource-hover-card'), 'card must close after leaving').toBeHidden();
  });

  test('[REQ-346/AC-5] Generate 375x667: A4 hover card is not shown and no hover bridge exists (A3 pill covers mobile)', async ({ page }) => {
    await openGenerate(page, 375, 667);
    await page.getByTestId('resource-hover-monitor').hover();
    await expect(page.getByTestId('resource-hover-card')).toBeHidden();
    await expect(page.locator('[data-header-menu-bridge]')).toHaveCount(0);
  });
});
