import { createHash } from 'node:crypto';
import {
  BUILT_IN_PACK_MANIFEST,
  type BuiltInPackEntry,
  type BuiltInPackManifest
} from '../../assets';
import type {
  ContentDescriptor,
  ContentProfile,
  ContentProvider,
  ContentRecipe,
  GeneratorKind,
  PreparedContent,
  SourceRange
} from '../../domain/content';
import { preparePracticeContent } from '../../domain/content';
import {
  generateDeterministicContent,
  type DeterministicGeneratorKind,
  type GeneratorPools
} from '../../domain/generators';

export class GeneratedContentProvider implements ContentProvider {
  private readonly pools: GeneratorPools;

  constructor(manifest: BuiltInPackManifest = BUILT_IN_PACK_MANIFEST) {
    this.pools = createPools(manifest);
  }

  canResolve(recipe: ContentRecipe): boolean {
    return recipe.kind === 'generated' && recipe.generator !== 'mastery';
  }

  async inspect(recipe: ContentRecipe): Promise<ContentDescriptor> {
    const prepared = this.prepareRecipe(recipe, { kind: 'whole' });
    return {
      title: recipe.kind === 'generated'
        ? generatedTitle(recipe.generator)
        : 'Generated practice content',
      sourceRevision: prepared.sourceRevision,
      contentProfile: structuredClone(prepared.contentProfile),
      counts: structuredClone(prepared.counts),
      ranges: [{ kind: 'whole' }]
    };
  }

  async prepare(recipe: ContentRecipe, range: SourceRange): Promise<PreparedContent> {
    return this.prepareRecipe(recipe, range);
  }

  private prepareRecipe(recipe: ContentRecipe, range: SourceRange): PreparedContent {
    if (recipe.kind !== 'generated') {
      throw new Error(`GeneratedContentProvider cannot resolve recipe: ${recipe.kind}`);
    }
    if (recipe.generator === 'mastery') {
      throw new Error('Mastery recipes must be resolved by MasteryContentProvider.');
    }
    const generated = generateDeterministicContent({
      kind: recipe.generator,
      seed: recipe.seed,
      targetUnits: recipe.length ?? 100
    }, this.pools);
    const digest = createHash('sha256')
      .update(generated.text, 'utf8')
      .digest('hex')
      .slice(0, 16);
    return preparePracticeContent(generated.text, {
      sourceRevision: `${recipe.generator}-${generated.algorithmVersion}-${digest}`,
      contentProfile: profileFor(recipe.generator),
      generatorSeed: generated.seed,
      range
    });
  }
}

function createPools(manifest: BuiltInPackManifest): GeneratorPools {
  const byProfile = (predicate: (entry: BuiltInPackEntry) => boolean): string[] => (
    manifest.entries.filter(predicate).flatMap(entry => splitEntry(entry))
  );
  const category = (kind: ContentProfile['kind'], value: string) => (
    (entry: BuiltInPackEntry) => entry.contentProfile.kind === kind
      && 'category' in entry.contentProfile
      && entry.contentProfile.category === value
  );
  return {
    commonSentences: byProfile(category('chinese', 'commonSentence')),
    englishWords: byProfile(category('english', 'word')),
    englishSentences: byProfile(category('english', 'sentence')),
    mixedProgrammer: byProfile(category('mixed', 'programmer')),
    mixedOffice: byProfile(category('mixed', 'office')),
    frequentHanzi: byProfile(category('randomChinese', 'frequentHanzi'))
      .flatMap(value => Array.from(value)),
    idiom: byProfile(category('randomChinese', 'idiom')),
    phrase: byProfile(category('randomChinese', 'phrase')),
    punctuation: byProfile(category('numberSymbol', 'punctuation'))
      .flatMap(value => Array.from(value)),
    specialSymbol: byProfile(category('numberSymbol', 'specialSymbol'))
      .flatMap(value => Array.from(value)),
    code: byProfile(entry => entry.contentProfile.kind === 'code')
  };
}

function splitEntry(entry: BuiltInPackEntry): string[] {
  if (entry.contentProfile.kind === 'code') {
    return entry.body.split('\n\n---\n\n').filter(Boolean);
  }
  if (
    (entry.contentProfile.kind === 'randomChinese'
      && entry.contentProfile.category === 'frequentHanzi')
    || entry.contentProfile.kind === 'numberSymbol'
  ) {
    return [entry.body];
  }
  return entry.body.split('\n').filter(Boolean);
}

function profileFor(generator: DeterministicGeneratorKind): ContentProfile {
  switch (generator) {
    case 'commonSentences':
      return { kind: 'chinese', category: 'commonSentence' };
    case 'englishWords':
      return { kind: 'english', category: 'word' };
    case 'englishSentences':
      return { kind: 'english', category: 'sentence' };
    case 'mixedProgrammer':
      return { kind: 'mixed', category: 'programmer' };
    case 'mixedOffice':
      return { kind: 'mixed', category: 'office' };
    case 'frequentHanzi':
      return { kind: 'randomChinese', category: 'frequentHanzi' };
    case 'idiom':
      return { kind: 'randomChinese', category: 'idiom' };
    case 'phrase':
      return { kind: 'randomChinese', category: 'phrase' };
    case 'phone':
      return { kind: 'numberSymbol', category: 'phone' };
    case 'date':
      return { kind: 'numberSymbol', category: 'date' };
    case 'amount':
      return { kind: 'numberSymbol', category: 'amount' };
    case 'punctuation':
      return { kind: 'numberSymbol', category: 'punctuation' };
    case 'specialSymbol':
      return { kind: 'numberSymbol', category: 'specialSymbol' };
    case 'code':
      return { kind: 'code', language: 'mixed' };
  }
}

function generatedTitle(generator: GeneratorKind): string {
  return `Generated ${generator} practice`;
}
