import path from 'node:path';
import { expect, test } from '@playwright/test';

const harness = path.resolve('tests/fixtures/layout/git-log-harness.html');

test.beforeEach(async ({ page }) => {
  await page.goto(`file:///${harness.replaceAll('\\', '/')}`);
});

test('empty shelf uses one import entry and a direct upload reminder', async ({ page }) => {
  await page.evaluate(() => window.gitLogHarness.loadLibrary());

  await expect(page.locator('.empty-library')).toContainText('书架中还没有书');
  await expect(page.locator('.empty-library')).toContainText('点击右上角“导入”，添加本地 EPUB 或 TXT。');
  await expect(page.getByRole('button', { name: /导入/ })).toHaveCount(1);
  await expect(page.locator('.empty-mark')).toHaveCount(0);
});

test('startup Git restoration keeps the complete shelf after returning from the restored book', async ({ page }) => {
  await page.evaluate(() => window.gitLogHarness.restoreReaderFromGit());
  await expect(page.getByRole('button', { name: '返回书架' })).toBeVisible();

  await page.evaluate(() => window.gitLogHarness.returnToLibrary());

  await expect(page.locator('.book-row')).toHaveCount(2);
  await expect(page.locator('.book-title')).toHaveText(['One', 'Two']);
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

test('cached mode renders ready on the first frame and refresh failure remains non-blocking', async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 420 });
  await page.evaluate(() => {
    const commits = Array.from({ length: 24 }, (_, index) => ({
      hash: `${index}abcdef`, subject: `Cached commit ${index}`, author: 'Purvar', authoredAt: 1700000000 - index
    }));
    window.dispatchEvent(new MessageEvent('message', { data: {
      type: 'modeGitLog', sessionId: 'cached-1', modeGeneration: 1,
      readerPreferences: {
        fontFamily: 'system', fontSize: 16, lineHeight: 1.6, letterSpacing: 0,
        paragraphSpacing: .75, textColor: '#222222', backgroundColor: '#ffffff',
        pagePadding: 18, textAlign: 'left', theme: 'system'
      },
      preferences: { showHash: true, showAuthor: true, showRelativeTime: true, showAbsoluteDate: true, layout: 'lines', maxCommits: 200 },
      cached: { repositoryName: 'moyuplus', branchName: 'main', detached: false, commits }
    }}));
  });

  const first = await page.evaluate(() => ({
    text: document.querySelector('#git-log-content')?.textContent ?? '',
    loading: document.body.textContent?.includes('正在读取当前分支') ?? false,
    canNext: !document.querySelector<HTMLButtonElement>('#git-log-next-page')?.disabled
  }));
  expect(first.text).toContain('Cached commit');
  expect(first.loading).toBe(false);
  expect(first.canNext).toBe(true);

  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: {
    type: 'gitLogRefreshFailed', sessionId: 'cached-1', code: 'queryFailed', message: 'failed'
  }})));
  const failed = await page.evaluate(() => ({
    notice: document.querySelector('[role="status"]')?.textContent ?? '',
    text: document.querySelector('#git-log-content')?.textContent ?? '',
    canNext: !document.querySelector<HTMLButtonElement>('#git-log-next-page')?.disabled
  }));
  expect(failed.notice).toContain('刷新失败');
  expect(failed.text).toContain('Cached commit');
  expect(failed.canNext).toBe(true);
});

test('mode generation tombstone rejects a delayed stale Git mode', async ({ page }) => {
  const state = await page.evaluate(() => {
    const preferences = { showHash: true, showAuthor: true, showRelativeTime: true, showAbsoluteDate: true, layout: 'lines', maxCommits: 200 };
    const readerPreferences = {
      fontFamily: 'system', fontSize: 16, lineHeight: 1.6, letterSpacing: 0,
      paragraphSpacing: .75, textColor: '#222222', backgroundColor: '#ffffff',
      pagePadding: 18, textAlign: 'left', theme: 'system'
    };
    const cached = {
      repositoryName: 'moyuplus', branchName: 'main', detached: false,
      commits: [{ hash: 'abc', subject: 'Visible', author: 'Purvar', authoredAt: 1700000000 }]
    };
    const send = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data }));
    send({ type: 'modeGitLog', sessionId: 'old', modeGeneration: 5, preferences, readerPreferences, cached });
    send({ type: 'modeInvalidated', sessionId: 'old', modeGeneration: 6 });
    send({ type: 'modeGitLog', sessionId: 'late', modeGeneration: 5, preferences, readerPreferences, cached });
    const afterLate = document.querySelector('#app')?.textContent ?? '';
    send({ type: 'modeGitLog', sessionId: 'new', modeGeneration: 7, preferences, readerPreferences, cached });
    return { afterLate, afterNew: document.querySelector('#app')?.textContent ?? '' };
  });
  expect(state.afterLate).not.toContain('Visible');
  expect(state.afterNew).toContain('Visible');
});

declare global {
  interface Window {
    gitLogHarness: {
      loadLibrary(): void;
      load(count: number, preferences?: Record<string, unknown>): void;
      restoreReaderFromGit(): void;
      returnToLibrary(): void;
      state(): { progress: string; text: string; scrollHeight: number; clientHeight: number; scrollWidth: number; clientWidth: number; canNext: boolean; canPrevious: boolean };
      next(): void;
      previous(): void;
    };
  }
}
