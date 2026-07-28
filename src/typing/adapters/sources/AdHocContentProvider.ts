import { createHash } from 'node:crypto';
import type {
  ContentDescriptor,
  ContentProvider,
  ContentRecipe,
  PreparedContent,
  SourceRange
} from '../../domain/content';
import {
  inferAdHocContentProfile,
  normalizeMaterialText,
  preparePracticeContent
} from '../../domain/content';

export class AdHocContentProvider implements ContentProvider {
  canResolve(recipe: ContentRecipe): boolean {
    return recipe.kind === 'adHoc';
  }

  async inspect(recipe: ContentRecipe): Promise<ContentDescriptor> {
    const prepared = this.prepareRecipe(recipe, { kind: 'whole' });
    return {
      title: '自由练习',
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
    if (recipe.kind !== 'adHoc') {
      throw new Error(`AdHocContentProvider cannot resolve recipe: ${recipe.kind}`);
    }
    const normalized = normalizeMaterialText(recipe.text);
    return preparePracticeContent(normalized, {
      sourceRevision: contentRevision(normalized, 'ad-hoc'),
      contentProfile: inferAdHocContentProfile(normalized),
      range
    });
  }
}

export function contentRevision(normalizedText: string, prefix: string): string {
  const digest = createHash('sha256').update(normalizedText, 'utf8').digest('hex').slice(0, 16);
  return `${prefix}-${digest}`;
}
