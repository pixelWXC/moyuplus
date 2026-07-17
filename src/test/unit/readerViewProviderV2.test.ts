import { describe, expect, it, vi } from 'vitest';
import { Uri, createWebviewView, window } from '../shims/vscode';
import { ReaderViewProvider, type ReaderViewController } from '../../reader/ReaderViewProvider';
import { READER_PROTOCOL_VERSION } from '../../reader/readerMessages';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function controller(): ReaderViewController {
  return {
    openBook: vi.fn(), requestSection: vi.fn(), requestNextSection: vi.fn(), requestPreviousSection: vi.fn(),
    openImage: vi.fn(), reportLayout: vi.fn(), flush: vi.fn(), dispose: vi.fn()
  };
}

describe('ReaderViewProvider v3', () => {
  it('routes Reader and Git Log settings requests to the unified panel bridge', async () => {
    const openSettings = vi.fn();
    const provider = new ReaderViewProvider(Uri.file('/extension'), controller(), {
      snapshot: vi.fn().mockResolvedValue({ books: [], availability: {}, progress: {} }),
      openSettings
    });
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({ type: 'openUnifiedSettings', section: 'reader' });
    await view.webview.receiveMessage({ type: 'openUnifiedSettings', section: 'gitLog' });
    await view.webview.receiveMessage({ type: 'openUnifiedSettings', section: 'unknown' });
    expect(openSettings.mock.calls).toEqual([['reader'], ['gitLog']]);
  });

  it('answers the Webview libraryReady handshake so the shelf leaves loading state', async () => {
    const library = {
      snapshot: vi.fn().mockResolvedValue({
        books: [{ id: 'book-1', title: 'One' }],
        availability: { 'book-1': true },
        progress: { 'book-1': 0.4 },
        preferences: { fontSize: 18 }
      }),
      importBook: vi.fn(), removeBook: vi.fn(), relocateBook: vi.fn(), startTypingPractice: vi.fn(), savePreferences: vi.fn()
    };
    const provider = new ReaderViewProvider(Uri.file('/extension'), controller(), library as never);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);

    await view.webview.receiveMessage({ type: 'libraryReady' });

    expect(library.snapshot).toHaveBeenCalledOnce();
    expect(view.webview.postedMessages).toContainEqual(expect.objectContaining({
      type: 'libraryState', books: [expect.objectContaining({ id: 'book-1' })]
    }));
  });

  it('proactively sends the library snapshot even when the startup handshake is missed', async () => {
    const library = {
      snapshot: vi.fn().mockResolvedValue({ books: [], availability: {}, progress: {} })
    };
    const provider = new ReaderViewProvider(Uri.file('/extension'), controller(), library);
    const view = createWebviewView();

    provider.resolveWebviewView(view as never);
    await vi.waitFor(() => expect(view.webview.postedMessages).toContainEqual(expect.objectContaining({
      type: 'libraryState', books: [], availability: {}, progress: {}
    })));

    expect(library.snapshot).toHaveBeenCalledOnce();
  });

  it('accepts only guarded v3 messages and routes them to the controller', async () => {
    const target = controller();
    const provider = new ReaderViewProvider(Uri.file('/extension'), target);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);

    expect(view.webview.options.enableScripts).toBe(true);
    expect(view.webview.options.localResourceRoots?.map(uri => uri.toString())).toEqual([
      Uri.file('/extension/media').toString()
    ]);

    await view.webview.receiveMessage({ version: READER_PROTOCOL_VERSION, type: 'openBook', requestId: 'r1', bookId: 'book-1' });
    await view.webview.receiveMessage({ version: 1, type: 'openBook', requestId: 'bad', bookId: 'book-2' });
    await view.webview.receiveMessage({
      version: READER_PROTOCOL_VERSION, type: 'layoutStable', requestId: 'r1', bookId: 'book-1', sectionId: 's1',
      locator: { kind: 'txt', sectionId: 's1', progression: 0.5, offset: 12 }, bookProgression: 0.4
    });

    expect(target.openBook).toHaveBeenCalledOnce();
    expect(target.openBook).toHaveBeenCalledWith('book-1', 'r1');
    expect(target.reportLayout).toHaveBeenCalledWith(
      { kind: 'txt', sectionId: 's1', progression: 0.5, offset: 12 }, 0.4
    );
  });

  it('starts immersive reading from the guarded shelf action and resumes after Webview blur', async () => {
    const target = {
      ...controller(),
      presentationMode: 'immersive' as const,
      openImmersiveBook: vi.fn().mockResolvedValue(true),
      suspendImmersive: vi.fn(),
      resumeImmersive: vi.fn()
    };
    const library = { snapshot: vi.fn().mockResolvedValue({ books: [], availability: {}, progress: {} }) };
    const provider = new ReaderViewProvider(Uri.file('/extension'), target, library);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);

    await view.webview.receiveMessage({
      version: READER_PROTOCOL_VERSION, type: 'startImmersive', requestId: 'immersive-1', bookId: 'book-1'
    });
    expect(target.openImmersiveBook).toHaveBeenCalledWith('book-1');
    expect(view.webview.postedMessages).not.toContainEqual(expect.objectContaining({ type: 'immersiveState' }));

    await view.webview.receiveMessage({ type: 'readerWebviewBlurred' });
    expect(target.resumeImmersive).toHaveBeenCalledOnce();
  });

  it('flushes when hidden and disposes the controller with the view', async () => {
    const target = controller();
    const provider = new ReaderViewProvider(Uri.file('/extension'), target);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);

    await view.setVisible(false);
    await view.dispose();

    expect(target.flush).toHaveBeenCalledOnce();
    expect(target.dispose).toHaveBeenCalledOnce();
  });

  it('persists the final locator atomically when returning to the library', async () => {
    const target = controller();
    const provider = new ReaderViewProvider(Uri.file('/extension'), target);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);

    await view.webview.receiveMessage({
      version: READER_PROTOCOL_VERSION, type: 'closeBook', requestId: 'r1', bookId: 'book-1', sectionId: 's1',
      locator: { kind: 'txt', sectionId: 's1', progression: 0.75, offset: 75 }, bookProgression: 0.75
    });

    expect(target.reportLayout).toHaveBeenCalledWith(
      { kind: 'txt', sectionId: 's1', progression: 0.75, offset: 75 }, 0.75
    );
    expect(target.flush).toHaveBeenCalledOnce();
  });

  it('routes external reader commands and refuses Enter-style next-page at the book end', async () => {
    const target = controller();
    const provider = new ReaderViewProvider(Uri.file('/extension'), target);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);

    await expect(provider.requestPreviousPage()).resolves.toBe(false);
    await expect(provider.requestUndoLocation()).resolves.toBe(false);
    await view.webview.receiveMessage({ version: READER_PROTOCOL_VERSION, type: 'openBook', requestId: 'r1', bookId: 'book-1' });
    await view.webview.receiveMessage({
      version: READER_PROTOCOL_VERSION, type: 'navigationState', requestId: 'r1', bookId: 'book-1',
      sectionId: 's1', sectionGeneration: 1,
      canPreviousPage: false, canNextPage: false, canUndoLocation: false
    });
    await expect(provider.requestNextPage()).resolves.toBe(false);
    expect(view.webview.postedMessages).toEqual([]);

    await view.webview.receiveMessage({
      version: READER_PROTOCOL_VERSION, type: 'navigationState', requestId: 'r1', bookId: 'book-1',
      sectionId: 's1', sectionGeneration: 1,
      canPreviousPage: true, canNextPage: true, canUndoLocation: true
    });
    await expect(provider.requestNextPage()).resolves.toBe(true);
    await expect(provider.requestPreviousPage()).resolves.toBe(true);
    await expect(provider.requestUndoLocation()).resolves.toBe(true);
    await provider.requestReaderCommand('nextChapter');

    expect(view.webview.postedMessages).toEqual([
      { type: 'command', command: 'nextPage' },
      { type: 'command', command: 'previousPage' },
      { type: 'command', command: 'undoLocation' },
      { type: 'command', command: 'nextChapter' }
    ]);
  });

  it('routes an opaque image request to the controller without exposing a path', async () => {
    const target = controller();
    const provider = new ReaderViewProvider(Uri.file('/extension'), target);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await view.webview.receiveMessage({ version: READER_PROTOCOL_VERSION, type: 'openBook', requestId: 'r1', bookId: 'book-1' });

    await view.webview.receiveMessage({
      version: READER_PROTOCOL_VERSION, type: 'openImage', requestId: 'r1', bookId: 'book-1',
      sectionId: 's1', sectionGeneration: 4, resourceId: 'image-opaque-id'
    });

    expect(target.openImage).toHaveBeenCalledWith({
      requestId: 'r1', bookId: 'book-1', sectionId: 's1', sectionGeneration: 4, resourceId: 'image-opaque-id'
    });
    expect(JSON.stringify((target.openImage as any).mock.calls)).not.toMatch(/path|\.\.|OPS\//);
  });

  it('stops only the authoritative shelf book and refreshes its persisted progress', async () => {
    let session: { bookId: string; mode: 'immersive'; state: 'active' } | undefined = {
      bookId: 'book-1', mode: 'immersive', state: 'active'
    };
    let persistedProgress = 0.25;
    const stopImmersive = vi.fn(async () => {
      persistedProgress = 0.75;
      session = undefined;
      return { stopped: true, progressPersisted: true };
    });
    const target = { ...controller(), snapshot: () => session, stopImmersive };
    const library = { snapshot: vi.fn(async () => ({
      books: [{ id: 'book-1', title: 'One' }], availability: { 'book-1': true },
      progress: { 'book-1': persistedProgress }
    })) };
    const provider = new ReaderViewProvider(Uri.file('/extension'), target, library as never);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await vi.waitFor(() => expect(view.webview.postedMessages).toContainEqual(expect.objectContaining({
      type: 'libraryState', immersiveBookId: 'book-1', progress: { 'book-1': 0.25 }
    })));

    await view.webview.receiveMessage({
      version: READER_PROTOCOL_VERSION, type: 'stopImmersive', requestId: 'stop-1', bookId: 'stale-book'
    });
    expect(stopImmersive).not.toHaveBeenCalled();

    await view.webview.receiveMessage({
      version: READER_PROTOCOL_VERSION, type: 'stopImmersive', requestId: 'stop-2', bookId: 'book-1'
    });
    expect(stopImmersive).toHaveBeenCalledOnce();
    expect(view.webview.postedMessages).toContainEqual(expect.objectContaining({
      type: 'libraryState', immersiveBookId: undefined, progress: { 'book-1': 0.75 }
    }));
  });

  it('coalesces concurrent stops and defers the single final shelf refresh while hidden', async () => {
    let session: { bookId: string; mode: 'immersive'; state: 'active' } | undefined = {
      bookId: 'book-1', mode: 'immersive', state: 'active'
    };
    const stopping = deferred<{ stopped: boolean; progressPersisted: boolean }>();
    const stopImmersive = vi.fn(() => stopping.promise.then(result => { session = undefined; return result; }));
    const target = { ...controller(), snapshot: () => session, stopImmersive };
    const library = { snapshot: vi.fn().mockResolvedValue({ books: [], availability: {}, progress: {} }) };
    const provider = new ReaderViewProvider(Uri.file('/extension'), target, library);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await vi.waitFor(() => expect(library.snapshot).toHaveBeenCalledOnce());
    await view.setVisible(false);

    const first = provider.stopImmersive();
    const second = provider.stopImmersive();
    stopping.resolve({ stopped: true, progressPersisted: true });
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(stopImmersive).toHaveBeenCalledOnce();
    expect(library.snapshot).toHaveBeenCalledOnce();

    await view.setVisible(true);
    await vi.waitFor(() => expect(library.snapshot).toHaveBeenCalledTimes(2));
  });

  it('reuses the in-flight stop while its final visible shelf refresh is still pending', async () => {
    let session: { bookId: string; mode: 'immersive'; state: 'active' } | undefined = {
      bookId: 'book-1', mode: 'immersive', state: 'active'
    };
    const finalSnapshot = deferred<{ books: never[]; availability: {}; progress: {} }>();
    const stopImmersive = vi.fn(async () => {
      session = undefined;
      return { stopped: true, progressPersisted: true };
    });
    const target = { ...controller(), snapshot: () => session, stopImmersive };
    const library = { snapshot: vi.fn()
      .mockResolvedValueOnce({ books: [], availability: {}, progress: {} })
      .mockReturnValueOnce(finalSnapshot.promise) };
    const provider = new ReaderViewProvider(Uri.file('/extension'), target, library);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await vi.waitFor(() => expect(library.snapshot).toHaveBeenCalledOnce());

    const first = provider.stopImmersive('book-1');
    await vi.waitFor(() => expect(library.snapshot).toHaveBeenCalledTimes(2));
    const second = provider.stopImmersive('book-1');
    finalSnapshot.resolve({ books: [], availability: {}, progress: {} });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(stopImmersive).toHaveBeenCalledOnce();
  });

  it('drops a stale shelf build when a newer refresh is requested', async () => {
    const first = deferred<{ books: Array<{ id: string }>; availability: Record<string, boolean>; progress: Record<string, number> }>();
    const library = { snapshot: vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ books: [{ id: 'new' }], availability: { new: true }, progress: {} }) };
    const provider = new ReaderViewProvider(Uri.file('/extension'), controller(), library as never);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);
    await vi.waitFor(() => expect(library.snapshot).toHaveBeenCalledOnce());

    const ready = view.webview.receiveMessage({ type: 'importBook' });
    first.resolve({ books: [{ id: 'old' }], availability: { old: true }, progress: {} });
    await ready;
    await vi.waitFor(() => expect(library.snapshot).toHaveBeenCalledTimes(2));

    const shelfMessages = view.webview.postedMessages.filter(message => (message as { type?: string }).type === 'libraryState');
    expect(shelfMessages).toEqual([expect.objectContaining({
      books: [{ id: 'new' }], libraryRevision: 1
    })]);
  });

  it('never delivers an in-flight shelf build to a disposed Webview instance', async () => {
    const first = deferred<{ books: Array<{ id: string }>; availability: Record<string, boolean>; progress: Record<string, number> }>();
    const library = { snapshot: vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ books: [{ id: 'current' }], availability: { current: true }, progress: {} }) };
    const provider = new ReaderViewProvider(Uri.file('/extension'), controller(), library as never);
    const oldView = createWebviewView();
    provider.resolveWebviewView(oldView as never);
    await vi.waitFor(() => expect(library.snapshot).toHaveBeenCalledOnce());
    await oldView.dispose();

    const currentView = createWebviewView();
    provider.resolveWebviewView(currentView as never);
    first.resolve({ books: [{ id: 'stale' }], availability: { stale: true }, progress: {} });
    await vi.waitFor(() => expect(library.snapshot).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(currentView.webview.postedMessages).toContainEqual(expect.objectContaining({
      type: 'libraryState', books: [{ id: 'current' }]
    })));

    expect(oldView.webview.postedMessages).not.toContainEqual(expect.objectContaining({ type: 'libraryState' }));
  });

  it('reports a failed final save and refreshes only the last persisted percentage', async () => {
    let session: { bookId: string; mode: 'immersive'; state: 'active' } | undefined = {
      bookId: 'book-1', mode: 'immersive', state: 'active'
    };
    const stopImmersive = vi.fn(async () => {
      session = undefined;
      return { stopped: true, progressPersisted: false };
    });
    const target = { ...controller(), snapshot: () => session, stopImmersive };
    const library = { snapshot: vi.fn().mockResolvedValue({
      books: [{ id: 'book-1' }], availability: { 'book-1': true }, progress: { 'book-1': 0.3 }
    }) };
    const provider = new ReaderViewProvider(Uri.file('/extension'), target, library as never);
    const view = createWebviewView();
    const previousErrors = window.errorMessages.length;
    provider.resolveWebviewView(view as never);
    await vi.waitFor(() => expect(library.snapshot).toHaveBeenCalledOnce());

    await expect(provider.stopImmersive('book-1')).resolves.toBe(true);

    expect(window.errorMessages.slice(previousErrors)).toEqual([
      '阅读进度保存失败，已停止沉浸阅读。书架将显示上一次成功保存的位置。'
    ]);
    expect(view.webview.postedMessages).toContainEqual(expect.objectContaining({
      type: 'libraryState', immersiveBookId: undefined, progress: { 'book-1': 0.3 }
    }));
  });
});
