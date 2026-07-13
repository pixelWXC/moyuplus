import { describe, expect, it, vi } from 'vitest';
import { Uri, createWebviewView } from '../shims/vscode';
import { ReaderViewProvider, type ReaderViewController } from '../../reader/ReaderViewProvider';

function controller(): ReaderViewController {
  return {
    openBook: vi.fn(), requestSection: vi.fn(), requestNextSection: vi.fn(), requestPreviousSection: vi.fn(),
    reportLayout: vi.fn(), flush: vi.fn(), dispose: vi.fn()
  };
}

describe('ReaderViewProvider v2', () => {
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

    expect(library.snapshot).toHaveBeenCalledTimes(2);
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
    await vi.waitFor(() => expect(view.webview.postedMessages).toContainEqual({
      type: 'libraryState', books: [], availability: {}, progress: {}
    }));

    expect(library.snapshot).toHaveBeenCalledOnce();
  });

  it('accepts only guarded v2 messages and routes them to the controller', async () => {
    const target = controller();
    const provider = new ReaderViewProvider(Uri.file('/extension'), target);
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);

    expect(view.webview.options.enableScripts).toBe(true);
    expect(view.webview.options.localResourceRoots?.map(uri => uri.toString())).toEqual([
      Uri.file('/extension/media').toString()
    ]);

    await view.webview.receiveMessage({ version: 2, type: 'openBook', requestId: 'r1', bookId: 'book-1' });
    await view.webview.receiveMessage({ version: 1, type: 'openBook', requestId: 'bad', bookId: 'book-2' });
    await view.webview.receiveMessage({
      version: 2, type: 'layoutStable', requestId: 'r1', bookId: 'book-1', sectionId: 's1',
      locator: { kind: 'txt', sectionId: 's1', progression: 0.5, offset: 12 }, bookProgression: 0.4
    });

    expect(target.openBook).toHaveBeenCalledOnce();
    expect(target.openBook).toHaveBeenCalledWith('book-1', 'r1');
    expect(target.reportLayout).toHaveBeenCalledWith(
      { kind: 'txt', sectionId: 's1', progression: 0.5, offset: 12 }, 0.4
    );
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
      version: 2, type: 'closeBook', requestId: 'r1', bookId: 'book-1', sectionId: 's1',
      locator: { kind: 'txt', sectionId: 's1', progression: 0.75, offset: 75 }, bookProgression: 0.75
    });

    expect(target.reportLayout).toHaveBeenCalledWith(
      { kind: 'txt', sectionId: 's1', progression: 0.75, offset: 75 }, 0.75
    );
    expect(target.flush).toHaveBeenCalledOnce();
  });

  it('routes external reader commands and refuses Enter-style next-page at the book end', async () => {
    const provider = new ReaderViewProvider(Uri.file('/extension'), controller());
    const view = createWebviewView();
    provider.resolveWebviewView(view as never);

    await view.webview.receiveMessage({ type: 'navigationState', canNextPage: false });
    await expect(provider.requestNextPage()).resolves.toBe(false);
    expect(view.webview.postedMessages).toEqual([]);

    await view.webview.receiveMessage({ type: 'navigationState', canNextPage: true });
    await expect(provider.requestNextPage()).resolves.toBe(true);
    await provider.requestPreviousPage();
    await provider.requestReaderCommand('nextChapter');

    expect(view.webview.postedMessages).toEqual([
      { type: 'command', command: 'nextPage' },
      { type: 'command', command: 'previousPage' },
      { type: 'command', command: 'nextChapter' }
    ]);
  });
});
