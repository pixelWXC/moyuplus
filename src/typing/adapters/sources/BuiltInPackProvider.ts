import {
  BUILT_IN_PACK_MANIFEST,
  type BuiltInPackEntry,
  type BuiltInPackManifest
} from '../../assets';
import type {
  ContentDescriptor,
  ContentProvider,
  ContentRecipe,
  PreparedContent,
  SourceRange
} from '../../domain/content';
import { preparePracticeContent } from '../../domain/content';

export {
  BUILT_IN_PACK_MANIFEST,
  type BuiltInPackEntry,
  type BuiltInPackManifest
} from '../../assets';

export interface BuiltInCoverageCounts {
  chineseModernArticles: number;
  chineseNewsArticles: number;
  chineseFictionArticles: number;
  chineseCommonSentences: number;
  englishWords: number;
  englishSentences: number;
  englishArticles: number;
  mixedProgrammerItems: number;
  mixedOfficeItems: number;
  frequentHanzi: number;
  idioms: number;
  phrases: number;
  punctuationSets: number;
  specialSymbols: number;
  javascriptSnippets: number;
  typescriptSnippets: number;
  htmlSnippets: number;
  cssSnippets: number;
}

export interface BuiltInCoverageReport {
  counts: BuiltInCoverageCounts;
  missing: string[];
}

export class BuiltInPackProvider implements ContentProvider {
  constructor(
    private readonly manifest: BuiltInPackManifest = BUILT_IN_PACK_MANIFEST
  ) {}

  canResolve(recipe: ContentRecipe): boolean {
    return recipe.kind === 'builtIn';
  }

  async inspect(recipe: ContentRecipe): Promise<ContentDescriptor> {
    const entry = this.requireEntry(recipe);
    const prepared = this.prepareEntry(entry, { kind: 'whole' });
    return {
      title: entry.title,
      sourceRevision: entry.revision,
      contentProfile: structuredClone(entry.contentProfile),
      counts: structuredClone(prepared.counts),
      ranges: isArticle(entry)
        ? [{ kind: 'article', articleId: entry.id }]
        : [{ kind: 'whole' }]
    };
  }

  async prepare(recipe: ContentRecipe, range: SourceRange): Promise<PreparedContent> {
    const entry = this.requireEntry(recipe);
    if (range.kind === 'article' && range.articleId && range.articleId !== entry.id) {
      throw new Error(
        `Built-in article range ${range.articleId} does not match material ${entry.id}.`
      );
    }
    const effectiveRange = range.kind === 'article' ? { kind: 'whole' } as const : range;
    const prepared = this.prepareEntry(entry, effectiveRange);
    return range.kind === 'article'
      ? { ...prepared, selectedRange: structuredClone(range) }
      : prepared;
  }

  private requireEntry(recipe: ContentRecipe): BuiltInPackEntry {
    if (recipe.kind !== 'builtIn') {
      throw new Error(`BuiltInPackProvider cannot resolve recipe: ${recipe.kind}`);
    }
    const entry = this.manifest.entries.find(value => value.id === recipe.materialId);
    if (!entry) {
      throw new Error(`Built-in practice material not found: ${recipe.materialId}`);
    }
    return entry;
  }

  private prepareEntry(entry: BuiltInPackEntry, range: SourceRange): PreparedContent {
    return preparePracticeContent(entry.body, {
      materialId: entry.id,
      sourceRevision: entry.revision,
      contentProfile: entry.contentProfile,
      range
    });
  }
}

export function validateBuiltInCoverage(
  manifest: BuiltInPackManifest
): BuiltInCoverageReport {
  const itemCount = (predicate: (entry: BuiltInPackEntry) => boolean) => (
    manifest.entries
      .filter(predicate)
      .reduce((total, entry) => total + actualItemCount(entry), 0)
  );
  const entryCount = (predicate: (entry: BuiltInPackEntry) => boolean) => (
    manifest.entries.filter(predicate).length
  );
  const profile = (
    kind: BuiltInPackEntry['contentProfile']['kind'],
    category?: string
  ) => (entry: BuiltInPackEntry) => (
    entry.contentProfile.kind === kind
    && (category === undefined || (
      'category' in entry.contentProfile && entry.contentProfile.category === category
    ))
  );
  const code = (language: string) => (entry: BuiltInPackEntry) => (
    entry.contentProfile.kind === 'code' && entry.contentProfile.language === language
  );

  const counts: BuiltInCoverageCounts = {
    chineseModernArticles: entryCount(profile('chinese', 'modernArticle')),
    chineseNewsArticles: entryCount(profile('chinese', 'news')),
    chineseFictionArticles: entryCount(profile('chinese', 'fiction')),
    chineseCommonSentences: itemCount(profile('chinese', 'commonSentence')),
    englishWords: itemCount(profile('english', 'word')),
    englishSentences: itemCount(profile('english', 'sentence')),
    englishArticles: entryCount(profile('english', 'article')),
    mixedProgrammerItems: itemCount(profile('mixed', 'programmer')),
    mixedOfficeItems: itemCount(profile('mixed', 'office')),
    frequentHanzi: itemCount(profile('randomChinese', 'frequentHanzi')),
    idioms: itemCount(profile('randomChinese', 'idiom')),
    phrases: itemCount(profile('randomChinese', 'phrase')),
    punctuationSets: entryCount(profile('numberSymbol', 'punctuation')),
    specialSymbols: itemCount(profile('numberSymbol', 'specialSymbol')),
    javascriptSnippets: itemCount(code('javascript')),
    typescriptSnippets: itemCount(code('typescript')),
    htmlSnippets: itemCount(code('html')),
    cssSnippets: itemCount(code('css'))
  };

  const missing: string[] = [];
  const requireAtLeast = (key: keyof BuiltInCoverageCounts, minimum: number) => {
    if (counts[key] < minimum) missing.push(`${key}: expected at least ${minimum}, got ${counts[key]}`);
  };
  requireAtLeast('chineseModernArticles', 5);
  requireAtLeast('chineseNewsArticles', 5);
  requireAtLeast('chineseFictionArticles', 5);
  requireAtLeast('chineseCommonSentences', 50);
  requireAtLeast('englishWords', 200);
  requireAtLeast('englishSentences', 50);
  requireAtLeast('englishArticles', 5);
  requireAtLeast('mixedProgrammerItems', 25);
  requireAtLeast('mixedOfficeItems', 25);
  requireAtLeast('frequentHanzi', 500);
  requireAtLeast('idioms', 100);
  requireAtLeast('phrases', 100);
  requireAtLeast('punctuationSets', 2);
  requireAtLeast('specialSymbols', 32);
  requireAtLeast('javascriptSnippets', 10);
  requireAtLeast('typescriptSnippets', 10);
  requireAtLeast('htmlSnippets', 10);
  requireAtLeast('cssSnippets', 10);

  for (const entry of manifest.entries) {
    if (!entry.source.license.trim() || !entry.source.attribution.trim()) {
      missing.push(`${entry.id}: source notice is incomplete`);
    }
    if (
      entry.itemCount !== undefined
      && entry.itemCount !== actualItemCount(entry)
    ) {
      missing.push(
        `${entry.id}: manifest itemCount ${entry.itemCount} does not match body count ${actualItemCount(entry)}`
      );
    }
    if (isArticle(entry)) {
      const printable = preparePracticeContent(entry.body, {
        sourceRevision: entry.revision,
        contentProfile: entry.contentProfile,
        range: { kind: 'whole' }
      }).counts.printableUnits;
      if (printable < 500) missing.push(`${entry.id}: expected at least 500 printable units`);
    }
  }

  return { counts, missing };
}

function isArticle(entry: BuiltInPackEntry): boolean {
  return (
    (entry.contentProfile.kind === 'chinese'
      && ['modernArticle', 'news', 'fiction'].includes(entry.contentProfile.category))
    || (entry.contentProfile.kind === 'english'
      && entry.contentProfile.category === 'article')
  );
}

function actualItemCount(entry: BuiltInPackEntry): number {
  if (entry.contentProfile.kind === 'code') {
    return entry.body.split('\n\n---\n\n').filter(Boolean).length;
  }
  if (
    entry.contentProfile.kind === 'numberSymbol'
    || (
      entry.contentProfile.kind === 'randomChinese'
      && entry.contentProfile.category === 'frequentHanzi'
    )
  ) {
    return Array.from(entry.body).length;
  }
  return entry.body.split('\n').filter(Boolean).length;
}
