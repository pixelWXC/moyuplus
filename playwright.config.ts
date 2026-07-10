import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/layout',
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium'
      }
    }
  ]
});
