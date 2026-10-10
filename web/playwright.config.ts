// Browser tests for the key user flows. Needs local Supabase running
// (`supabase start`); see README → Tests.
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // The flows share one database and the per-visitor rate limit, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  retries: CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Software WebGL so the 3D map renders on machines without a GPU (CI).
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    // CI tests the production build; locally an already-running `npm run dev` is reused.
    command: CI ? 'npm run start' : 'npm run dev',
    url: 'http://localhost:3000/api/v1/health',
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});
