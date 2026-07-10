import type { BookRecord } from '../domain/books';
export class TypingSourceCatalog { filter(books: readonly BookRecord[]): BookRecord[] { return books.filter((book) => book.format === 'txt' && book.capabilities.typing); } }
