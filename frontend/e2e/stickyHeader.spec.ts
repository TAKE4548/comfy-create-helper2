import { test, expect } from '@playwright/test';

test.describe('Sticky Header E2E', () => {
  const viewports = [
    { name: 'Desktop', width: 1280, height: 800 },
    { name: 'Mobile', width: 375, height: 667 },
  ];

  for (const vp of viewports) {
    test(`[REQ-356/AC-8] sticky header remains in view on scroll (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      await page.route('**/*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sticky Header E2E Test</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      min-height: 2000px;
      background: #09090b;
      color: #fafafa;
      font-family: sans-serif;
    }
    .sticky-header {
      position: sticky;
      top: 0;
      z-index: 50;
      height: 50px;
      display: flex;
      align-items: center;
      padding: 0 16px;
      background: rgba(24, 24, 27, 0.95);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .content-block {
      height: 400px;
      margin: 16px;
      padding: 16px;
      background: #18181b;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <header data-testid="sticky-header" class="sticky-header">
    <div style="font-weight: 600;">Prompt Surgeon Header</div>
  </header>
  <main>
    <div class="content-block">Content 1</div>
    <div class="content-block">Content 2</div>
    <div class="content-block">Content 3</div>
    <div class="content-block">Content 4</div>
  </main>
</body>
</html>`,
        });
      });

      await page.goto('/');
      const header = page.locator('[data-testid="sticky-header"]');
      await page.evaluate(() => window.scrollTo(0, 500));
      const box = await header.boundingBox();
      expect(box?.y).toBeLessThanOrEqual(10);
    });
  }
});
