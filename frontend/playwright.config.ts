import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // The test-only clock/provider fault controls are deliberately serial.
  retries: 0, // A retry must not conceal an acceptance failure.
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }], ['./e2e/timing-reporter.ts']],
  use: {
    baseURL: 'http://127.0.0.1:4178',
    actionTimeout: 10_000, navigationTimeout: 15_000,
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    { name: 'chromium' },
    { name: 'mobile-webkit', testMatch: 'course-card-navigation.spec.ts',
      use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    { command: 'cd ../backend && uv run --locked --python 3.12 python ../frontend/e2e/server.py',
      url: 'http://127.0.0.1:8018/health', reuseExistingServer: false, timeout: 60_000 },
    { command: 'npm run dev -- --mode e2e --host 127.0.0.1 --port 4178 --strictPort',
      env: { VITE_API_PROXY: 'http://127.0.0.1:8018', VITE_API_URL: '/api/v1' },
      url: 'http://127.0.0.1:4178', reuseExistingServer: false, timeout: 60_000 },
  ],
});
