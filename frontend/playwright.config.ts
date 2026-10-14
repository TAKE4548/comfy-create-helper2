import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Prompt Surgeon frontend.
 * Conforms to SPEC-TESTING v2.1 Gate 3 E2E testing boundary.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 10000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
