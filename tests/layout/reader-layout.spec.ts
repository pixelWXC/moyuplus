import path from 'node:path';
import { expect, test } from '@playwright/test';

const harness = path.resolve('tests/fixtures/layout/reader-harness.html');

test.beforeEach(async ({ page }) => {
  await page.goto(`file:///${harness.replaceAll('\\', '/')}`);
});

for (const width of [220, 280, 360]) {
  test(`paginates mixed Chinese and English at ${width}px without an empty tail page`, async ({ page }) => {
    await page.setViewportSize({ width: width + 40, height: 420 });
    await page.evaluate(() => window.readerHarness.load(
      Array.from({ length: 18 }, (_, index) => `<p>第 ${index + 1} 段中文内容 keeps English words together and remains readable.</p>`).join('')
    ));

    const initial = await page.evaluate(() => window.readerHarness.state());
    expect(initial.pageCount).toBeGreaterThan(1);
    expect(initial.visibleText.length).toBeGreaterThan(0);

    await page.evaluate(() => { while (window.readerHarness.next()) { /* advance */ } });
    const end = await page.evaluate(() => window.readerHarness.state());
    expect(end.canNextPage).toBe(false);
    expect(end.isSectionEnd).toBe(true);
    expect(end.visibleText.trim().length).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.readerHarness.next())).toBe(false);
    expect((await page.evaluate(() => window.readerHarness.state())).visibleText).toBe(end.visibleText);
  });
}

test('restores the surrounding position after font and viewport changes', async ({ page }) => {
  await page.evaluate(() => window.readerHarness.load(
    Array.from({ length: 30 }, (_, index) => `<p>Paragraph ${index + 1}: ${'layout content '.repeat(8)}</p>`).join('')
  ));
  await page.evaluate(() => { for (let index = 0; index < 3; index += 1) window.readerHarness.next(); });
  const before = await page.evaluate(() => window.readerHarness.state().progression);

  await page.evaluate(() => window.readerHarness.resize(22));
  const after = await page.evaluate(() => window.readerHarness.state());
  expect(after.progression).toBeGreaterThanOrEqual(before - 0.08);
  expect(after.visibleText.trim().length).toBeGreaterThan(0);
});

test('coalesces repeated preference reflows into one animation frame', async ({ page }) => {
  await page.evaluate(() => window.readerHarness.load(`<p>${'coalesced layout '.repeat(180)}</p>`));
  const before = await page.evaluate(() => window.readerHarness.state().pageCount);
  const passes = await page.evaluate(() => window.readerHarness.scheduleReflows(8));
  expect(passes).toBe(1);
  expect((await page.evaluate(() => window.readerHarness.state())).pageCount).toBe(before);
});

test('reports symmetric section boundaries for short and image content', async ({ page }) => {
  await page.evaluate(() => window.readerHarness.load('<p>Only page</p><img alt="cover" width="40" height="40">'));
  const state = await page.evaluate(() => window.readerHarness.state());
  expect(state).toMatchObject({ canPreviousPage: false, canNextPage: false, isSectionStart: true, isSectionEnd: true });
  expect(await page.evaluate(() => window.readerHarness.previous())).toBe(false);
  expect(await page.evaluate(() => window.readerHarness.next())).toBe(false);
});

declare global {
  interface Window {
    readerHarness: {
      load(html: string): void;
      next(): boolean;
      previous(): boolean;
      resize(fontSize: number): void;
      scheduleReflows(count: number): Promise<number>;
      state(): { pageCount: number; visibleText: string; progression: number; canNextPage: boolean; canPreviousPage: boolean; isSectionStart: boolean; isSectionEnd: boolean };
    };
  }
}
