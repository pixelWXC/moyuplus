import path from 'node:path';
import { expect, test } from '@playwright/test';

const harness = path.resolve('tests/fixtures/layout/settings-harness.html');

test.beforeEach(async ({ page }) => {
  await page.goto(`file:///${harness.replaceAll('\\', '/')}`);
  await expect(page.getByRole('heading', { name: '阅读' })).toBeVisible();
});

test('uses left navigation at 681px and exposes all ten Reader settings', async ({ page }) => {
  await page.setViewportSize({ width: 681, height: 760 });
  await expect(page.locator('.section-navigation')).toBeVisible();
  await expect(page.locator('.mobile-section-picker')).toBeHidden();
  await expect(page.locator('.settings-fields .setting-field')).toHaveCount(10);
  await expect(page.getByRole('button', { name: '恢复阅读默认值' })).toBeVisible();
});

test('focuses a deep-linked section heading and preserves navigation focus on user switches', async ({ page }) => {
  await expect(page.locator('#settings-section-title')).toBeFocused();
  await page.getByRole('button', { name: 'Git Log', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Git Log' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Git Log', exact: true })).toBeFocused();
});

test('renders immersive reading controls and a live VS Code-native preview', async ({ page }) => {
  await page.getByRole('button', { name: '沉浸阅读' }).click();
  await expect(page.locator('#settings-section-title')).toHaveText('沉浸阅读');
  await expect(page.locator('#immersive-visualLines')).toHaveValue('3');
  await expect(page.locator('#immersive-graphemesPerLine')).toHaveValue('40');
  await expect(page.locator('.immersive-preview')).toContainText('在代码旁安静地继续阅读');

  await page.locator('#immersive-italic').check();
  await expect(page.locator('.preview-after')).toHaveCSS('font-style', 'italic');
});

test('switches to the native top selector at 680px without hiding settings', async ({ page }) => {
  await page.setViewportSize({ width: 680, height: 760 });
  await expect(page.locator('.section-navigation')).toBeHidden();
  await expect(page.locator('.mobile-section-picker')).toBeVisible();
  await expect(page.locator('.settings-fields .setting-field')).toHaveCount(10);
  await page.locator('.mobile-section-picker select').selectOption('gitLog');
  await expect(page.getByRole('heading', { name: 'Git Log' })).toBeVisible();
  await expect(page.locator('.settings-fields .setting-field')).toHaveCount(6);
});

test('marks every typing setting experimental and explains workspace overrides', async ({ page }) => {
  await page.evaluate(() => window.settingsHarness.select('typing'));
  await expect(page.getByRole('heading', { name: '打字练习（实验性）' })).toBeVisible();
  await expect(page.locator('.configuration-setting')).toHaveCount(6);
  await expect(page.locator('.configuration-setting .setting-field')).toHaveText([
    /实验性/, /实验性/, /实验性/, /实验性/, /实验性/, /实验性/
  ]);
  await expect(page.getByText('当前工作区存在覆盖')).toBeVisible();
  await expect(page.getByText(/alpha：覆盖 关闭，实际 关闭/)).toBeVisible();
  await expect(page.getByText(/活动编辑器（beta）：开启/)).toBeVisible();
});

test('opens VS Code keyboard shortcuts through the correlated host request', async ({ page }) => {
  await page.evaluate(() => window.settingsHarness.select('shortcuts'));
  await expect(page.locator('.shortcut-binding')).toHaveCount(0);
  await expect(page.getByText('未设置默认快捷键')).toHaveCount(0);
  await page.getByRole('button', { name: '在键盘快捷方式中配置 MoyuPlus' }).click();
  const message = await page.evaluate(() => window.settingsHarness.sent().at(-1));
  expect(message).toMatchObject({
    type: 'openKeyboardShortcuts', protocolVersion: 2,
    instanceId: expect.stringMatching(/^settings-/), clientRevision: expect.any(Number)
  });
});

test('represents the default Reader background as inherited from the current theme', async ({ page }) => {
  const picker = page.locator('#reader-backgroundColor');
  const field = picker.locator('xpath=ancestor::label');
  const text = page.getByRole('textbox', { name: '背景颜色十六进制值' });

  await expect(picker).toHaveValue('#f8f8f8');
  await expect(text).toHaveValue('');
  await expect(text).toHaveAttribute('placeholder', '跟随主题');
  await expect(field.getByText('当前：跟随主题', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '背景颜色恢复跟随主题' })).toBeDisabled();
});

test('keeps an active Reader range stable across debounced saves and snapshots', async ({ page }) => {
  await page.setViewportSize({ width: 681, height: 360 });
  const id = 'reader-pagePadding';
  await page.evaluate((rangeId) => {
    const input = document.getElementById(rangeId) as HTMLInputElement;
    input.scrollIntoView({ block: 'center' });
    window.settingsHarness.rememberRange(rangeId);
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    input.value = '40';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, id);
  const initialScroll = await page.evaluate(() => window.scrollY);

  await page.waitForTimeout(320);
  await page.evaluate(() => window.settingsHarness.sendSnapshot('reader'));
  await page.waitForTimeout(30);

  expect(await page.evaluate((rangeId) => window.settingsHarness.rememberedRangeIsConnected(rangeId), id)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScroll);

  await page.evaluate((rangeId) => {
    const input = document.getElementById(rangeId) as HTMLInputElement;
    input.value = '42';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, id);
  await page.waitForTimeout(320);
  expect(await page.evaluate((rangeId) => window.settingsHarness.rememberedRangeIsConnected(rangeId), id)).toBe(true);

  await page.evaluate((rangeId) => {
    const input = document.getElementById(rangeId) as HTMLInputElement;
    input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, id);
  await page.waitForTimeout(30);

  const values = await page.evaluate(() => window.settingsHarness.sent()
    .filter(message => message.type === 'changeSetting' && message.key === 'pagePadding')
    .map(message => message.value));
  expect(values).toEqual([40, 42]);
});

test('remains readable in forced-colors mode and makes no external requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', request => { if (/^https?:/i.test(request.url())) external.push(request.url()); });
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('.section-link[aria-current="page"]')).toBeVisible();
  const outline = await page.locator('.section-link[aria-current="page"]').evaluate(element => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe('none');
  expect(external).toEqual([]);
});

declare global {
  interface Window {
    settingsHarness: {
      sendSnapshot(section: 'reader' | 'gitLog' | 'typing' | 'shortcuts'): void;
      sent(): Record<string, unknown>[];
      select(section: 'reader' | 'gitLog' | 'typing' | 'shortcuts'): void;
      rememberRange(id: string): void;
      rememberedRangeIsConnected(id: string): boolean;
    };
  }
}
