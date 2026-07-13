import type { BookRecord } from '../domain/books';
import type { BookLibraryStore } from '../storage/bookLibraryStore';
import type { TxtAdapter } from '../adapters/txt/txtAdapter';

export interface TypingSourceCatalogLike {
  list(): BookRecord[];
  getPhysicalLines(bookId: string): Promise<string[]>;
}

export class TypingSourceCatalog implements TypingSourceCatalogLike {
  constructor(
    private readonly books?: BookLibraryStore,
    private readonly txtAdapter?: TxtAdapter
  ) {}

  filter(books: readonly BookRecord[]): BookRecord[] {
    return books.filter((book) => book.format === 'txt' && book.capabilities.typing);
  }

  list(): BookRecord[] {
    return this.filter(this.books?.list() ?? []);
  }

  async getPhysicalLines(bookId: string): Promise<string[]> {
    const book = this.list().find((candidate) => candidate.id === bookId);
    if (!book || book.format !== 'txt' || !this.txtAdapter) {
      throw new Error(`Book ${bookId} is not available for typing practice.`);
    }
    const handle = await this.txtAdapter.open(book);
    try {
      return await handle.getPhysicalLines();
    } finally {
      handle.dispose();
    }
  }
}
