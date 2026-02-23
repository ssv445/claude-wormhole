import { defineConfig, devices } from '@playwright/test';

const port = parseInt(process.env.PORT || '3100', 10);

export default defineConfig({
  testDir: './mobile',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 1,
  workers: undefined, // auto
  reporter: 'list',

  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'mobile-webkit',
      use: {
        ...devices['iPhone 14'],
        // Force WebKit for iOS-accurate testing
        browserName: 'webkit',
      },
    },
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
      },
    },
  ],

  // Dev server started by the test runner
  webServer: {
    command: 'npm run dev',
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
