import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_PACK_MANIFEST,
  BuiltInPackProvider,
  validateBuiltInCoverage
} from '../../typing/adapters/sources';

describe('typing built-in content pack', () => {
  it('meets every version 1 built-in coverage threshold with traceable sources', () => {
    const report = validateBuiltInCoverage(BUILT_IN_PACK_MANIFEST);

    expect(report.missing).toEqual([]);
    expect(report.counts).toMatchObject({
      chineseModernArticles: 5,
      chineseNewsArticles: 5,
      chineseFictionArticles: 5,
      chineseCommonSentences: 50,
      englishWords: 200,
      englishSentences: 50,
      englishArticles: 5,
      mixedProgrammerItems: 25,
      mixedOfficeItems: 25,
      frequentHanzi: 500,
      idioms: 100,
      phrases: 100,
      javascriptSnippets: 10,
      typescriptSnippets: 10,
      htmlSnippets: 10,
      cssSnippets: 10
    });
    expect(BUILT_IN_PACK_MANIFEST.entries.every(entry => (
      entry.source.license.length > 0
      && entry.source.attribution.length > 0
      && entry.revision.startsWith(`${BUILT_IN_PACK_MANIFEST.id}-`)
    ))).toBe(true);
  });

  it('keeps manifest item counts aligned with the packaged body boundaries', () => {
    for (const entry of BUILT_IN_PACK_MANIFEST.entries) {
      if (entry.itemCount === undefined) continue;
      const actual = entry.contentProfile.kind === 'code'
        ? entry.body.split('\n\n---\n\n').length
        : (
          entry.contentProfile.kind === 'numberSymbol'
          || (
            entry.contentProfile.kind === 'randomChinese'
            && entry.contentProfile.category === 'frequentHanzi'
          )
        )
          ? Array.from(entry.body).length
          : entry.body.split('\n').filter(Boolean).length;
      expect(actual, entry.id).toBe(entry.itemCount);
    }
  });

  it('does not let inflated manifest metadata satisfy a coverage threshold', () => {
    const tampered = structuredClone(BUILT_IN_PACK_MANIFEST);
    const sentences = tampered.entries.find(entry => entry.id === 'zh-common-sentences');
    expect(sentences).toBeDefined();
    sentences!.body = '只有一句。';
    sentences!.itemCount = 50;

    expect(validateBuiltInCoverage(tampered).missing)
      .toContain('zh-common-sentences: manifest itemCount 50 does not match body count 1');
  });

  it('resolves immutable manifest entries through the ContentProvider contract', async () => {
    const provider = new BuiltInPackProvider();
    const entry = BUILT_IN_PACK_MANIFEST.entries.find(value => (
      value.contentProfile.kind === 'chinese'
      && value.contentProfile.category === 'modernArticle'
    ));
    expect(entry).toBeDefined();
    const recipe = { kind: 'builtIn', materialId: entry!.id } as const;

    expect(provider.canResolve(recipe)).toBe(true);
    await expect(provider.inspect(recipe)).resolves.toMatchObject({
      title: entry!.title,
      sourceRevision: entry!.revision,
      contentProfile: entry!.contentProfile
    });
    const prepared = await provider.prepare(recipe, { kind: 'article', articleId: entry!.id });
    expect(prepared).toMatchObject({
      materialId: entry!.id,
      sourceRevision: entry!.revision,
      contentProfile: entry!.contentProfile,
      selectedRange: { kind: 'article', articleId: entry!.id }
    });
    expect(prepared.counts.printableUnits).toBeGreaterThanOrEqual(500);

    const exposed = await provider.inspect(recipe);
    exposed.counts.graphemes = 0;
    await expect(provider.inspect(recipe)).resolves.not.toMatchObject({
      counts: { graphemes: 0 }
    });
  });

  it('rejects missing entries and an article range targeting another entry', async () => {
    const provider = new BuiltInPackProvider();
    const first = BUILT_IN_PACK_MANIFEST.entries[0];

    await expect(provider.inspect({ kind: 'builtIn', materialId: 'missing-entry' }))
      .rejects.toThrow('Built-in practice material not found');
    await expect(provider.prepare(
      { kind: 'builtIn', materialId: first.id },
      { kind: 'article', articleId: 'another-entry' }
    )).rejects.toThrow('does not match');
  });
});
