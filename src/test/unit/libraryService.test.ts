import { describe, expect, it, vi } from 'vitest';
import type { BookAdapter, BookHandle } from '../../adapters/bookAdapter';
import { AdapterRegistry } from '../../adapters/adapterRegistry';
import { createBookCapabilities, type BookFormat, type BookRecord } from '../../domain/books';
import { LibraryService } from '../../library/libraryService';
import { BookLibraryStore } from '../../storage/bookLibraryStore';
import { ReadingProgressStore } from '../../storage/readingProgressStore';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  async update(key: string, value: unknown): Promise<void> { this.values.set(key, value); }
}

function adapter(format: BookFormat, inspect = vi.fn(async () => ({ title: `${format} book`, authors: [] }))): BookAdapter {
  return { format, inspect, open: vi.fn(async () => ({} as BookHandle)) };
}

function record(format: BookFormat, uri = `file:///books/book.${format}`): BookRecord {
  const base = {
    schemaVersion: 2 as const, id: 'book-1', uri, source: 'external' as const,
    title: 'Book', authors: [], capabilities: createBookCapabilities(format), createdAt: 10, updatedAt: 10
  };
  return format === 'txt'
    ? { ...base, format, formatData: { encoding: 'utf8' } }
    : { ...base, format, formatData: {} };
}

function setup(adapters: BookAdapter[], cleanup = {}) {
  const books = new BookLibraryStore(new MemoryMemento());
  const progress = new ReadingProgressStore(new MemoryMemento());
  const service = new LibraryService(books, progress, new AdapterRegistry(adapters), {
    now: () => 100,
    createId: () => 'new-book',
    exists: async () => true,
    ...cleanup
  });
  return { service, books, progress };
}

describe('LibraryService', () => {
  it('prefers the extension adapter, falls back to content inspection, and writes only after inspect succeeds', async () => {
    const txtInspect = vi.fn().mockRejectedValue(new Error('not text'));
    const epubInspect = vi.fn(async () => ({ title: 'Detected EPUB', authors: ['Author'], packageIdentifier: 'id' }));
    const { service, books } = setup([adapter('txt', txtInspect), adapter('epub', epubInspect)]);

    const imported = await service.importBook('file:///books/disguised.txt', 'external');

    expect(txtInspect).toHaveBeenCalledOnce();
    expect(epubInspect).toHaveBeenCalledOnce();
    expect(imported).toMatchObject({ id: 'new-book', format: 'epub', title: 'Detected EPUB' });
    expect(books.list()).toEqual([imported]);
  });

  it('does not write a record when every adapter rejects the file and deduplicates an existing URI', async () => {
    const failing = adapter('txt', vi.fn().mockRejectedValue(new Error('bad file')));
    const { service, books } = setup([failing]);
    await expect(service.importBook('file:///books/bad.txt', 'external')).rejects.toThrow('Unsupported or invalid book');
    expect(books.list()).toEqual([]);

    const valid = setup([adapter('txt')]);
    const first = await valid.service.importBook('file:///books/one.txt', 'external');
    const second = await valid.service.importBook('file:///books/one.txt', 'external');
    expect(second.id).toBe(first.id);
    expect(valid.books.list()).toHaveLength(1);
  });

  it('removes plugin state and active sessions without deleting the source file', async () => {
    const clearReader = vi.fn(async () => undefined);
    const clearTyping = vi.fn(async () => undefined);
    const deleteSource = vi.fn();
    const { service, books, progress } = setup([adapter('txt')], { clearReader, clearTyping, deleteSource });
    await books.upsert(record('txt'));
    await progress.save({ bookId: 'book-1', locator: { kind: 'txt', sectionId: 's', progression: 0.4 }, bookProgression: 0.4, updatedAt: 10 });

    await service.removeBook('book-1');

    expect(books.get('book-1')).toBeUndefined();
    expect(progress.get('book-1')).toBeUndefined();
    expect(clearReader).toHaveBeenCalledWith('book-1');
    expect(clearTyping).toHaveBeenCalledWith('book-1');
    expect(deleteSource).not.toHaveBeenCalled();
  });

  it('validates relocation format while preserving identity and progress', async () => {
    const { service, books, progress } = setup([adapter('txt'), adapter('epub')]);
    await books.upsert(record('txt'));
    await progress.save({ bookId: 'book-1', locator: { kind: 'txt', sectionId: 's', progression: 0.4 }, bookProgression: 0.4, updatedAt: 10 });

    await expect(service.relocateBook('book-1', 'file:///moved/book.epub')).rejects.toThrow('same format');
    const relocated = await service.relocateBook('book-1', 'file:///moved/book.txt');
    expect(relocated).toMatchObject({ id: 'book-1', uri: 'file:///moved/book.txt', updatedAt: 100 });
    expect(progress.get('book-1')?.bookProgression).toBe(0.4);
  });

  it('scans missing sources without mutating library records', async () => {
    const { service, books } = setup([adapter('txt')], { exists: async (uri: string) => !uri.includes('missing') });
    await books.upsert(record('txt', 'file:///books/present.txt'));
    await books.upsert({ ...record('txt', 'file:///books/missing.txt'), id: 'missing' });
    await expect(service.scanAvailability()).resolves.toEqual({ 'book-1': true, missing: false });
    expect(books.list()).toHaveLength(2);
  });
});
