import path from 'node:path';
import { expect, test } from '@playwright/test';

const harness = path.resolve(
  'tests/fixtures/layout/typing-practice-panel-harness.html'
);

test.beforeEach(async ({ page }) => {
  await page.goto(`file:///${harness.replaceAll('\\', '/')}`);
  await expect(page.getByRole('textbox', { name: '练习输入' })).toBeVisible();
});

test('keeps a bounded DOM for a 200k-unit authority snapshot', async ({ page }) => {
  await page.evaluate(() => window.practiceHarness.sendSnapshot({
    sessionId: 'session-1',
    revision: 10,
    status: 'running',
    targetIndex: 100_000,
    totalUnits: 200_000,
    window: {
      start: 99_999,
      end: 100_002,
      units: [
        { index: 99_999, text: '前', display: '前', state: 'correct' },
        { index: 100_000, text: '当', display: '当', state: 'target' },
        { index: 100_001, text: '后', display: '后', state: 'remaining' }
      ]
    },
    updatedAt: 10
  }));

  expect(await page.locator('.practice-unit').count()).toBeLessThan(20);
  await expect(page.locator('.practice-progress')).toHaveText('100000 / 200000');
});

test('keeps reference and typed output in separate single-line tracks', async ({ page }) => {
  const structure = await page.evaluate(() => {
    const reference = document.querySelector('.practice-reference-line');
    const typed = document.querySelector('.practice-typed-line');
    const input = document.querySelector('.practice-input');
    return {
      separate: Boolean(reference && typed && reference !== typed),
      inputInsideReference: Boolean(reference?.contains(input)),
      referenceWhiteSpace: reference
        ? getComputedStyle(reference).whiteSpace
        : ''
    };
  });

  expect(structure).toEqual({
    separate: true,
    inputInsideReference: false,
    referenceWhiteSpace: 'pre'
  });
});

test('marks hand zones and highlights the next physical key', async ({ page }) => {
  await expect(page.locator('[data-code="KeyA"]')).toHaveClass(/is-next/);
  await expect(page.locator('[data-code="KeyA"]')).toHaveClass(/keyboard-key--left/);
  await expect(page.locator('[data-code="KeyJ"]')).toHaveClass(/keyboard-key--right/);
  await expect(page.locator('.keyboard-hint')).toContainText('A');
});

test('predicts the next physical key throughout Chinese pinyin composition', async ({ page }) => {
  await page.evaluate(() => window.practiceHarness.sendSnapshot({
    sessionId: 'session-1',
    revision: 2,
    status: 'running',
    targetIndex: 1,
    totalUnits: 3,
    window: {
      start: 0,
      end: 3,
      units: [
        { index: 0, text: 'a', display: 'a', state: 'correct' },
        { index: 1, text: '主', display: '主', state: 'target' },
        { index: 2, text: '题', display: '题', state: 'remaining' }
      ]
    },
    updatedAt: 2
  }));

  await expect(page.locator('[data-code="KeyZ"]')).toHaveClass(/is-next/);
  await expect(page.locator('.keyboard-hint')).toContainText('拼音 zhu ti');

  await page.getByRole('textbox', { name: '练习输入' }).evaluate(element => {
    const target = element as HTMLInputElement;
    target.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    target.value = 'zhu';
    target.dispatchEvent(new CompositionEvent('compositionupdate', {
      bubbles: true,
      data: 'zhu'
    }));
  });

  await expect(page.locator('[data-code="KeyT"]')).toHaveClass(/is-next/);
  await expect(page.locator('.keyboard-hint')).toContainText('下一个按键：T');
});

test('remains readable at narrow width and follows dark theme tokens', async ({ page }) => {
  await page.setViewportSize({ width: 240, height: 640 });
  await page.evaluate(() => window.practiceHarness.setTheme('dark'));

  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(31, 31, 31)'
  );
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
});

test('shows a user-action focus prompt without polling focus', async ({ page }) => {
  const input = page.getByRole('textbox', { name: '练习输入' });
  await input.focus();
  await input.blur();
  const prompt = page.getByRole('button', { name: '点击继续输入' });
  await expect(prompt).toBeVisible();
  await prompt.click();
  await expect(input).toBeFocused();
});

declare global {
  interface Window {
    practiceHarness: {
      setTheme(theme: 'light' | 'dark'): void;
    };
  }
}
