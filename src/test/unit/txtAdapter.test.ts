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
    expect((await handle.getSection(sections[0].id)).sanitizedHtml).toContain('你好');
    expect((await handle.normalizeLocator({ kind: 'txt', sectionId: 'missing', progression: 2, offset: 999 })).sectionId).toBe(sections[1].id);
    expect(await handle.getPhysicalLines()).toEqual(['第一章 开始', '你好', '第二章 后续', '世界']);
  });
});
