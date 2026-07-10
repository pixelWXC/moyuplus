import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test('Reader harness makes no external requests and keeps a deny-by-default CSP', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', request => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  });

  const harnessPath = path.resolve('tests/fixtures/layout/reader-harness.html');
  await page.goto(`file:///${harnessPath.replaceAll('\\', '/')}`);
  await page.evaluate(() => window.readerHarness.load('<p>Offline content</p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">'));

  expect(externalRequests).toEqual([]);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'none'");
  expect(csp).not.toMatch(/connect-src|frame-src|media-src/);

  const bundle = await readFile(path.resolve('media/readerApp.js'), 'utf8');
  expect(bundle).not.toMatch(/https?:\/\//i);
  expect(bundle).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket)\b/);
});

declare global { interface Window { readerHarness: { load(html: string): void } } }
