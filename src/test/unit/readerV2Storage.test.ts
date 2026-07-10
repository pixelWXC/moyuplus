import { describe, expect, it } from 'vitest';
import { createBookCapabilities, type BookRecord } from '../../domain/books';
import type { ReadingPosition } from '../../domain/locators';
import { createDefaultReaderPreferences } from '../../domain/readerPreferences';
import { BookLibraryStore } from '../../storage/bookLibraryStore';
import { ReadingProgressStore } from '../../storage/readingProgressStore';
import { ReaderPreferencesStore } from '../../storage/readerPreferencesStore';
import {
  BOOK_LIBRARY_KEY,
  READER_PREFERENCES_KEY,
  READER_V2_MIGRATION_KEY,
  READING_PROGRESS_KEY
} from '../../storage/storageKeys';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  constructor(initialValues: Record<string, unknown> = {}) {
    Object.entries(initialValues).forEach(([key, value]) => this.values.set(key, value));
  }

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

const now = 1_788_888_888_000;

function book(overrides: Partial<BookRecord> = {}): BookRecord {
  return {
    schemaVersion: 2,
    id: 'book-1',
    uri: 'file:///books/one.txt',
    source: 'external',
    title: 'One',
    authors: [],
    capabilities: createBookCapabilities('txt'),
    createdAt: now,
    updatedAt: now,
    format: 'txt',
    formatData: { encoding: 'utf8' },
    ...overrides
  } as BookRecord;
}

function position(bookId: string, progression: number): ReadingPosition {
  return {
    bookId,
    locator: { kind: 'txt', sectionId: 'txt:0', progression, offset: Math.round(progression * 100) },
    bookProgression: progression,
    updatedAt: now
  };
}

describe('Reader v2 storage keys', () => {
  it('uses the versioned keys from the migration contract', () => {
    expect(BOOK_LIBRARY_KEY).toBe('moyuplus.bookLibrary.v2');
    expect(READING_PROGRESS_KEY).toBe('moyuplus.readingProgress.v2');
    expect(READER_PREFERENCES_KEY).toBe('moyuplus.readerPreferences.v1');
    expect(READER_V2_MIGRATION_KEY).toBe('moyuplus.readerV2Migration.v1');
  });
});

describe('BookLibraryStore', () => {
  it('upserts, reads, removes, and deduplicates the same URI while preserving stable identity', async () => {
    const state = new MemoryMemento();
    const store = new BookLibraryStore(state);

    await store.upsert(book());
    await store.upsert(
      book({
        id: 'duplicate-id',
        title: 'Updated title',
        createdAt: now - 1_000,
        updatedAt: now - 500
      })
    );

    expect(store.list()).toHaveLength(1);
    expect(store.get('book-1')).toMatchObject({
      id: 'book-1',
      title: 'Updated title',
      createdAt: now,
      updatedAt: now
    });
    expect(store.getByUri('file:///books/one.txt')?.id).toBe('book-1');

    await store.upsert(book({ id: 'book-2', uri: 'file:///books/two.txt', title: 'Two' }));
    expect(store.list().map(({ id }) => id)).toEqual(['book-1', 'book-2']);
    await store.remove('book-1');
    expect(store.list().map(({ id }) => id)).toEqual(['book-2']);
  });

  it('relocates only the URI and leaves ID and separately stored progress unchanged', async () => {
    const libraryState = new MemoryMemento();
    const progressState = new MemoryMemento();
    const library = new BookLibraryStore(libraryState);
    const progress = new ReadingProgressStore(progressState);
    await library.upsert(book());
    await progress.save(position('book-1', 0.4));

    const relocated = await library.relocate('book-1', 'file:///moved/one.txt');

    expect(relocated).toEqual({ ...book(), uri: 'file:///moved/one.txt' });
    expect(progress.get('book-1')).toEqual(position('book-1', 0.4));
  });

  it('filters damaged records without blocking activation', () => {
    const store = new BookLibraryStore(
      new MemoryMemento({ [BOOK_LIBRARY_KEY]: [book(), null, { id: 'bad' }, { ...book(), uri: 'not a URI' }] })
    );

    expect(store.list()).toEqual([book()]);
  });
});

describe('ReadingProgressStore', () => {
  it('reads, writes, and removes positions independently by book ID', async () => {
    const store = new ReadingProgressStore(new MemoryMemento());
    await store.save(position('book-1', 0.2));
    await store.save(position('book-2', 0.8));

    expect(store.get('book-1')).toEqual(position('book-1', 0.2));
    expect(store.list().map(({ bookId }) => bookId)).toEqual(['book-1', 'book-2']);

    await store.remove('book-1');
    expect(store.get('book-1')).toBeUndefined();
    expect(store.get('book-2')).toEqual(position('book-2', 0.8));
  });

  it('filters damaged state and never serializes transient text or content', async () => {
    const state = new MemoryMemento({
      [READING_PROGRESS_KEY]: [position('valid', 0.5), null, { bookId: 'bad' }]
    });
    const store = new ReadingProgressStore(state);
    expect(store.list()).toEqual([position('valid', 0.5)]);

    await store.save({
      ...position('valid', 0.6),
      locator: { ...position('valid', 0.6).locator, textQuote: 'secret body' },
      textQuote: 'secret body',
      content: '正文'
    } as unknown as ReadingPosition);

    expect(JSON.stringify(state.get(READING_PROGRESS_KEY))).not.toMatch(/textQuote|secret body|正文/);
  });
});

describe('ReaderPreferencesStore', () => {
  it('reads safe defaults and saves normalized global preferences', async () => {
    const state = new MemoryMemento();
    const store = new ReaderPreferencesStore(state);
    expect(store.get()).toEqual(createDefaultReaderPreferences());

    const saved = await store.save({ ...createDefaultReaderPreferences(), fontSize: 100, theme: 'sepia' });
    expect(saved).toEqual({ ...createDefaultReaderPreferences(), fontSize: 32, theme: 'sepia' });
    expect(state.get(READER_PREFERENCES_KEY)).toEqual(saved);
  });
});
