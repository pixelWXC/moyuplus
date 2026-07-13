import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOGGLE_GIT_LOG_COMMAND_ID } from '../../git/gitLogModeCoordinator';
import { GitLogModeStore } from '../../storage/gitLogModeStore';
import { GitLogPreferencesStore } from '../../storage/gitLogPreferencesStore';
import { registerReaderView, type ReaderViewController } from '../../reader/ReaderViewProvider';
import { commands, createWebviewView, resetVSCodeShim, Uri, type Disposable, window } from '../shims/vscode';

class MemoryMemento {
  readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  async update(key: string, value: unknown): Promise<void> { this.values.set(key, value); }
}

function controller(): ReaderViewController {
  return {
    openBook: vi.fn(), requestSection: vi.fn(), requestNextSection: vi.fn(), requestPreviousSection: vi.fn(),
    reportLayout: vi.fn(), capturePosition: vi.fn(), flush: vi.fn(), dispose: vi.fn()
  };
}

beforeEach(() => resetVSCodeShim());

describe('Git Log Reader View integration', () => {
  it('bootstraps a persisted active mode directly into loading and a fresh current-branch query', async () => {
    const workspaceState = new MemoryMemento();
    const globalState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const library = { snapshot: vi.fn().mockResolvedValue({ books: [], availability: {}, progress: {} }) };
    const service = { load: vi.fn().mockResolvedValue({
      repositoryRoot: 'D:/repo', repositoryName: 'repo', branchName: 'main', detached: false,
      commits: [{ hash: 'abc', subject: 'Ship', author: 'Purvar', authoredAt: 50 }]
    }) };
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    registerReaderView(context as never, controller(), library, {
      modeStore,
      preferencesStore: new GitLogPreferencesStore(globalState),
      service: service as never,
      readerPreferences: () => ({ fontSize: 18 }),
      workspaceRoots: () => ['D:/repo'],
      activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(view);

    await vi.waitFor(() => expect(view.webview.postedMessages).toContainEqual(expect.objectContaining({ type: 'modeGitLog', sessionId: expect.any(String) })));
    await vi.waitFor(() => expect(view.webview.postedMessages).toContainEqual(expect.objectContaining({ type: 'gitLogReady', branchName: 'main' })));
    await view.webview.receiveMessage({ type: 'appReady' });
    expect(library.snapshot).not.toHaveBeenCalled();
    expect(service.load).toHaveBeenCalledOnce();
  });

  it('keeps Close Reader unchanged and uses the new toggle to exit to the library', async () => {
    const workspaceState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const library = { snapshot: vi.fn().mockResolvedValue({ books: [], availability: {}, progress: {} }) };
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    registerReaderView(context as never, controller(), library, {
      modeStore,
      preferencesStore: new GitLogPreferencesStore(new MemoryMemento()),
      service: { load: vi.fn().mockResolvedValue({ repositoryRoot: 'D:/repo', repositoryName: 'repo', branchName: 'main', detached: false, commits: [] }) } as never,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => ['D:/repo'], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(view);

    await commands.executeRegisteredCommand('moyuplus.reader.close');
    expect(commands.executedBuiltinCommands()).toContainEqual({ commandId: 'workbench.action.closeSidebar', args: [] });
    expect(modeStore.get().active).toBe(true);

    await commands.executeRegisteredCommand(TOGGLE_GIT_LOG_COMMAND_ID);
    expect(modeStore.get()).toEqual({ active: false });
    expect(view.webview.postedMessages).toContainEqual(expect.objectContaining({ type: 'modeLibrary' }));
  });

  it('retains the workspace lock across view disposal and starts a fresh session when recreated', async () => {
    const workspaceState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const service = { load: vi.fn().mockResolvedValue({
      repositoryRoot: 'D:/repo', repositoryName: 'repo', branchName: 'main', detached: false, commits: []
    }) };
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    const options = {
      modeStore, preferencesStore: new GitLogPreferencesStore(new MemoryMemento()), service: service as never,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => ['D:/repo'], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    };
    registerReaderView(context as never, controller(), { snapshot: vi.fn() }, options);
    const first = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(first);
    await vi.waitFor(() => expect(service.load).toHaveBeenCalledTimes(1));
    await first.dispose();

    const second = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(second);
    await vi.waitFor(() => expect(service.load).toHaveBeenCalledTimes(2));
    expect(modeStore.get().active).toBe(true);
    expect(second.webview.postedMessages).toContainEqual(expect.objectContaining({ type: 'modeGitLog' }));
  });
});
