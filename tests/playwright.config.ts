import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './mobile',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 1,
  workers: undefined, // auto
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3101',
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
    port: 3101,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
