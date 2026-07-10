import { describe, expect, it } from 'vitest';
import { EpubArchive } from '../../adapters/epub/epubArchive';
import { parseEpubPackage } from '../../adapters/epub/epubPackageParser';
import { buildEpubFixture } from '../helpers/epubFixtureBuilder';
describe('parseEpubPackage', () => {
  it('parses container, OPF, nested nav and spine', async () => {
    const archive = await EpubArchive.open(await buildEpubFixture({ 'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>', 'OPS/book.opf': '<package unique-identifier="uid"><metadata><title>Book</title><creator>A</creator><identifier id="uid">id-1</identifier></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>', 'OPS/nav.xhtml': '<html><body><nav epub:type="toc"><ol><li><a href="c1.xhtml#x">One</a><ol><li><a href="c1.xhtml#y">Child</a></li></ol></li></ol></nav></body></html>', 'OPS/c1.xhtml': '<p>Hello</p>' }));
    const pkg = await parseEpubPackage(archive); expect(pkg.metadata).toMatchObject({ title: 'Book', authors: ['A'], identifier: 'id-1' }); expect(pkg.sections[0]).toMatchObject({ id: 'c1', href: 'OPS/c1.xhtml' }); expect(pkg.toc[0].children?.[0].title).toBe('Child');
  });
  it('rejects XML entities before parsing', async () => { const archive = await EpubArchive.open(await buildEpubFixture({ 'META-INF/container.xml': '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///x">]><container>&e;</container>' })); await expect(parseEpubPackage(archive)).rejects.toThrow(/DOCTYPE|ENTITY/); });
});
