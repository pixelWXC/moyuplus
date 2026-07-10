import type { AdapterRegistry } from '../adapters/adapterRegistry';
import { stat } from 'node:fs/promises';
import { createBookCapabilities, createBookId, type BookFormat, type BookSource, type BookRecord } from '../domain/books';
import type { BookLibraryStore } from '../storage/bookLibraryStore';
import type { ReadingProgressStore } from '../storage/readingProgressStore';

export interface LibraryServiceOptions {
  now?: () => number;
  createId?: () => string;
  exists?: (uri: string) => Promise<boolean>;
  clearReader?: (bookId: string) => Promise<void>;
  clearTyping?: (bookId: string) => Promise<void>;
}

export class LibraryService {
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly exists: (uri: string) => Promise<boolean>;

  constructor(
    private readonly books: BookLibraryStore,
    private readonly progress: ReadingProgressStore,
    private readonly adapters: AdapterRegistry,
    private readonly options: LibraryServiceOptions = {}
  ) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? createBookId;
    this.exists = options.exists ?? fileExists;
  }

  async importBook(uri: string, source: BookSource): Promise<BookRecord> {
    const existing = this.books.getByUri(uri);
    if (existing) return existing;
    const inspected = await this.inspect(uri);
    const timestamp = this.now();
    const base = {
      schemaVersion: 2 as const, id: this.createId(), uri, source: inspected.metadata.source ?? source,
      title: inspected.metadata.title, authors: inspected.metadata.authors,
      capabilities: createBookCapabilities(inspected.format), createdAt: timestamp, updatedAt: timestamp
    };
    const record: BookRecord = inspected.format === 'txt'
      ? { ...base, format: 'txt', formatData: { encoding: inspected.metadata.encoding ?? 'utf8' } }
      : { ...base, format: 'epub', formatData: inspected.metadata.packageIdentifier ? { packageIdentifier: inspected.metadata.packageIdentifier } : {} };
    await this.books.upsert(record);
    return record;
  }

  async removeBook(bookId: string): Promise<void> {
    await this.progress.remove(bookId);
    await this.options.clearReader?.(bookId);
    await this.options.clearTyping?.(bookId);
    await this.books.remove(bookId);
  }

  async relocateBook(bookId: string, uri: string): Promise<BookRecord> {
    const book = this.books.get(bookId);
    if (!book) throw new Error(`Book ${bookId} is not in the library.`);
    const inspected = await this.inspect(uri);
    if (inspected.format !== book.format) throw new Error('A relocated book must have the same format as the original.');
    const relocated = await this.books.relocate(bookId, uri);
    if (!relocated) throw new Error(`Book ${bookId} is not in the library.`);
    const updated = { ...relocated, updatedAt: this.now() } as BookRecord;
    await this.books.upsert(updated);
    return this.books.get(bookId)!;
  }

  async scanAvailability(): Promise<Record<string, boolean>> {
    const entries = await Promise.all(this.books.list().map(async (book) => [book.id, await this.exists(book.uri)] as const));
    return Object.fromEntries(entries);
  }

  private async inspect(uri: string) {
    const preferred = formatFromUri(uri);
    const candidates = this.adapters.list().sort((left, right) => Number(right.format === preferred) - Number(left.format === preferred));
    for (const adapter of candidates) {
      try { return { format: adapter.format, metadata: await adapter.inspect(uri) }; } catch { /* try content with the next adapter */ }
    }
    throw new Error(`Unsupported or invalid book: ${uri}`);
  }
}

function formatFromUri(uri: string): BookFormat | undefined {
  const pathname = new URL(uri).pathname.toLowerCase();
  return pathname.endsWith('.txt') ? 'txt' : pathname.endsWith('.epub') ? 'epub' : undefined;
}

async function fileExists(uri: string): Promise<boolean> {
  try { await stat(new URL(uri)); return true; } catch { return false; }
}
