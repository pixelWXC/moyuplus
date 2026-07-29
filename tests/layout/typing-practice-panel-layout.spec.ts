import path from 'node:path';
import { expect, test } from '@playwright/test';

const harness = path.resolve(
  'tests/fixtures/layout/typing-practice-panel-harness.html'
);

test.beforeEach(async ({ page }) => {
  await page.goto(`file:///${harness.replaceAll('\\', '/')}`);
  const input = page.getByRole('textbox', { name: '练习输入' });
  await expect(input).toBeVisible();
  const prompt = page.locator('.practice-focus-prompt');
  await expect(prompt).toBeVisible();
  await prompt.click();
  await expect(input).toBeEnabled();
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
  await expect(page.locator('.practice-header')).toHaveCount(0);
  await expect(page.getByText('FOCUS MODE')).toHaveCount(0);
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
  const colors = await page.evaluate(() => {
    const left = getComputedStyle(document.querySelector('[data-code="KeyQ"]')!);
    const right = getComputedStyle(document.querySelector('[data-code="KeyJ"]')!);
    const next = getComputedStyle(document.querySelector('[data-code="KeyA"]')!);
    return {
      leftBackground: left.backgroundColor,
      rightBackground: right.backgroundColor,
      leftColor: left.color,
      rightColor: right.color,
      nextBackground: next.backgroundColor
    };
  });
  expect(colors.leftBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(colors.rightBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(colors.leftBackground).not.toBe(colors.rightBackground);
  expect(colors.leftColor).not.toBe(colors.rightColor);
  expect(colors.nextBackground).not.toBe(colors.leftBackground);

  const keyGeometry = await page.evaluate(() => {
    const rect = (code: string) => {
      const { width, height } = document.querySelector(
        `[data-code="${code}"]`
      )!.getBoundingClientRect();
      return { width, height };
    };
    return {
      normal: rect('KeyQ'),
      tab: rect('Tab'),
      caps: rect('CapsLock'),
      backspace: rect('Backspace'),
      enter: rect('Enter'),
      shiftLeft: rect('ShiftLeft'),
      shiftRight: rect('ShiftRight'),
      space: rect('Space')
    };
  });
  expect(keyGeometry.normal.height).toBeGreaterThanOrEqual(40);
  expect(keyGeometry.normal.width).toBeGreaterThan(keyGeometry.normal.height);
  expect(keyGeometry.normal.width).toBeLessThan(keyGeometry.normal.height * 1.5);
  expect(keyGeometry.tab.width).toBeGreaterThan(keyGeometry.normal.width * 1.3);
  expect(keyGeometry.caps.width).toBeGreaterThan(keyGeometry.tab.width);
  expect(keyGeometry.backspace.width).toBeGreaterThan(
    keyGeometry.normal.width * 1.7
  );
  expect(keyGeometry.enter.width).toBeGreaterThan(keyGeometry.caps.width);
  expect(keyGeometry.shiftRight.width).toBeGreaterThan(
    keyGeometry.shiftLeft.width
  );
  expect(keyGeometry.space.width).toBeGreaterThan(keyGeometry.normal.width * 5.5);
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

test('pauses behind a readable click-anywhere focus overlay', async ({ page }) => {
  const input = page.getByRole('textbox', { name: '练习输入' });
  await page.evaluate(() => window.practiceHarness.sendSnapshot({
    sessionId: 'session-1',
    revision: 3,
    status: 'running',
    targetIndex: 0,
    totalUnits: 3,
    showMetrics: true,
    metrics: {
      activeElapsedMs: 10_000,
      currentCpm: 60,
      accuracy: 100,
      remaining: { kind: 'units', remainingUnits: 3 }
    },
    window: {
      start: 0,
      end: 3,
      units: [
        { index: 0, text: 'a', display: 'a', state: 'target' },
        { index: 1, text: 'b', display: 'b', state: 'remaining' },
        { index: 2, text: 'c', display: 'c', state: 'remaining' }
      ]
    },
    updatedAt: 3
  }));
  await page.evaluate(() => window.practiceHarness.clear());
  await input.blur();
  const prompt = page.getByRole('button', { name: '点击继续输入' });
  await expect(prompt).toBeVisible();
  await expect(prompt).toHaveCSS('position', 'absolute');
  const overlayGeometry = await page.evaluate(() => {
    const copy = document.querySelector('.practice-copy')!.getBoundingClientRect();
    const overlay = document.querySelector(
      '.practice-focus-prompt'
    )!.getBoundingClientRect();
    return {
      copy: [copy.x, copy.y, copy.width, copy.height],
      overlay: [overlay.x, overlay.y, overlay.width, overlay.height]
    };
  });
  expect(overlayGeometry.overlay).toEqual(overlayGeometry.copy);
  const elapsedBefore = await page.locator('.practice-duration').textContent();
  await page.waitForTimeout(1_100);
  await expect(page.locator('.practice-duration')).toHaveText(elapsedBefore ?? '');
  expect(await page.evaluate(() => window.practiceHarness.sent()))
    .toContainEqual(expect.objectContaining({ type: 'practice/pause' }));
  await prompt.click();
  await expect(input).toBeFocused();
  expect(await page.evaluate(() => window.practiceHarness.sent()))
    .toContainEqual(expect.objectContaining({ type: 'practice/resume' }));
});

declare global {
  interface Window {
    practiceHarness: {
      setTheme(theme: 'light' | 'dark'): void;
    };
  }
}
