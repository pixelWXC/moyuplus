import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import iconv from 'iconv-lite';
import { describe, expect, it } from 'vitest';
import { TxtAdapter } from '../../adapters/txt/txtAdapter';
import type { BookRecord } from '../../domain/books';
async function fixture(text: string) { const dir = await mkdtemp(path.join(tmpdir(), 'moyu-txt-')); const file = path.join(dir, 'book.txt'); await writeFile(file, iconv.encode(text, 'gbk')); return pathToFileURL(file).href; }
describe('TxtAdapter', () => {
  it('inspects, sections, reads safe HTML and normalizes offsets', async () => {
    const uri = await fixture('第一章 开始\n你好\n第二章 后续\n世界');
    const adapter = new TxtAdapter();
    expect((await adapter.inspect(uri, { encoding: 'gbk' })).title).toBe('book');
    const book: BookRecord = { schemaVersion: 2, id: 'b', uri, source: 'external', title: 'book', authors: [], capabilities: { readable: true, typing: true, toc: true }, format: 'txt', formatData: { encoding: 'gbk' }, createdAt: 1, updatedAt: 1 };
    const handle = await adapter.open(book); const sections = await handle.getSections();
    expect(sections).toHaveLength(2);
    const firstSection = await handle.getSection(sections[0].id);
    expect(firstSection.sanitizedHtml).toContain('你好');
    expect(firstSection.immersiveProjection.text).toBe('第一章 开始\n你好\n');
    expect(firstSection.locatorSpace).toMatchObject({ kind: 'txt', sectionStart: 0 });
    const missingSection = await handle.normalizeLocator({ kind: 'txt', sectionId: 'missing', progression: 2, offset: 999, offsetSpace: 'book' });
    expect(missingSection.sectionId).toBe(sections[0].id);
    expect(missingSection.offset).toBe(0);

    const legacy = await handle.normalizeLocator({ kind: 'txt', sectionId: sections[1].id, progression: 0.5, offset: 1 });
    expect(legacy.offsetSpace).toBe('book');
    expect(legacy.sectionId).toBe(sections[1].id);
    expect(legacy.offset).toBeGreaterThanOrEqual((firstSection.locatorSpace as { sectionEnd: number }).sectionEnd);

    const absolute = await handle.normalizeLocator({ kind: 'txt', sectionId: sections[1].id, progression: 0, offset: 999, offsetSpace: 'book' });
    expect(absolute.offsetSpace).toBe('book');
    expect(absolute.sectionId).toBe(sections[1].id);
    expect(absolute.offset).toBe((await handle.getSection(sections[1].id)).locatorSpace.kind === 'txt'
      ? (await handle.getSection(sections[1].id)).locatorSpace.sectionEnd
      : -1);
    expect(await handle.getPhysicalLines()).toEqual(['第一章 开始', '你好', '第二章 后续', '世界']);
  });
});
