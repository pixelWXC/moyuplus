import { describe, expect, it, vi } from 'vitest';
import type { BookAdapter, BookHandle, SafeSectionDocument } from '../../adapters/bookAdapter';
import { AdapterRegistry } from '../../adapters/adapterRegistry';
import { createBookCapabilities, type BookRecord } from '../../domain/books';
import { ReaderController } from '../../reader/readerController';
import { BookLibraryStore } from '../../storage/bookLibraryStore';
import { ReadingProgressStore } from '../../storage/readingProgressStore';

class MemoryMemento { private values = new Map<string, unknown>(); get<T>(k: string): T | undefined { return this.values.get(k) as T; } async update(k: string, v: unknown) { this.values.set(k, v); } }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function book(id: string): BookRecord { return { schemaVersion: 2, id, uri: `file:///books/${id}.txt`, source: 'external', title: id, authors: [], capabilities: createBookCapabilities('txt'), createdAt: 1, updatedAt: 1, format: 'txt', formatData: { encoding: 'utf8' } }; }
function handle(id: string, section?: Promise<SafeSectionDocument>): BookHandle { return { getToc: async () => [{ title: id, sectionId: `${id}-s` }], getSections: async () => [{ id: `${id}-s`, order: 0, progressionWeight: 1 }], getSection: async () => section ?? { sectionId: `${id}-s`, sanitizedHtml: `<p>${id}</p>`, localResources: [], sourceRevision: 'r' }, normalizeLocator: async locator => locator, dispose: vi.fn() }; }

async function setup(open: BookAdapter['open']) {
  const books = new BookLibraryStore(new MemoryMemento()); const progress = new ReadingProgressStore(new MemoryMemento());
  await books.upsert(book('a')); await books.upsert(book('b'));
  const messages: unknown[] = [];
  const controller = new ReaderController(books, progress, new AdapterRegistry([{ format: 'txt', inspect: vi.fn(), open }]), message => { messages.push(message); }, { createRequestId: (() => { let n = 0; return () => `r${++n}`; })(), debounceMs: 5, now: () => 50 });
  return { controller, progress, messages };
}

describe('ReaderController', () => {
  it('disposes and drops a stale book response when books are switched quickly', async () => {
    const first = deferred<BookHandle>(); const second = deferred<BookHandle>();
    const { controller, messages } = await setup(vi.fn((record: BookRecord) => record.id === 'a' ? first.promise : second.promise));
    const a = controller.openBook('a'); const b = controller.openBook('b');
    second.resolve(handle('b')); await b; first.resolve(handle('a')); await a;
    expect(messages).toContainEqual(expect.objectContaining({ type: 'bookReady', bookId: 'b', requestId: 'r2' }));
    expect(messages).not.toContainEqual(expect.objectContaining({ type: 'bookReady', bookId: 'a' }));
  });

  it('drops a stale section response after a newer section request', async () => {
    const oldSection = deferred<SafeSectionDocument>(); const current = handle('a', oldSection.promise);
    const { controller, messages } = await setup(vi.fn(async () => current)); await controller.openBook('a');
    const old = controller.requestSection('a-s'); const replacement = controller.requestSection('a-s');
    oldSection.resolve({ sectionId: 'a-s', sanitizedHtml: '<p>old</p>', localResources: [], sourceRevision: 'old' });
    await Promise.all([old, replacement]);
    expect(messages.filter((x: any) => x.type === 'sectionReady')).toHaveLength(1);
  });

  it('debounces progress writes and flushes the latest locator', async () => {
    const { controller, progress } = await setup(vi.fn(async () => handle('a'))); await controller.openBook('a');
    controller.reportLayout({ kind: 'txt', sectionId: 'a-s', progression: 0.2 }, 0.2);
    controller.reportLayout({ kind: 'txt', sectionId: 'a-s', progression: 0.7 }, 0.7);
    await controller.flush();
    expect(progress.get('a')).toMatchObject({ bookId: 'a', bookProgression: 0.7, updatedAt: 50 });
  });

  it('maps open failures to an explicit reader error state', async () => {
    const { controller, messages } = await setup(vi.fn().mockRejectedValue(new Error('cannot open')));
    await controller.openBook('a');
    expect(messages).toContainEqual(expect.objectContaining({ type: 'readerError', code: 'openFailed', message: 'cannot open' }));
  });

  it('navigates to adjacent and requested sections while reporting book edges', async () => {
    const customHandle: BookHandle = {
      ...handle('a'),
      getSections: async () => [{ id: 'one', order: 0, progressionWeight: 1 }, { id: 'two', order: 1, progressionWeight: 1 }],
      getSection: async sectionId => ({ sectionId, sanitizedHtml: `<p>${sectionId}</p>`, localResources: [], sourceRevision: 'r' })
    };
    const { controller, messages } = await setup(vi.fn(async () => customHandle));
    await controller.openBook('a');
    await controller.requestSection('one');
    await controller.requestPreviousSection('one');
    await controller.requestNextSection('one');
    await controller.requestNextSection('two');
    expect((messages as any[]).map(message => message.type)).toContain('bookStart');
    expect((messages as any[]).map(message => message.type)).toContain('bookEnd');
    expect((messages as any[]).filter(message => message.type === 'sectionReady').map(message => message.sectionId)).toEqual(['one', 'two']);
  });
});
