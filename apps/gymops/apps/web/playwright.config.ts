import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: process.env['CI'] ? 'github' : 'list',

  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Logs in once per role and saves storageState + LoginContext under
    // e2e/.auth (see e2e/auth.setup.ts). Runs automatically before chromium —
    // `--project=chromium` still triggers it (project dependencies always run).
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],

  webServer: process.env['CI']
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
