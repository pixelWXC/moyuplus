import { normalizeBookRecord, type BookRecord } from '../domain/books';
import type { StateMemento } from './memento';
import { BOOK_LIBRARY_KEY } from './storageKeys';

export class BookLibraryStore {
  constructor(private readonly state: StateMemento) {}

  list(): BookRecord[] {
    const value = this.state.get<unknown>(BOOK_LIBRARY_KEY);
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((entry) => {
      const book = normalizeBookRecord(entry);
      return book ? [book] : [];
    });
  }

  get(bookId: string): BookRecord | undefined {
    return this.list().find((book) => book.id === bookId);
  }

  getByUri(uri: string): BookRecord | undefined {
    return this.list().find((book) => book.uri === uri);
  }

  async upsert(book: BookRecord): Promise<BookRecord[]> {
    const normalized = normalizeBookRecord(book);
    if (!normalized) {
      throw new Error('Cannot store an invalid Reader v2 book record.');
    }
    const books = this.list();
    const existingIndex = books.findIndex(
      (existing) => existing.id === normalized.id || existing.uri === normalized.uri
    );
    if (existingIndex >= 0) {
      const existing = books[existingIndex];
      const replacement = normalizeBookRecord({
        ...normalized,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: Math.max(existing.updatedAt, normalized.updatedAt)
      });
      if (!replacement) {
        throw new Error('Cannot merge an invalid duplicate Reader v2 book record.');
      }
      books[existingIndex] = replacement;
    } else {
      books.push(normalized);
    }
    await this.state.update(BOOK_LIBRARY_KEY, books);
    return books;
  }

  async relocate(bookId: string, uri: string): Promise<BookRecord | undefined> {
    const books = this.list();
    const existingIndex = books.findIndex((book) => book.id === bookId);
    if (existingIndex < 0) {
      return undefined;
    }
    if (books.some((book, index) => index !== existingIndex && book.uri === uri)) {
      throw new Error('Cannot relocate a book to a URI already used by another book.');
    }
    const relocated = normalizeBookRecord({ ...books[existingIndex], uri });
    if (!relocated) {
      throw new Error('Cannot relocate a book to an invalid URI.');
    }
    books[existingIndex] = relocated;
    await this.state.update(BOOK_LIBRARY_KEY, books);
    return relocated;
  }

  async remove(bookId: string): Promise<BookRecord[]> {
    const books = this.list().filter((book) => book.id !== bookId);
    await this.state.update(BOOK_LIBRARY_KEY, books);
    return books;
  }
}
