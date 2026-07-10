import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { EpubAdapter } from '../../adapters/epub/epubAdapter';
import { buildEpubFixture } from '../helpers/epubFixtureBuilder';
import type { BookRecord } from '../../domain/books';
describe('EpubAdapter', () => {
  it('inspects, opens, sanitizes and disposes an EPUB', async () => {
    const file = await buildEpubFixture({ 'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>', 'OPS/book.opf': '<package><metadata><title>Safe Book</title></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>', 'OPS/c1.xhtml': '<p>Hello<script>bad()</script></p>' }); const uri = pathToFileURL(file).href; const adapter = new EpubAdapter(); expect((await adapter.inspect(uri)).title).toBe('Safe Book');
    const book: BookRecord = { schemaVersion: 2, id: 'e', uri, source: 'external', title: 'Safe Book', authors: [], capabilities: { readable: true, typing: false, toc: true }, format: 'epub', formatData: {}, createdAt: 1, updatedAt: 1 }; const handle = await adapter.open(book); const section = await handle.getSection('c1'); expect(section.sanitizedHtml).toContain('Hello'); expect(section.sanitizedHtml).not.toContain('script'); expect((await handle.normalizeLocator({ kind: 'epub', sectionId: 'missing', progression: 2, fragment: 'x' })).sectionId).toBe('c1'); handle.dispose(); await expect(handle.getSections()).rejects.toThrow(/disposed/);
  });
});
