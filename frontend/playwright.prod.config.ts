import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PROD_PORT ?? 4180)

export default defineConfig({
  testDir: './e2e/prod',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'off' },
  webServer: {
    command: 'node e2e/prod/support/serveDist.mjs',
    url: `http://127.0.0.1:${PORT}/__health`,
    reuseExistingServer: false,
    env: { PROD_DIST_DIR: process.env.PROD_DIST_DIR ?? '', PROD_PORT: String(PORT) },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
