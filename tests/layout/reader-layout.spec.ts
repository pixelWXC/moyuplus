import path from 'node:path';
import { expect, test } from '@playwright/test';

const harness = path.resolve('tests/fixtures/layout/reader-harness.html');
const appHarness = path.resolve('tests/fixtures/layout/reader-app-harness.html');

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
  const before = await page.evaluate(() => window.readerHarness.state());

  await page.evaluate(() => window.readerHarness.resize(22));
  const after = await page.evaluate(() => window.readerHarness.state());
  expect(after.startOffset).toBeLessThanOrEqual(before.startOffset);
  expect(after.endOffset).toBeGreaterThan(before.startOffset);
  expect(after.visibleText.trim().length).toBeGreaterThan(0);
});

test('coalesces repeated preference reflows into one animation frame', async ({ page }) => {
  await page.evaluate(() => window.readerHarness.load(`<p>${'coalesced layout '.repeat(180)}</p>`));
  const before = await page.evaluate(() => window.readerHarness.state().pageCount);
  const passes = await page.evaluate(() => window.readerHarness.scheduleReflows(8));
  expect(passes).toBe(1);
  expect(await page.evaluate(() => window.readerHarness.reflowNotifications())).toBe(1);
  expect((await page.evaluate(() => window.readerHarness.state())).pageCount).toBe(before);
});

test('reports symmetric section boundaries for short and image content', async ({ page }) => {
  await page.evaluate(() => window.readerHarness.load('<p>Only page</p><img alt="cover" width="40" height="40">'));
  const state = await page.evaluate(() => window.readerHarness.state());
  expect(state).toMatchObject({ canPreviousPage: false, canNextPage: false, isSectionStart: true, isSectionEnd: true });
  expect(await page.evaluate(() => window.readerHarness.previous())).toBe(false);
  expect(await page.evaluate(() => window.readerHarness.next())).toBe(false);
});

test('goes to an exact UTF-16 text offset and resolves an empty fragment anchor', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 420 });
  await page.evaluate(() => window.readerHarness.load(
    `<p>${'before '.repeat(220)}</p><a id="note"></a><p>${'after '.repeat(120)}</p>`
  ));
  const moved = await page.evaluate(() => window.readerHarness.goToFragment('note'));
  const state = await page.evaluate(() => window.readerHarness.state());
  expect(moved).toBe(true);
  expect(state.visibleText).toContain('after');
  expect(state.progression).toBeGreaterThan(0);
});

test('paginates a long canonical section without deep-cloning the whole hidden source', async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 420 });
  await page.evaluate(() => window.readerHarness.load(
    `<div class="moyuplus-book-content">${Array.from({ length: 80 }, (_, index) => `<p>第 ${index + 1} 段 ${'long chapter content '.repeat(20)}</p>`).join('')}</div>`
  ));
  expect(await page.evaluate(() => window.readerHarness.wholeSourceCloneCount())).toBe(0);
});

test('keeps canonical semantic ancestors on every rendered page', async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 420 });
  const html = `<div class="moyuplus-book-content"><p>${'paragraph '.repeat(180)}</p><pre><code>${'code_value_'.repeat(180)}</code></pre><table><tbody><tr><td>${'cell '.repeat(180)}</td></tr></tbody></table><ol><li>${'item '.repeat(180)}</li></ol></div>`;
  await page.evaluate(html => window.readerHarness.load(html), html);
  const structures = await page.evaluate(() => {
    const result = [];
    do { result.push(window.readerHarness.visibleStructure()); } while (window.readerHarness.next());
    return result;
  });
  expect(structures.length).toBeGreaterThan(1);
  expect(structures.every(item => item.wrapper)).toBe(true);
  expect(structures.some(item => item.paragraph)).toBe(true);
  expect(structures.some(item => item.preCode)).toBe(true);
  expect(structures.some(item => item.table)).toBe(true);
  expect(structures.some(item => item.list)).toBe(true);
});

test('commits page history, exposes undo, and sends only the opaque image request', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 420 });
  await page.goto(`file:///${appHarness.replaceAll('\\', '/')}`);
  const before = await page.locator('#page-progress').textContent();
  await page.locator('#next-page').click();
  expect(await page.locator('#page-progress').textContent()).not.toBe(before);
  await expect(page.locator('#undo-location')).toBeEnabled();
  await page.locator('#undo-location').click();
  await expect(page.locator('#page-progress')).toHaveText(before ?? '');

  const imageLink = page.locator('#reader-content [data-moyuplus-resource-id="image_001"]');
  const imageLinkStyle = await imageLink.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      tagName: element.tagName,
      backgroundColor: style.backgroundColor,
      borderTopWidth: style.borderTopWidth,
      padding: style.padding,
      color: style.color,
      textDecorationLine: style.textDecorationLine,
      cursor: style.cursor
    };
  });
  expect(imageLinkStyle).toEqual({
    tagName: 'BUTTON', backgroundColor: 'rgba(0, 0, 0, 0)', borderTopWidth: '0px', padding: '0px',
    color: 'rgb(0, 106, 177)', textDecorationLine: 'underline', cursor: 'pointer'
  });

  await imageLink.click();
  const imageMessage = await page.evaluate(() => window.readerAppHarness.messages.filter(message => message.type === 'openImage').at(-1));
  expect(imageMessage).toMatchObject({ type: 'openImage', resourceId: 'image_001', sectionGeneration: 1 });
  expect(JSON.stringify(imageMessage)).not.toMatch(/path|OPS|file:/);
});

test('opens and closes the table of contents without replacing or reflowing the current layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 420 });
  await page.goto(`file:///${appHarness.replaceAll('\\', '/')}`);
  const result = await page.evaluate(async () => {
    const pageNode = document.querySelector('#reader-content');
    const hidden = [...document.body.children].filter(node => (node as HTMLElement).style.left === '-100000px');
    const beforeHtml = pageNode?.innerHTML;
    const beforeProgress = document.querySelector('#page-progress')?.textContent;
    let reflows = 0;
    const prototype = window.MoyuplusReader.LayoutEngine.prototype;
    const originalReflow = prototype.reflow;
    prototype.reflow = function(...args: Parameters<typeof originalReflow>) {
      reflows += 1;
      return originalReflow.apply(this, args);
    };
    (document.querySelector('[aria-label="目录"]') as HTMLButtonElement).click();
    const opened = Boolean(document.querySelector('.reader-drawer'));
    (document.querySelector('[aria-label="关闭目录"]') as HTMLButtonElement).click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    prototype.reflow = originalReflow;
    return {
      opened,
      closed: !document.querySelector('.reader-drawer'),
      samePage: pageNode === document.querySelector('#reader-content'),
      sameHidden: hidden.length === 2 && hidden.every(node => node.isConnected),
      sameHtml: beforeHtml === document.querySelector('#reader-content')?.innerHTML,
      sameProgress: beforeProgress === document.querySelector('#page-progress')?.textContent,
      reflows
    };
  });
  expect(result).toEqual({ opened: true, closed: true, samePage: true, sameHidden: true, sameHtml: true, sameProgress: true, reflows: 0 });
});

test('fully paginates a valid cross-section target exactly once', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 420 });
  await page.goto(`file:///${appHarness.replaceAll('\\', '/')}`);
  const fullPaginationCalls = await page.evaluate(() => {
    const prototype = window.MoyuplusReader.LayoutEngine.prototype;
    const originalSetContent = prototype.setContent;
    const originalSetContentAtOffset = prototype.setContentAtOffset;
    let fullPaginationCalls = 0;
    prototype.setContent = function(...args: Parameters<typeof originalSetContent>) {
      fullPaginationCalls += 1;
      return originalSetContent.apply(this, args);
    };
    prototype.setContentAtOffset = function(...args: Parameters<typeof originalSetContentAtOffset>) {
      fullPaginationCalls += 1;
      return originalSetContentAtOffset.apply(this, args);
    };
    (document.querySelector('#reader-content [data-moyuplus-section-id="chapter-2"]') as HTMLElement).click();
    window.readerAppHarness.send({
      version: 3, type: 'sectionReady', requestId: window.readerAppHarness.requestId, bookId: 'book-1', sectionId: 'chapter-2', sectionGeneration: 2,
      section: { sectionId: 'chapter-2', sourceRevision: 'revision-2', localResources: [], sanitizedHtml: `<div class="moyuplus-book-content"><h2 id="note-2">第二章脚注</h2><p>${'target content '.repeat(120)}</p></div>` }
    });
    prototype.setContent = originalSetContent;
    prototype.setContentAtOffset = originalSetContentAtOffset;
    return fullPaginationCalls;
  });
  expect(fullPaginationCalls).toBe(1);
  await expect(page.locator('#reader-content')).toContainText('第二章脚注');
  expect(await page.locator('body > [style*="-100000px"]').count()).toBe(2);
});

test('keeps the old layout atomic when candidate pagination throws', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 420 });
  await page.goto(`file:///${appHarness.replaceAll('\\', '/')}`);
  const result = await page.evaluate(() => {
    const pageNode = document.querySelector('#reader-content');
    const hidden = [...document.body.children].filter(node => (node as HTMLElement).style.left === '-100000px');
    const beforeText = pageNode?.textContent;
    const beforeProgress = document.querySelector('#page-progress')?.textContent;
    const prototype = window.MoyuplusReader.LayoutEngine.prototype;
    const original = prototype.setContentAtOffset;
    prototype.setContentAtOffset = function(sectionId: string, html: string, textOffset: number) {
      if (sectionId === 'chapter-2') throw new Error('synthetic pagination failure');
      return original.call(this, sectionId, html, textOffset);
    };
    (document.querySelector('#reader-content [data-moyuplus-section-id="chapter-2"]') as HTMLElement).click();
    window.readerAppHarness.send({
      version: 3, type: 'sectionReady', requestId: window.readerAppHarness.requestId, bookId: 'book-1', sectionId: 'chapter-2', sectionGeneration: 2,
      section: { sectionId: 'chapter-2', sourceRevision: 'revision-2', localResources: [], sanitizedHtml: '<div class="moyuplus-book-content"><h2 id="note-2">第二章脚注</h2></div>' }
    });
    prototype.setContentAtOffset = original;
    return {
      samePage: pageNode === document.querySelector('#reader-content'),
      sameHidden: hidden.length === 2 && hidden.every(node => node.isConnected),
      sameText: beforeText === document.querySelector('#reader-content')?.textContent,
      sameProgress: beforeProgress === document.querySelector('#page-progress')?.textContent,
      hiddenSurfaces: [...document.body.children].filter(node => (node as HTMLElement).style.left === '-100000px').length
    };
  });
  expect(result).toEqual({ samePage: true, sameHidden: true, sameText: true, sameProgress: true, hiddenSurfaces: 2 });
  await expect(page.getByRole('status')).toHaveText('目标位置不可用');
});

test('promotes an empty target chapter as one valid empty page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 420 });
  await page.goto(`file:///${appHarness.replaceAll('\\', '/')}`);
  await page.getByLabel('下一章').click();
  await page.evaluate(() => window.readerAppHarness.send({
    version: 3, type: 'sectionReady', requestId: window.readerAppHarness.requestId, bookId: 'book-1', sectionId: 'chapter-2', sectionGeneration: 2,
    section: { sectionId: 'chapter-2', sourceRevision: 'revision-empty', localResources: [], sanitizedHtml: '<div class="moyuplus-book-content"></div>' }
  }));
  await expect(page.locator('#reader-content')).toBeEmpty();
  await expect(page.locator('#page-progress')).toHaveText('1 / 1');
  await expect(page.getByLabel('下一章')).toBeDisabled();
  expect(await page.locator('body > [style*="-100000px"]').count()).toBe(2);
});

test('keeps the visible section atomic for invalid cross-section fragments and undoes a successful target', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 420 });
  await page.goto(`file:///${appHarness.replaceAll('\\', '/')}`);
  const original = await page.locator('#reader-content').textContent();
  await page.locator('#reader-content [data-moyuplus-section-id="chapter-2"]').click();
  await page.evaluate(() => window.readerAppHarness.send({
    version: 3, type: 'sectionReady', requestId: window.readerAppHarness.requestId, bookId: 'book-1', sectionId: 'chapter-2', sectionGeneration: 2,
    section: { sectionId: 'chapter-2', sourceRevision: 'revision-2', localResources: [], sanitizedHtml: '<p>missing target</p>' }
  }));
  await expect(page.locator('#reader-content')).toHaveText(original ?? '');
  await expect(page.getByRole('status')).toHaveText('目标位置不可用');

  await page.locator('#reader-content [data-moyuplus-section-id="chapter-2"]').click();
  await page.evaluate(() => window.readerAppHarness.send({
    version: 3, type: 'sectionReady', requestId: window.readerAppHarness.requestId, bookId: 'book-1', sectionId: 'chapter-2', sectionGeneration: 3,
    section: { sectionId: 'chapter-2', sourceRevision: 'revision-2', localResources: [], sanitizedHtml: '<h2 id="note-2">第二章脚注</h2><p>target content</p>' }
  }));
  await expect(page.locator('#reader-content')).toContainText('第二章脚注');
  await page.locator('#undo-location').click();
  await page.evaluate(() => window.readerAppHarness.send({
    version: 3, type: 'sectionReady', requestId: window.readerAppHarness.requestId, bookId: 'book-1', sectionId: 'chapter-1', sectionGeneration: 4,
    section: { sectionId: 'chapter-1', sourceRevision: 'revision-1', localResources: [{ id: 'image_001', mimeType: 'image/png', label: 'Cover' }], sanitizedHtml: window.readerAppHarness.chapterOneHtml }
  }));
  await expect(page.locator('#reader-content')).toContainText('跨章脚注');
});

test('keeps symmetric page padding and never clips the final line into the footer', async ({ page }) => {
  for (const width of [220, 280, 360]) {
    await page.setViewportSize({ width, height: 420 });
    for (const padding of [8, 24, 64]) {
      await page.evaluate(({ padding }) => {
        window.readerHarness.padding(padding);
        window.readerHarness.load(`<section class="publication">${Array.from({ length: 18 }, (_, index) => `<p>段落 ${index + 1} — ${'mixed content '.repeat(8)}</p>`).join('')}</section>`);
      }, { padding });
      const geometry = await page.evaluate(() => window.readerHarness.geometry());
      expect(geometry.first?.top ?? 0).toBeGreaterThanOrEqual(geometry.page.top + padding - 1);
      expect(geometry.first?.left ?? 0).toBeGreaterThanOrEqual(geometry.page.left + padding - 1);
      expect(geometry.last?.right ?? 0).toBeLessThanOrEqual(geometry.page.right - padding + 1);
      expect(geometry.last?.bottom ?? 0).toBeLessThanOrEqual(geometry.page.bottom - padding + 1);
      expect(geometry.page.bottom).toBeLessThanOrEqual(geometry.footerTop);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
      expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
    }
  }
});

test('paginates canonical semantic content without horizontal overflow or text loss', async ({ page }) => {
  const scenarios = [
    `<div class="moyuplus-book-content"><p>${'continuous中EnglishValue'.repeat(180)}</p></div>`,
    `<div class="moyuplus-book-content"><pre><code>${'preformatted_value_'.repeat(240)}</code></pre></div>`,
    `<div class="moyuplus-book-content"><table><tbody><tr><th>${'wide_heading_'.repeat(40)}</th><td>${'wide_cell_'.repeat(180)}</td></tr></tbody></table><ol><li>outer<ul><li>${'nested_item_'.repeat(140)}</li></ul></li></ol></div>`
  ];

  for (const width of [220, 280, 360]) {
    await page.setViewportSize({ width, height: 420 });
    for (const padding of [8, 24, 64]) {
      for (const html of scenarios) {
        await page.evaluate(({ html, padding }) => {
          window.readerHarness.padding(padding);
          window.readerHarness.load(html);
        }, { html, padding });
        const snapshot = await page.evaluate(() => ({
          sourceText: window.readerHarness.sourceText(),
          pages: window.readerHarness.pages(),
          state: window.readerHarness.state()
        }));
        expect(snapshot.pages.length).toBeGreaterThan(1);
        expect(snapshot.pages.map(item => item.text).join('')).toBe(snapshot.sourceText);
        expect(snapshot.pages.at(-1)?.text.trim().length).toBeGreaterThan(0);
        expect(snapshot.state).toMatchObject({ canNextPage: false, isSectionEnd: true });
        for (const item of snapshot.pages) {
          expect(item.geometry.scrollWidth).toBeLessThanOrEqual(item.geometry.clientWidth + 1);
          expect(item.geometry.scrollHeight).toBeLessThanOrEqual(item.geometry.clientHeight + 1);
        }
      }
    }
  }
});

test('renders a complete canonical EPUB section through the real reader app', async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 420 });
  await page.goto(`file:///${appHarness.replaceAll('\\', '/')}`);
  const expectedText = await page.evaluate(() => {
    const source = document.createElement('div'); source.innerHTML = window.readerAppHarness.canonicalHtml;
    window.readerAppHarness.send({
      version: 3, type: 'bookReady', requestId: window.readerAppHarness.requestId, bookId: 'book-1',
      toc: [], sections: [{ id: 'chapter-1', order: 0, progressionWeight: 1 }], initialSectionId: 'chapter-1',
      initialLocator: { kind: 'epub', sectionId: 'chapter-1', progression: 0 }
    });
    window.readerAppHarness.send({
      version: 3, type: 'sectionReady', requestId: window.readerAppHarness.requestId, bookId: 'book-1', sectionId: 'chapter-1', sectionGeneration: 5,
      section: { sectionId: 'chapter-1', sourceRevision: 'revision-canonical', localResources: [], sanitizedHtml: window.readerAppHarness.canonicalHtml }
    });
    return source.textContent ?? '';
  });
  const pages: Array<{ text: string; clientWidth: number; scrollWidth: number; clientHeight: number; scrollHeight: number }> = [];
  for (let index = 0; index < 200; index += 1) {
    pages.push(await page.locator('#reader-content').evaluate(element => ({
      text: element.textContent ?? '', clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight, scrollHeight: element.scrollHeight
    })));
    if (await page.locator('#next-page').isDisabled()) break;
    await page.locator('#next-page').click();
  }
  expect(pages.length).toBeGreaterThan(1);
  expect(pages.map(item => item.text).join('')).toBe(expectedText);
  expect(pages.at(-1)?.text.trim().length).toBeGreaterThan(0);
  await expect(page.locator('#next-page')).toBeDisabled();
  for (const item of pages) {
    expect(item.scrollWidth).toBeLessThanOrEqual(item.clientWidth + 1);
    expect(item.scrollHeight).toBeLessThanOrEqual(item.clientHeight + 1);
  }
});

test('uses the same page identity and publication structure for measure and render surfaces', async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 420 });
  await page.evaluate(() => window.readerHarness.load(`<section class="publication"><p>${'scoped publication text '.repeat(100)}</p></section>`));
  const surfaces = await page.evaluate(() => window.readerHarness.surfaces());
  expect(surfaces.visibleHasPublicationScope).toBe(true);
  expect(surfaces.hidden).toEqual(expect.arrayContaining([
    expect.objectContaining({ className: expect.stringContaining('reader-page'), publication: 'book', padding: '16px' })
  ]));
});

declare global {
  interface Window {
    readerAppHarness: { messages: Array<Record<string, unknown>>; send(data: unknown): void; requestId: string; chapterOneHtml: string; canonicalHtml: string };
    readerHarness: {
      load(html: string): void;
      next(): boolean;
      previous(): boolean;
      resize(fontSize: number): void;
      padding(value: number): void;
      goToFragment(fragment: string): boolean;
      scheduleReflows(count: number): Promise<number>;
      reflowNotifications(): number;
      wholeSourceCloneCount(): number;
      sourceText(): string;
      pages(): Array<{ text: string; geometry: { clientWidth: number; scrollWidth: number; clientHeight: number; scrollHeight: number } }>;
      geometry(): { page: { top: number; right: number; bottom: number; left: number }; footerTop: number; first?: { top: number; left: number }; last?: { right: number; bottom: number }; clientWidth: number; scrollWidth: number; clientHeight: number; scrollHeight: number };
      surfaces(): { visibleHasPublicationScope: boolean; hidden: Array<{ className: string; publication?: string; padding: string }> };
      visibleStructure(): { wrapper: boolean; paragraph: boolean; preCode: boolean; table: boolean; list: boolean };
      state(): { pageCount: number; visibleText: string; progression: number; startOffset: number; endOffset: number; canNextPage: boolean; canPreviousPage: boolean; isSectionStart: boolean; isSectionEnd: boolean };
    };
  }
}
