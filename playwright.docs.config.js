import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './docs-tests', workers: 3,
  reporter: [['list'], ['json', { outputFile: 'reports/docs-tests.json' }]],
  use: { baseURL: 'http://127.0.0.1:4174' },
  webServer: { command: 'node scripts/serve-docs.mjs', env: { DOCS_PORT: '4174' }, url: 'http://127.0.0.1:4174', reuseExistingServer: false },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'firefox', use: { browserName: 'firefox', viewport: { width: 1280, height: 900 } } },
    { name: 'webkit', use: { browserName: 'webkit', viewport: { width: 1280, height: 900 } } },
  ],
});
