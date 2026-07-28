import type {
  ContentDescriptor,
  ContentProvider,
  ContentRecipe,
  PreparedContent,
  SourceRange
} from '../../domain/content';
import { preparePracticeContent } from '../../domain/content';
import type { ContentCatalogStore } from '../storage';

export class CustomMaterialProvider implements ContentProvider {
  constructor(private readonly catalog: ContentCatalogStore) {}

  canResolve(recipe: ContentRecipe): boolean {
    return recipe.kind === 'custom';
  }

  async inspect(recipe: ContentRecipe): Promise<ContentDescriptor> {
    const record = await this.requireRecord(recipe);
    return {
      title: record.title,
      sourceRevision: record.revision,
      contentProfile: structuredClone(record.contentProfile),
      counts: structuredClone(record.counts),
      ranges: record.chapters?.map(chapter => ({
        kind: 'chapter',
        chapterId: chapter.id
      })) ?? [{ kind: 'whole' }]
    };
  }

  async prepare(recipe: ContentRecipe, range: SourceRange): Promise<PreparedContent> {
    const record = await this.requireRecord(recipe);
    const body = await this.catalog.readBody(record.id, record.revision);
    const effectiveRange = range.kind === 'chapter'
      ? chapterSelection(record.chapters, range.chapterId)
      : range;
    const prepared = preparePracticeContent(body, {
      materialId: record.id,
      sourceRevision: record.revision,
      contentProfile: record.contentProfile,
      range: effectiveRange
    });
    return range.kind === 'chapter'
      ? { ...prepared, selectedRange: structuredClone(range) }
      : prepared;
  }

  private async requireRecord(recipe: ContentRecipe) {
    if (recipe.kind !== 'custom') {
      throw new Error(`CustomMaterialProvider cannot resolve recipe: ${recipe.kind}`);
    }
    const record = await this.catalog.get(recipe.materialId);
    if (!record) {
      throw new Error(`Practice material not found: ${recipe.materialId}`);
    }
    return record;
  }
}

function chapterSelection(
  chapters: { id: string; start: number; end: number }[] | undefined,
  chapterId: string
): SourceRange {
  const chapter = chapters?.find(value => value.id === chapterId);
  if (!chapter) {
    throw new Error(`Practice material chapter not found: ${chapterId}`);
  }
  return { kind: 'selection', start: chapter.start, end: chapter.end };
}
