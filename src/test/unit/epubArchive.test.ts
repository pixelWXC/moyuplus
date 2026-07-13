import { describe, expect, it } from 'vitest';
import { EpubArchive } from '../../adapters/epub/epubArchive';
import { buildEpubFixture } from '../helpers/epubFixtureBuilder';
describe('EpubArchive', () => {
  it('reads entries without extracting to disk', async () => { const archive = await EpubArchive.open(await buildEpubFixture({ 'META-INF/container.xml': '<container/>', 'OPS/ch.xhtml': '<p>ok</p>' })); expect(await archive.readText('OPS/ch.xhtml')).toBe('<p>ok</p>'); expect(archive.entries()).toContain('META-INF/container.xml'); archive.dispose(); });
  it('accepts explicit directory entries emitted by real EPUB tools', async () => {
    const archive = await EpubArchive.open(await buildEpubFixture(
      { 'META-INF/container.xml': '<container/>', 'OEBPS/ch.xhtml': '<p>ok</p>' },
      ['META-INF/', 'OEBPS/']
    ));
    expect(archive.entries()).toEqual(expect.arrayContaining(['META-INF/container.xml', 'OEBPS/ch.xhtml']));
    expect(archive.entries()).not.toContain('META-INF/');
    archive.dispose();
  });
  it('rejects traversal, compression bombs, and entry limits', async () => {
    await expect(EpubArchive.open(await buildEpubFixture({ '../evil': 'x' }))).rejects.toThrow(/path/i);
    await expect(EpubArchive.open(await buildEpubFixture({ 'big.txt': '0'.repeat(20_000) }), { maxCompressionRatio: 2 })).rejects.toThrow(/compression/i);
    await expect(EpubArchive.open(await buildEpubFixture({ a: 'a', b: 'b' }), { maxEntries: 1 })).rejects.toThrow(/entries/i);
  });
});
