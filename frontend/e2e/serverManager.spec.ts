import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

type Sandbox = { manager_url: string; control_url: string };
let sandboxProcess: ChildProcessWithoutNullStreams;
let sandbox: Sandbox;
let firstOutput = '';

async function startSandbox(): Promise<void> {
  const python = resolve(process.cwd(), '../backend/.venv/Scripts/python.exe');
  const script = resolve(process.cwd(), '../tests/support/server_manager_sandbox.py');
  sandboxProcess = spawn(python, [script], { cwd: resolve(process.cwd(), '..'), stdio: 'pipe' });
  sandbox = await new Promise<Sandbox>((resolveSandbox, reject) => {
    const timer = setTimeout(() => reject(new Error(`sandbox startup timed out: ${firstOutput}`)), 10000);
    sandboxProcess.stdout.on('data', (chunk: Buffer) => {
      firstOutput += chunk.toString('utf8');
      const line = firstOutput.split(/\r?\n/)[0];
      if (line.startsWith('{')) {
        clearTimeout(timer);
        try { resolveSandbox(JSON.parse(line) as Sandbox); } catch (error) { reject(error); }
      }
    });
    sandboxProcess.stderr.on('data', (chunk: Buffer) => { firstOutput += chunk.toString('utf8'); });
    sandboxProcess.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`sandbox exited before startup (${code}): ${firstOutput}`));
    });
  });
}

async function control(path: string, payload?: object): Promise<any> {
  const response = await fetch(`${sandbox.control_url}${path}`, {
    method: payload ? 'POST' : 'GET',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!response.ok) throw new Error(`sandbox control ${path} returned ${response.status}`);
  return response.json();
}

async function openManager(page: Page): Promise<void> {
  await page.goto(sandbox.manager_url);
  await expect(page.getByRole('button', { name: /ComfyUIメモリ解放を要求/ })).toBeVisible();
}

test.describe('Manager memory release integration', () => {
  test.beforeAll(async () => { await startSandbox(); });
  test.afterAll(async () => {
    if (sandboxProcess && sandboxProcess.exitCode === null) {
      await control('/control/shutdown', {});
      await new Promise<void>((resolveExit) => sandboxProcess.once('exit', () => resolveExit()));
    }
  });

  test.beforeEach(async () => {
    await control('/control/state', { running: [], pending: [], queue_mode: 'normal',
      free_delay: 0, free_status: 200, comfy_stopped: false });
  });

  test('[REQ-380/AC-1] idle request reaches native free once and reports acceptance only', async ({ page }) => {
    await openManager(page);
    await page.getByRole('button', { name: /ComfyUIメモリ解放を要求/ }).click();
    await expect(page.getByRole('status')).toContainText(/受付|受け付け/);
    await expect.poll(async () => (await control('/control/metrics')).free_count).toBe(1);
    const metrics = await control('/control/metrics');
    expect(metrics.native_payloads).toEqual([{ unload_models: true, free_memory: true }]);
    await expect(page.locator('#service-grid')).toContainText('LISTEN');
    await expect(page.getByRole('status')).not.toContainText(/完了|解放成功/);
  });

  test('[REQ-380/AC-2] repeated clicks and another client share the Manager lock', async ({ page, context }) => {
    await control('/control/state', { free_delay: 8 });
    await openManager(page);
    const release = page.getByRole('button', { name: /ComfyUIメモリ解放を要求/ });
    await release.click();
    await expect.poll(async () => (await control('/control/metrics')).free_count).toBe(1);
    await expect(release).toBeDisabled();
    await release.evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const secondClient = await context.newPage();
    const secondResponse = await secondClient.request.post(`${sandbox.manager_url}/api/action`, {
      data: { action: 'free-memory', service: 'comfy' },
    });
    expect(secondResponse.status()).toBe(409);
    await expect(secondResponse.json()).resolves.toMatchObject({ code: 'ACTION_BUSY', request_sent: false });
    expect((await control('/control/metrics')).free_count).toBe(1);
    await control('/control/release', {});
    await expect(page.getByRole('status')).toContainText(/受付|受け付け/);
    expect((await control('/control/metrics')).free_count).toBe(1);
    await secondClient.close();
  });

  test('[REQ-380/AC-3] queued, executing, and unknown Comfy states fail closed', async ({ page }) => {
    await control('/control/state', { pending: [{ prompt_id: 'pending' }] });
    await openManager(page);
    const release = page.getByRole('button', { name: /ComfyUIメモリ解放を要求/ });
    await expect(release).toBeDisabled();
    let response = await page.request.post(`${sandbox.manager_url}/api/action`, {
      data: { action: 'free-memory', service: 'comfy' },
    });
    expect(response.status()).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'COMFY_BUSY', request_sent: false });
    expect((await control('/control/metrics')).free_count).toBe(0);

    await control('/control/state', { pending: [], running: [{ prompt_id: 'running' }] });
    response = await page.request.post(`${sandbox.manager_url}/api/action`, {
      data: { action: 'free-memory', service: 'comfy' },
    });
    expect(response.status()).toBe(409);
    expect((await control('/control/metrics')).free_count).toBe(0);

    await control('/control/state', { running: [], queue_mode: 'malformed' });
    await expect.poll(async () => (await page.request.get(`${sandbox.manager_url}/api/status`)).json())
      .toMatchObject({ comfy: { execution_state: 'unknown', queue_running: null, queue_pending: null } });
    await expect(release).toBeDisabled();
    response = await page.request.post(`${sandbox.manager_url}/api/action`, {
      data: { action: 'free-memory', service: 'comfy' },
    });
    expect(response.status()).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'COMFY_UNKNOWN', request_sent: false });
    expect((await control('/control/metrics')).free_count).toBe(0);
  });

  test('[REQ-380/AC-4] stopped ComfyUI is disabled and never receives native free', async ({ page }) => {
    await control('/control/state', { comfy_stopped: true });
    await openManager(page);
    const release = page.getByRole('button', { name: /ComfyUIメモリ解放を要求/ });
    await expect(release).toBeDisabled();
    const response = await page.request.post(`${sandbox.manager_url}/api/action`, {
      data: { action: 'free-memory', service: 'comfy' },
    });
    expect(response.status()).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'COMFY_STOPPED', request_sent: false });
    expect((await control('/control/metrics')).free_count).toBe(0);
  });

  test('[REQ-380/AC-1] error and unconfirmed native response do not retry or imply completion', async ({ page }) => {
    await openManager(page);
    await control('/control/state', { free_status: 503 });
    await page.getByRole('button', { name: /ComfyUIメモリ解放を要求/ }).click();
    await expect.poll(async () => (await control('/control/metrics')).free_count).toBe(1);
    await expect(page.getByRole('status')).toContainText(/拒否|HTTP/);
    expect((await control('/control/metrics')).free_count).toBe(1);
    await expect(page.getByRole('status')).not.toContainText(/完了|解放成功/);
  });

  test('[REQ-380/AC-1] native timeout is unconfirmed and does not resend the action POST', async ({ page }) => {
    test.setTimeout(15000);
    await control('/control/state', { free_delay: 6 });
    await openManager(page);
    await page.getByRole('button', { name: /ComfyUIメモリ解放を要求/ }).click();
    await expect(page.getByRole('status')).toContainText(/未確認|確認できません/, { timeout: 9000 });
    expect((await control('/control/metrics')).free_count).toBe(1);
    await expect(page.getByRole('status')).not.toContainText(/完了|解放成功/);
    await control('/control/release', {});
    await expect.poll(async () => (await control('/control/metrics')).active_free).toBe(0);
  });
});
