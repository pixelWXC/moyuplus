import { createHash } from 'node:crypto';
import type { BookAdapter, BookHandle, SectionRef } from '../../../adapters/bookAdapter';
import type { BookFormat, BookRecord } from '../../../domain/books';
import { stripImmersiveResourceAnchors } from '../../../domain/immersiveProjection';
import {
  inferAdHocContentProfile,
  normalizeMaterialText,
  preparePracticeContent,
  type ContentDescriptor,
  type ContentProvider,
  type ContentRecipe,
  type PreparedContent,
  type SourceRange
} from '../../domain/content';

export interface ReaderBookCatalogPort {
  get(bookId: string): BookRecord | undefined;
}

export interface ReaderBookAdapterRegistryPort {
  get(format: BookFormat): BookAdapter;
}

export class ReaderBookSourceProvider implements ContentProvider {
  constructor(
    private readonly books: ReaderBookCatalogPort,
    private readonly adapters: ReaderBookAdapterRegistryPort
  ) {}

  canResolve(recipe: ContentRecipe): boolean {
    return recipe.kind === 'readerBook';
  }

  async inspect(recipe: ContentRecipe): Promise<ContentDescriptor> {
    const book = this.requireBook(recipe);
    const loaded = await this.load(book, { kind: 'whole' });
    const prepared = preparePracticeContent(loaded.text, {
      sourceRevision: loaded.revision,
      contentProfile: inferAdHocContentProfile(loaded.text),
      range: { kind: 'whole' }
    });
    return {
      title: book.title,
      sourceRevision: loaded.revision,
      contentProfile: structuredClone(prepared.contentProfile),
      counts: structuredClone(prepared.counts),
      ranges: [
        { kind: 'whole' },
        ...loaded.sections.map(section => ({
          kind: 'chapter' as const,
          chapterId: section.id
        }))
      ]
    };
  }

  async prepare(
    recipe: ContentRecipe,
    range: SourceRange
  ): Promise<PreparedContent> {
    if (range.kind !== 'whole' && range.kind !== 'chapter') {
      throw new Error(`Reader book range is unsupported: ${range.kind}`);
    }
    const book = this.requireBook(recipe);
    const loaded = await this.load(book, range);
    const prepared = preparePracticeContent(loaded.text, {
      sourceRevision: loaded.revision,
      contentProfile: inferAdHocContentProfile(loaded.text),
      range: { kind: 'whole' }
    });
    return {
      ...prepared,
      selectedRange: structuredClone(range)
    };
  }

  private requireBook(recipe: ContentRecipe): BookRecord {
    if (recipe.kind !== 'readerBook') {
      throw new Error(
        `ReaderBookSourceProvider cannot resolve recipe: ${recipe.kind}`
      );
    }
    const book = this.books.get(recipe.bookId);
    if (!book) {
      throw new Error(`Reader book is unavailable: ${recipe.bookId}`);
    }
    return book;
  }

  private async load(
    book: BookRecord,
    range: Extract<SourceRange, { kind: 'whole' | 'chapter' }>
  ): Promise<{
    text: string;
    revision: string;
    sections: SectionRef[];
  }> {
    const handle = await this.adapters.get(book.format).open(book);
    try {
      const sections = (await handle.getSections())
        .slice()
        .sort((left, right) => left.order - right.order);
      if (sections.length === 0) {
        throw new Error(`Reader book contains no readable chapters: ${book.id}`);
      }
      const selected = range.kind === 'chapter'
        ? [requireSection(sections, range.chapterId)]
        : sections;
      const loaded = await readSections(handle, selected);
      if (loaded.length === 0) {
        throw new Error(`Reader book contains no practice text: ${book.id}`);
      }
      const text = normalizeMaterialText(
        loaded.map(section => section.text).join('\n\n')
      );
      return {
        text,
        sections,
        revision: createHash('sha256')
          .update('typing-reader-book-v1\0')
          .update(book.id)
          .update('\0')
          .update(loaded.map(section => (
            `${section.id}\0${section.revision}\0${section.text}`
          )).join('\0'))
          .digest('hex')
      };
    } finally {
      handle.dispose();
    }
  }
}

async function readSections(
  handle: BookHandle,
  sections: readonly SectionRef[]
): Promise<Array<{ id: string; revision: string; text: string }>> {
  const loaded: Array<{ id: string; revision: string; text: string }> = [];
  for (const section of sections) {
    const document = await handle.getSection(section.id);
    const text = normalizeMaterialText(stripImmersiveResourceAnchors(document.immersiveProjection));
    if (text.length === 0) continue;
    loaded.push({
      id: section.id,
      revision: document.sourceRevision,
      text
    });
  }
  return loaded;
}

function requireSection(
  sections: readonly SectionRef[],
  chapterId: string
): SectionRef {
  const section = sections.find(candidate => candidate.id === chapterId);
  if (!section) {
    throw new Error(`Reader book chapter is unavailable: ${chapterId}`);
  }
  return section;
}
