import path from 'node:path';
import { expect, test } from '@playwright/test';

const harness = path.resolve('tests/fixtures/layout/git-log-harness.html');

test.beforeEach(async ({ page }) => {
  await page.goto(`file:///${harness.replaceAll('\\', '/')}`);
});

for (const width of [220, 280, 360]) {
  test(`Git Log is non-scrolling and paginated at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 420 });
    await page.evaluate(() => window.gitLogHarness.load(24));
    const first = await page.evaluate(() => window.gitLogHarness.state());
    expect(Number(first.progress.split('/')[1])).toBeGreaterThan(1);
    expect(first.text.trim()).not.toBe('');
    expect(first.scrollHeight).toBeLessThanOrEqual(first.clientHeight + 1);
    expect(first.scrollWidth).toBeLessThanOrEqual(first.clientWidth + 1);

    await page.evaluate(() => { while (window.gitLogHarness.state().canNext) window.gitLogHarness.next(); });
    const last = await page.evaluate(() => window.gitLogHarness.state());
    expect(last.text.trim()).not.toBe('');
    expect(last.canNext).toBe(false);
    expect(last.canPrevious).toBe(true);
  });
}

test('inline fields use punctuation and natural wrapping without ellipsis or field font hierarchy', async ({ page }) => {
  await page.setViewportSize({ width: 220, height: 420 });
  await page.evaluate(() => window.gitLogHarness.load(6, { layout: 'inline' }));
  const values = await page.evaluate(() => {
    const content = document.querySelector('#git-log-content')!;
    const source = [...document.querySelectorAll<HTMLElement>('body > div')].find(item => item.style.left === '-100000px' && item.querySelector('.git-commit'));
    const sourceLines = [...(source?.querySelectorAll<HTMLElement>('.git-commit-line') ?? [])];
    const sourceCommits = [...(source?.querySelectorAll<HTMLElement>('.git-commit') ?? [])];
    let text = '';
    do { text += content.textContent || ''; window.gitLogHarness.next(); } while (window.gitLogHarness.state().canNext);
    text += content.textContent || '';
    return {
      text, overflow: getComputedStyle(content).textOverflow,
      descendantSizes: [...new Set(sourceLines.map(line => getComputedStyle(line).fontSize))],
      borders: sourceCommits.map(item => getComputedStyle(item).borderTopWidth)
    };
  });
  expect(values.text).toContain(' · ');
  expect(values.overflow).not.toBe('ellipsis');
  expect(values.descendantSizes.every(value => value === '16px')).toBe(true);
  expect(values.borders.length).toBeGreaterThan(0);
  expect(values.borders.every(value => value === '0px')).toBe(true);
});

declare global {
  interface Window {
    gitLogHarness: {
      load(count: number, preferences?: Record<string, unknown>): void;
      state(): { progress: string; text: string; scrollHeight: number; clientHeight: number; scrollWidth: number; clientWidth: number; canNext: boolean; canPrevious: boolean };
      next(): void;
      previous(): void;
    };
  }
}
