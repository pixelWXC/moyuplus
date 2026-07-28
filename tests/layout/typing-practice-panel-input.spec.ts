import path from 'node:path';
import { expect, test } from '@playwright/test';

const harness = path.resolve(
  'tests/fixtures/layout/typing-practice-panel-harness.html'
);

test.beforeEach(async ({ page }) => {
  await page.goto(`file:///${harness.replaceAll('\\', '/')}`);
  await expect(page.getByRole('textbox', { name: '练习输入' })).toBeVisible();
  await page.evaluate(() => window.practiceHarness.clear());
});

test('composition updates stay local and compositionend posts once', async ({ page }) => {
  const input = page.getByRole('textbox', { name: '练习输入' });
  await input.evaluate(element => {
    const target = element as HTMLInputElement;
    target.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    for (const value of ['z', 'zh', 'zhu']) {
      target.value = value;
      target.dispatchEvent(new CompositionEvent('compositionupdate', {
        bubbles: true,
        data: value
      }));
      target.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: value,
        inputType: 'insertCompositionText',
        isComposing: true
      }));
    }
  });
  expect(await page.evaluate(() => window.practiceHarness.sent())).toEqual([]);
  await expect(input).toHaveValue('zhu');
  await expect(input).toHaveClass(/practice-unit--composition/);

  await input.evaluate(element => {
    const target = element as HTMLInputElement;
    target.value = '主';
    target.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true,
      data: '主'
    }));
    target.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: '主',
      inputType: 'insertText',
      isComposing: false
    }));
  });
  const submits = await page.evaluate(() =>
    window.practiceHarness.sent().filter(message =>
      message.type === 'practice/submit'
    )
  );
  expect(submits).toEqual([expect.objectContaining({
    inputKind: 'composition',
    text: '主'
  })]);
});

test('direct input and paste use browser-produced text without editable history', async ({ page }) => {
  const input = page.getByRole('textbox', { name: '练习输入' });
  await input.evaluate(element => {
    const target = element as HTMLInputElement;
    target.value = 'a';
    target.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: 'a',
      inputType: 'insertText'
    }));
  });
  await input.evaluate(element => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => '主题' }
    });
    element.dispatchEvent(event);
  });

  expect(await page.evaluate(() => window.practiceHarness.sent()))
    .toEqual([expect.objectContaining({
      type: 'practice/submit',
      inputKind: 'direct',
      text: 'a'
    })]);
  await expect(input).toHaveValue('');
});

test('blocked Backspace posts one correction and exposes a text error', async ({ page }) => {
  await page.evaluate(() => {
    window.practiceHarness.sendBlocked();
    window.practiceHarness.clear();
  });
  const input = page.getByRole('textbox', { name: '练习输入' });
  await input.evaluate(element => {
    for (let index = 0; index < 2; index += 1) {
      element.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'deleteContentBackward'
      }));
    }
  });

  expect(await page.evaluate(() => window.practiceHarness.sent()))
    .toEqual([expect.objectContaining({ type: 'practice/correct' })]);
  await expect(page.getByText('输入有误，按退格修正。')).toBeVisible();
});

test('keeps the input visible, labelled and keyboard-controlled', async ({ page }) => {
  const input = page.getByRole('textbox', { name: '练习输入' });
  await expect(input).toHaveAttribute('spellcheck', 'false');
  await expect(input).toHaveAttribute('autocomplete', 'off');
  await input.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Home');
  await page.keyboard.press('End');
  expect(await input.evaluate(element => ({
    start: (element as HTMLInputElement).selectionStart,
    end: (element as HTMLInputElement).selectionEnd
  }))).toEqual({ start: 0, end: 0 });
});

declare global {
  interface Window {
    practiceHarness: {
      sent(): Record<string, unknown>[];
      clear(): void;
      sendSnapshot(snapshot: unknown): void;
      sendBlocked(): void;
    };
  }
}
