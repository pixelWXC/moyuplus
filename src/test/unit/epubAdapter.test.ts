import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { EpubAdapter } from '../../adapters/epub/epubAdapter';
import { buildEpubFixture } from '../helpers/epubFixtureBuilder';
import type { BookRecord } from '../../domain/books';
describe('EpubAdapter', () => {
  it('inspects, opens, sanitizes and disposes an EPUB', async () => {
    const file = await buildEpubFixture({ 'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>', 'OPS/book.opf': '<package><metadata><title>Safe Book</title></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>', 'OPS/c1.xhtml': '<p>Hello<script>bad()</script></p>' }); const uri = pathToFileURL(file).href; const adapter = new EpubAdapter(); expect((await adapter.inspect(uri)).title).toBe('Safe Book');
    const book: BookRecord = { schemaVersion: 2, id: 'e', uri, source: 'external', title: 'Safe Book', authors: [], capabilities: { readable: true, typing: false, toc: true }, format: 'epub', formatData: {}, createdAt: 1, updatedAt: 1 }; const handle = await adapter.open(book); const section = await handle.getSection('c1'); expect(section.sanitizedHtml).toContain('Hello'); expect(section.sanitizedHtml).not.toContain('script'); expect(await handle.normalizeLocator({ kind: 'epub', sectionId: 'missing', progression: 2, fragment: 'x' })).toEqual({ kind: 'epub', sectionId: 'c1', progression: 0 }); handle.dispose(); await expect(handle.getSections()).rejects.toThrow(/disposed/);
  });

  it('declares only manifest-authorized images and exposes no archive path to the Webview', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const file = await buildEpubFixture({
      'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
      'OPS/book.opf': '<package><metadata><title>Images</title></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="images/cover.png" media-type="image/png"/><item id="blob" href="images/blob.bin" media-type="application/octet-stream"/></manifest><spine><itemref idref="c1"/></spine></package>',
      'OPS/c1.xhtml': '<p><img alt="Cover" src="images/cover.png"><img src="images/blob.bin"></p>',
      'OPS/images/cover.png': png,
      'OPS/images/blob.bin': png
    });
    const uri = pathToFileURL(file).href;
    const adapter = new EpubAdapter();
    const book: BookRecord = { schemaVersion: 2, id: 'images', uri, source: 'external', title: 'Images', authors: [], capabilities: { readable: true, typing: false, toc: true }, format: 'epub', formatData: {}, createdAt: 1, updatedAt: 1 };
    const handle = await adapter.open(book);
    const section = await handle.getSection('c1');

    expect(section.localResources).toEqual([
      expect.objectContaining({ id: expect.stringMatching(/^[a-f0-9]{16}$/), mimeType: 'image/png', label: 'Cover' })
    ]);
    expect(section.localResources[0]).not.toHaveProperty('path');
    expect(section.sanitizedHtml).not.toMatch(/OPS\/|images\/cover/);
    const image = await handle.readResource('c1', section.localResources[0].id);
    expect(image).toEqual({ bytes: new Uint8Array(png), mimeType: 'image/png', label: 'Cover' });
    await expect(handle.readResource('other-section', section.localResources[0].id)).rejects.toThrow(/declared|resource/i);
    await expect(handle.readResource('c1', 'unknown-resource')).rejects.toThrow(/declared|resource/i);
    handle.dispose();
  });

  it('invalidates stored EPUB locators when canonical sanitizing changes', async () => {
    const source = '<html><body><p class="publisher" style="white-space:nowrap">Stable text</p></body></html>';
    const file = await buildEpubFixture({
      'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
      'OPS/book.opf': '<package><metadata><title>Revision</title></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>',
      'OPS/c1.xhtml': source
    });
    const adapter = new EpubAdapter();
    const book: BookRecord = { schemaVersion: 2, id: 'revision', uri: pathToFileURL(file).href, source: 'external', title: 'Revision', authors: [], capabilities: { readable: true, typing: false, toc: true }, format: 'epub', formatData: {}, createdAt: 1, updatedAt: 1 };
    const handle = await adapter.open(book);
    const section = await handle.getSection('c1');

    expect(section.sourceRevision).toBe(createHash('sha256').update('sanitizer-v3\0').update(source).digest('hex'));
    expect(section.sanitizedHtml).not.toMatch(/class="publisher"|style=/);
    handle.dispose();
  });
});
