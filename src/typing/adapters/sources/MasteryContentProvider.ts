import { createHash } from 'node:crypto';
import type {
  ContentDescriptor,
  ContentProvider,
  ContentRecipe,
  PreparedContent,
  SourceRange
} from '../../domain/content';
import { preparePracticeContent } from '../../domain/content';
import type { MasteryEntry } from '../../domain/mastery';

export interface MasteryEntrySource {
  list(): Promise<readonly MasteryEntry[]>;
}

export class MasteryContentProvider implements ContentProvider {
  constructor(private readonly source: MasteryEntrySource) {}

  canResolve(recipe: ContentRecipe): boolean {
    return recipe.kind === 'mastery';
  }

  async inspect(recipe: ContentRecipe): Promise<ContentDescriptor> {
    const prepared = await this.prepareRecipe(recipe, { kind: 'whole' });
    return {
      title: '错字强化',
      sourceRevision: prepared.sourceRevision,
      contentProfile: structuredClone(prepared.contentProfile),
      counts: structuredClone(prepared.counts),
      ranges: [{ kind: 'whole' }]
    };
  }

  async prepare(recipe: ContentRecipe, range: SourceRange): Promise<PreparedContent> {
    return this.prepareRecipe(recipe, range);
  }

  private async prepareRecipe(
    recipe: ContentRecipe,
    range: SourceRange
  ): Promise<PreparedContent> {
    if (recipe.kind !== 'mastery') {
      throw new Error(`MasteryContentProvider cannot resolve recipe: ${recipe.kind}`);
    }
    if (!recipe.seed.trim()) throw new Error('Mastery practice content requires a seed.');
    if (!Number.isInteger(recipe.length) || recipe.length <= 0) {
      throw new Error('Mastery practice content requires a positive target length.');
    }
    const entries = (await this.source.list())
      .filter(entry => (
        entry.key.length > 0
        && (entry.kind === 'word' || entry.kind === 'codeToken')
      ))
      .map(entry => structuredClone(entry))
      .sort((left, right) => (
        left.lastPracticedAt - right.lastPracticedAt
          || right.score - left.score
          || left.key.localeCompare(right.key)
      ));
    if (entries.length === 0) {
      throw new Error('No mastery entries are available yet. Complete a practice first.');
    }
    const selectedKind = entries[0].kind;
    const selectedEntries = entries
      .filter(entry => entry.kind === selectedKind)
      .slice(0, recipe.length);
    const text = selectedEntries.map(entry => entry.key).join('\n');
    const revisionInput = entries.map(entry => ({
      key: entry.key,
      kind: entry.kind,
      wrongCount: entry.wrongCount,
      score: entry.score,
      algorithmVersion: entry.algorithmVersion
    }));
    const digest = createHash('sha256')
      .update(JSON.stringify(revisionInput), 'utf8')
      .digest('hex')
      .slice(0, 16);
    const categories = new Set(selectedEntries.map(entry => entry.kind));
    const category = categories.size === 1
      ? selectedEntries[0].kind
      : 'mixed';
    return preparePracticeContent(text, {
      sourceRevision: `mastery-v1-${digest}`,
      contentProfile: { kind: 'mastery', category },
      generatorSeed: recipe.seed,
      range
    });
  }
}
