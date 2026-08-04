import { describe, expect, it, vi } from 'vitest';
import type { BookAdapter, BookHandle, SafeSectionDocument } from '../../adapters/bookAdapter';
import type { BookRecord } from '../../domain/books';
import type { ReadingPosition } from '../../domain/locators';
import type { ImmersiveReaderPresenter } from '../../reader/readerPresenter';
import { ReaderSessionCoordinator, type ReaderSessionCoordinatorOptions } from '../../reader/ReaderSessionCoordinator';

const books: BookRecord[] = ['a', 'b'].map((id, index) => ({
  schemaVersion: 2, id, uri: `file:///${id}.txt`, source: 'external', title: id, authors: [],
  capabilities: { readable: true, typing: true, toc: true }, format: 'txt',
  formatData: { encoding: 'utf8' }, createdAt: index + 1, updatedAt: index + 1
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function section(id: string, start = 0, text = 'abcdefgh'): SafeSectionDocument {
  return {
    sectionId: id,
    sanitizedHtml: `<pre>${text}</pre>`,
    localResources: [],
    sourceRevision: 'txt-revision',
    immersiveProjection: {
      text, projectionRevision: 'txt-identity-v1', resourceAnchors: [],
      segments: [{ kind: 'identity', sourceStart: 0, sourceEnd: text.length, immersiveStart: 0, immersiveEnd: text.length, safeSourceFloor: 0, safeImmersiveFloor: 0 }]
    },
    locatorSpace: { kind: 'txt', sectionStart: start, sectionEnd: start + text.length }
  };
}

function handle(id: string, onDispose?: () => void): BookHandle {
  const value = section(`${id}-section`);
  return {
    getToc: async () => [{ title: id, sectionId: value.sectionId }],
    getSections: async () => [{ id: value.sectionId, order: 0, progressionWeight: value.immersiveProjection.text.length }],
    getSection: async () => value,
    readResource: async () => { throw new Error('none'); },
    normalizeLocator: async locator => locator.kind === 'txt'
      ? { ...locator, sectionId: value.sectionId, offset: 0, offsetSpace: 'book' }
      : { kind: 'txt', sectionId: value.sectionId, progression: 0, offset: 0, offsetSpace: 'book' },
    dispose: vi.fn(onDispose)
  };
}

function presenter(): ImmersiveReaderPresenter {
  let position: { sectionId: string; localOffset: number } | undefined;
  return {
    mode: 'immersive',
    activate: vi.fn(async snapshot => { position = { sectionId: snapshot.section.sectionId, localOffset: snapshot.localOffset }; }),
    showSection: vi.fn(async (value, localOffset) => { position = { sectionId: value.sectionId, localOffset }; }),
    nextPage: vi.fn(async () => 'unavailable'),
    previousPage: vi.fn(async () => 'unavailable'),
    capturePosition: vi.fn(() => position),
    suspend: vi.fn(),
    resume: vi.fn(),
    applyPreferences: vi.fn(),
    dispose: vi.fn(async () => { position = undefined; })
  };
}

describe('ReaderSessionCoordinator', () => {
  it('serializes delayed opens so local and attached handles never overlap', async () => {
    const first = deferred<BookHandle>();
    let liveHandles = 0;
    let maxLiveHandles = 0;
    const open = vi.fn(async (book: BookRecord) => {
      if (book.id === 'a') return first.promise;
      liveHandles += 1;
      maxLiveHandles = Math.max(maxLiveHandles, liveHandles);
      return handle(book.id, () => { liveHandles -= 1; });
    });
    const coordinator = createCoordinator(open);

    const openingA = coordinator.openBook('a', 'a-request');
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const openingB = coordinator.openImmersiveBook('b');
    expect(open).toHaveBeenCalledTimes(1);
    liveHandles += 1;
    maxLiveHandles = Math.max(maxLiveHandles, liveHandles);
    first.resolve(handle('a', () => { liveHandles -= 1; }));

    await Promise.all([openingA, openingB]);
    expect(open).toHaveBeenCalledTimes(2);
    expect(maxLiveHandles).toBe(1);
    expect(coordinator.snapshot()?.bookId).toBe('b');
    expect(coordinator.snapshot()?.mode).toBe('immersive');
    await coordinator.dispose();
    expect(liveHandles).toBe(0);
  });

  it('converts webview section-local TXT offsets to tagged book offsets', async () => {
    const saved: ReadingPosition[] = [];
    const second = section('second', 10, '0123456789');
    const customHandle: BookHandle = {
      ...handle('a'),
      getToc: async () => [{ title: 'second', sectionId: 'second' }],
      getSections: async () => [{ id: 'second', order: 0, progressionWeight: 10 }],
      getSection: async () => second,
      normalizeLocator: async () => ({ kind: 'txt', sectionId: 'second', progression: 0, offset: 10, offsetSpace: 'book' })
    };
    const coordinator = createCoordinator(async () => customHandle, saved);
    await coordinator.openBook('a', 'request');
    await coordinator.requestSection('second');
    coordinator.reportLayout({ kind: 'txt', sectionId: 'second', progression: 0.2, offset: 2 }, 0.2);
    await coordinator.flush();
    expect(saved.at(-1)?.locator).toEqual({
      kind: 'txt', sectionId: 'second', progression: 0.2, offset: 12, offsetSpace: 'book'
    });
  });

  it('opens only a current immersive image through the existing preview service', async () => {
    const value = section('a-section', 0, '查看图片：Cover');
    value.localResources = [{ id: 'image-opaque-id', mimeType: 'image/png', label: 'Cover' }];
    const readResource = vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png', label: 'Cover'
    }));
    const customHandle: BookHandle = { ...handle('a'), getSection: async () => value, readResource };
    const openImagePreview = vi.fn(async () => true);
    const coordinator = createCoordinator(async () => customHandle, [], presenter(), { openImagePreview });
    await coordinator.openImmersiveBook('a');

    await expect(coordinator.openImmersiveImage({
      bookId: 'a', sectionId: 'a-section', resourceId: 'image-opaque-id'
    })).resolves.toBe(true);
    await expect(coordinator.openImmersiveImage({
      bookId: 'a', sectionId: 'a-section', resourceId: 'unknown-image'
    })).resolves.toBe(false);

    expect(readResource).toHaveBeenCalledOnce();
    expect(openImagePreview).toHaveBeenCalledOnce();
    await coordinator.dispose();
  });

  it('drops an immersive image response after the session has stopped', async () => {
    const pending = deferred<{ bytes: Uint8Array; mimeType: string; label: string }>();
    const value = section('a-section', 0, '查看图片：Cover');
    value.localResources = [{ id: 'image-opaque-id', mimeType: 'image/png', label: 'Cover' }];
    const readResource = vi.fn(() => pending.promise);
    const customHandle: BookHandle = { ...handle('a'), getSection: async () => value, readResource };
    const openImagePreview = vi.fn(async () => true);
    const coordinator = createCoordinator(async () => customHandle, [], presenter(), { openImagePreview });
    await coordinator.openImmersiveBook('a');

    const opening = coordinator.openImmersiveImage({
      bookId: 'a', sectionId: 'a-section', resourceId: 'image-opaque-id'
    });
    await vi.waitFor(() => expect(readResource).toHaveBeenCalledOnce());
    await coordinator.stopImmersive();
    pending.resolve({ bytes: new Uint8Array([1]), mimeType: 'image/png', label: 'Cover' });

    await expect(opening).resolves.toBe(false);
    expect(openImagePreview).not.toHaveBeenCalled();
    await coordinator.dispose();
  });

  it('stops immersive reading without waiting for a startup notification', async () => {
    const notification = deferred<void>();
    const showInformation = vi.fn(() => notification.promise);
    const setImmersiveContext = vi.fn(async (_active: boolean) => undefined);
    const activePresenter = presenter();
    const disposeHandle = vi.fn();
    const coordinator = createCoordinator(
      async () => handle('a', disposeHandle),
      [],
      activePresenter,
      { showInformation, setImmersiveContext }
    );
    const opening = coordinator.openImmersiveBook('a');
    await vi.waitFor(() => expect(coordinator.snapshot()?.mode).toBe('immersive'));
    const stopping = coordinator.stopImmersive();

    try {
      await expect(settlesPromptly(stopping)).resolves.toEqual({ stopped: true, progressPersisted: true });
      expect(showInformation).not.toHaveBeenCalled();
      expect(activePresenter.dispose).toHaveBeenCalledTimes(1);
      expect(disposeHandle).toHaveBeenCalledTimes(1);
      expect(setImmersiveContext).toHaveBeenLastCalledWith(false);
      expect(coordinator.snapshot()).toBeUndefined();
    } finally {
      notification.resolve();
      await opening;
      await stopping;
      await coordinator.dispose();
    }
  });

  it('reports a failed final save while still releasing every immersive resource', async () => {
    const activePresenter = presenter();
    const disposeHandle = vi.fn();
    const setImmersiveContext = vi.fn(async (_active: boolean) => undefined);
    const adapter: BookAdapter = {
      format: 'txt', inspect: async () => ({ title: 'x', authors: [] }),
      open: async () => handle('a', disposeHandle)
    };
    const coordinator = new ReaderSessionCoordinator(
      { get: (id: string) => books.find(book => book.id === id) } as never,
      {
        get: () => undefined,
        save: vi.fn(async () => { throw new Error('disk full'); })
      } as never,
      { get: () => adapter } as never,
      vi.fn(),
      activePresenter,
      { debounceMs: 0, now: () => 100, setImmersiveContext }
    );
    await coordinator.openImmersiveBook('a');

    await expect(coordinator.stopImmersive()).resolves.toEqual({
      stopped: true,
      progressPersisted: false
    });

    expect(activePresenter.dispose).toHaveBeenCalledTimes(1);
    expect(disposeHandle).toHaveBeenCalledTimes(1);
    expect(setImmersiveContext).toHaveBeenLastCalledWith(false);
    expect(coordinator.snapshot()).toBeUndefined();
  });

  it('switches from immersive reading to a webview book without waiting for a startup notification', async () => {
    const notification = deferred<void>();
    const showInformation = vi.fn(() => notification.promise);
    let liveHandles = 0;
    let maxLiveHandles = 0;
    const coordinator = createCoordinator(async (book) => {
      liveHandles += 1;
      maxLiveHandles = Math.max(maxLiveHandles, liveHandles);
      return handle(book.id, () => { liveHandles -= 1; });
    }, [], presenter(), { showInformation });
    const openingImmersive = coordinator.openImmersiveBook('a');
    await vi.waitFor(() => expect(coordinator.snapshot()?.mode).toBe('immersive'));
    const openingWebview = coordinator.openBook('b', 'webview-b');

    try {
      await expect(settlesPromptly(openingWebview)).resolves.toBe(true);
      expect(showInformation).not.toHaveBeenCalled();
      expect(coordinator.snapshot()).toMatchObject({ bookId: 'b', mode: 'webview' });
      expect(maxLiveHandles).toBe(1);
    } finally {
      notification.resolve();
      await openingImmersive;
      await openingWebview;
      await coordinator.dispose();
    }
  });
});

async function settlesPromptly<T>(promise: Promise<T>): Promise<T | 'blocked'> {
  return Promise.race([
    promise,
    new Promise<'blocked'>(resolve => setTimeout(() => resolve('blocked'), 25))
  ]);
}

function createCoordinator(
  open: BookAdapter['open'],
  saved: ReadingPosition[] = [],
  immersivePresenter: ImmersiveReaderPresenter = presenter(),
  options: ReaderSessionCoordinatorOptions = {}
) {
  const adapter: BookAdapter = { format: 'txt', inspect: async () => ({ title: 'x', authors: [] }), open };
  return new ReaderSessionCoordinator(
    { get: (id: string) => books.find(book => book.id === id) } as never,
    {
      get: () => undefined,
      save: async (value: ReadingPosition) => { saved.push(value); return value; }
    } as never,
    { get: () => adapter } as never,
    vi.fn(),
    immersivePresenter,
    { debounceMs: 0, now: () => 100, ...options }
  );
}
