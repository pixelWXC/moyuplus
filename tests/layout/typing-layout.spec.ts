import path from 'node:path';
import { expect, test } from '@playwright/test';

const harness = path.resolve('tests/fixtures/layout/typing-harness.html');

test.beforeEach(async ({ page }) => {
  await page.goto(`file:///${harness.replaceAll('\\', '/')}`);
  await expect(page.getByRole('heading', { name: '选择练习内容' }))
    .toBeVisible();
});

test('uses one main landmark and does not announce every full-page render', async ({ page }) => {
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-live');
});

test('preserves keyboard focus on the selected page after the host refresh', async ({ page }) => {
  const recent = page.getByRole('button', { name: '最近', exact: true });
  await recent.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: '继续最近练习' }))
    .toBeVisible();
  await expect(recent).toBeFocused();
});

test('keeps long recent identifiers inside a 220px sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 220, height: 720 });
  await page.evaluate(() => window.typingHarness.sendLongRecent());
  await expect(page.getByRole('heading', { name: '最近练习', exact: true }))
    .toBeVisible();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
});

test('gives the current page a non-color indicator in forced-colors mode', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  const current = page.locator('.page-tab[aria-current="page"]');
  const outline = await current.evaluate(element =>
    getComputedStyle(element).outlineStyle
  );
  expect(outline).not.toBe('none');
});

test('expands Typing actions to 44px for coarse pointers', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 720 }
  });
  const page = await context.newPage();
  try {
    await page.goto(`file:///${harness.replaceAll('\\', '/')}`);
    await expect(page.getByRole('heading', { name: '选择练习内容' }))
      .toBeVisible();
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches))
      .toBe(true);
    const targets = await page.locator(
      '.page-tab, .material-action, .material-select, .material-remove'
    ).evaluateAll(elements =>
      elements.map(element => ({
        className: element.className,
        text: element.textContent?.trim().slice(0, 24),
        height: element.getBoundingClientRect().height
      }))
    );
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter(
      target => target.height > 0 && target.height < 44
    )).toEqual([]);
  } finally {
    await context.close();
  }
});

test('keeps setup contextual and exposes labelled native setup controls', async ({ page }) => {
  await expect(page.getByRole('button', { name: '本次设置', exact: true }))
    .toHaveCount(0);
  await expect(page.locator('.setup-context')).toHaveCount(0);
  await expect(page.locator('.page-tab')).toHaveCount(6);

  for (const [label, title] of [
    ['最近', '继续最近练习'],
    ['进行中', '练习进行中'],
    ['结果', '本次结果'],
    ['历史', '练习历史'],
    ['强化', '专项强化'],
    ['素材', '选择练习内容']
  ] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByRole('button', { name: label, exact: true }))
      .toHaveAttribute('aria-current', 'page');
  }

  await page.locator('.material-select').click();
  await expect(page.getByRole('heading', { name: '设置本次练习' }))
    .toBeFocused();
  const setupContext = page.locator('.setup-context');
  await expect(setupContext).toHaveText('本次设置');
  await expect(setupContext).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.page-navigation > :last-child'))
    .toHaveClass(/setup-context/);
  expect(await setupContext.evaluate(element =>
    getComputedStyle(element).gridColumnEnd
  )).toBe('-1');

  for (const [name, label] of [
    ['range', /^练习哪一部分/],
    ['startKind', /^从哪里开始/],
    ['completionKind', /^什么时候结束/],
    ['errorPolicy', /^错误处理/],
    ['punctuationMode', /^标点/],
    ['whitespaceMode', /^空白/],
    ['lineAdvance', /^换行推进/],
    ['presentation', /^呈现方式/]
  ] as const) {
    const control = page.locator(`[name="${name}"]`);
    await expect(control).toBeVisible();
    await expect(control).toHaveAccessibleName(label);
  }
  await expect(page.getByRole('button', { name: '保存并开始练习' }))
    .toBeVisible();

  await page.getByRole('button', { name: '素材', exact: true }).click();
  await expect(page.locator('.setup-context')).toHaveCount(0);
});

test('balances six persistent pages before the full-width setup row', async ({ page }) => {
  await page.locator('.material-select').click();

  for (const [width, expectedRows] of [
    [220, 3],
    [400, 2],
    [600, 1]
  ] as const) {
    await page.setViewportSize({ width, height: 720 });
    const geometry = await page.locator('.page-navigation').evaluate(element => {
      const tabs = [...element.querySelectorAll<HTMLElement>('.page-tab')];
      const context = element.querySelector<HTMLElement>('.setup-context');
      const tabRows = new Set(tabs.map(tab =>
        Math.round(tab.getBoundingClientRect().top)
      ));
      const lastTabBottom = Math.max(...tabs.map(tab =>
        tab.getBoundingClientRect().bottom
      ));
      const contextRect = context?.getBoundingClientRect();
      return {
        rows: tabRows.size,
        contextBelowTabs: Boolean(contextRect && contextRect.top >= lastTabBottom),
        contextWidth: contextRect?.width ?? 0,
        firstRowWidth: tabs
          .filter(tab => Math.round(tab.getBoundingClientRect().top)
            === Math.min(...tabs.map(item =>
              Math.round(item.getBoundingClientRect().top)
            )))
          .reduce((sum, tab) => sum + tab.getBoundingClientRect().width, 0)
      };
    });

    expect(geometry.rows).toBe(expectedRows);
    expect(geometry.contextBelowTabs).toBe(true);
    expect(Math.abs(geometry.contextWidth - geometry.firstRowWidth))
      .toBeLessThanOrEqual(1);
  }
});

test('withholds hidden live facts, announces pending results and follows dark theme tokens', async ({ page }) => {
  await page.getByRole('button', { name: '进行中', exact: true }).click();
  await expect(page.locator('.live-state[role="status"]'))
    .toHaveText('练习中');
  await expect(page.getByText('有效 CPM')).toHaveCount(0);
  await expect(page.getByText('准确率')).toHaveCount(0);
  await expect(page.getByRole('group', { name: '练习控制' })).toBeVisible();

  await page.evaluate(() => window.typingHarness.sendPending());
  await expect(page.locator('.pending-notice[role="status"]'))
    .toHaveText('待保存成绩：2');

  await page.evaluate(() => window.typingHarness.setTheme('dark'));
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(24, 24, 24)'
  );
  await expect(page.locator('body')).toHaveCSS(
    'color',
    'rgb(240, 240, 240)'
  );
});

test('loads the Typing bundle without external network resources', async ({ page }) => {
  const external = await page.evaluate(() =>
    performance.getEntriesByType('resource')
      .map(entry => entry.name)
      .filter(name => /^https?:/i.test(name))
  );
  expect(external).toEqual([]);
});

test('starts the recommended mastery batch without overflowing a narrow sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 220, height: 720 });
  await page.evaluate(() => window.typingHarness.sendMastery());

  await expect(page.getByRole('heading', { name: '专项强化' })).toBeVisible();
  await expect(page.locator('[data-mastery-action="start"]'))
    .toHaveText(/开始本批 · 20 词/);
  await expect(page.getByText('最近一批：已稳定 16 词')).toBeVisible();

  await page.locator('[data-mastery-action="start"]').click();
  const sent = await page.evaluate(() => window.typingHarness.sent());
  expect(sent.at(-1)).toEqual(expect.objectContaining({
    type: 'startMasteryPractice'
  }));

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
});

declare global {
  interface Window {
    typingHarness: {
      sent(): Record<string, unknown>[];
      send(page: string, content?: unknown, options?: Record<string, unknown>): void;
      sendLongRecent(): void;
      sendPending(): void;
      sendMastery(): void;
      setTheme(theme: 'light' | 'dark'): void;
    };
  }
}
