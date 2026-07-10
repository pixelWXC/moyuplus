import { expect, test } from '@playwright/test';

test('launches Chromium and renders a local Reader harness', async ({ page }) => {
  await page.setContent('<main data-reader-harness>Reader layout harness</main>');

  await expect(page.locator('[data-reader-harness]')).toHaveText('Reader layout harness');
});
