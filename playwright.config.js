import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', workers: 3, timeout: 30000,
  reporter: [['list'], ['json', { outputFile: 'reports/tests.json' }]],
  projects: ['chromium', 'firefox', 'webkit'].map(browserName => ({ name: browserName, use: { browserName } })),
});
