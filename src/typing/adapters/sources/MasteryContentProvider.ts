import { createHash } from 'node:crypto';
import type {
  ContentDescriptor,
  ContentProvider,
  ContentRecipe,
  PreparedContent,
  SourceRange
} from '../../domain/content';
import { preparePracticeContent } from '../../domain/content';
import { createDeterministicRandom } from '../../domain/generators';
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
      .filter(entry => entry.key.length > 0)
      .map(entry => structuredClone(entry))
      .sort((left, right) => left.key.localeCompare(right.key));
    if (entries.length === 0) {
      throw new Error('No mastery entries are available yet. Complete a practice first.');
    }
    const text = selectWeightedEntries(entries, recipe.seed, recipe.length);
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
    const categories = new Set(entries.map(entry => entry.kind));
    const category = categories.size === 1
      ? entries[0].kind
      : 'mixed';
    return preparePracticeContent(text, {
      sourceRevision: `mastery-v1-${digest}`,
      contentProfile: { kind: 'mastery', category },
      generatorSeed: recipe.seed,
      range
    });
  }
}

function selectWeightedEntries(
  entries: readonly MasteryEntry[],
  seed: string,
  targetUnits: number
): string {
  const random = createDeterministicRandom(`mastery:${seed}`);
  const weights = entries.map(entry => Math.max(1, entry.score + entry.wrongCount));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const output: string[] = [];
  let length = 0;
  while (length < targetUnits) {
    let point = random() * totalWeight;
    let selected = entries[entries.length - 1];
    for (let index = 0; index < entries.length; index += 1) {
      point -= weights[index];
      if (point < 0) {
        selected = entries[index];
        break;
      }
    }
    output.push(selected.key);
    length += Array.from(selected.key).length + (output.length > 1 ? 1 : 0);
  }
  return output.join('\n');
}
