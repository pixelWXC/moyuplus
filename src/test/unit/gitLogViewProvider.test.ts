import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOGGLE_GIT_LOG_COMMAND_ID } from '../../git/gitLogModeCoordinator';
import { GitLogModeStore } from '../../storage/gitLogModeStore';
import { GitLogPreferencesStore } from '../../storage/gitLogPreferencesStore';
import { registerReaderView, type ReaderViewController } from '../../reader/ReaderViewProvider';
import { READER_PROTOCOL_VERSION } from '../../reader/readerMessages';
import { commands, createWebviewView, resetVSCodeShim, Uri, type Disposable, window } from '../shims/vscode';
import type { GitLogLoadRequest, GitLogResult } from '../../git/gitLogService';
import { GitLogError } from '../../git/gitLogService';

class MemoryMemento {
  readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  async update(key: string, value: unknown): Promise<void> { this.values.set(key, value); }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function gitResult(fingerprint = 'fp-1', branchName = 'main'): GitLogResult {
  return {
    repositoryRoot: 'D:/private/repo', repositoryName: 'repo', branchName, detached: false,
    commits: [{ hash: 'abc', subject: 'Ship', author: 'Purvar', authoredAt: 50 }], fingerprint
  };
}

function controller(): ReaderViewController {
  return {
    openBook: vi.fn(), requestSection: vi.fn(), requestNextSection: vi.fn(), requestPreviousSection: vi.fn(),
    reportLayout: vi.fn(), capturePosition: vi.fn(), flush: vi.fn(), dispose: vi.fn()
  };
}

beforeEach(() => resetVSCodeShim());

describe('Git Log Reader View integration', () => {
  it('can defer individual Webview deliveries without using timers', async () => {
    const view = createWebviewView();
    const deferNext = (view.webview as unknown as {
      deferNextPostMessage?: () => { readonly message: unknown; resolve(result?: boolean): void };
    }).deferNextPostMessage;
    expect(deferNext).toBeTypeOf('function');
    const delivery = deferNext?.();
    let settled = false;
    const posting = view.webview.postMessage({ type: 'delayed' }).then(() => { settled = true; });

    await Promise.resolve();
    expect(delivery?.message).toEqual({ type: 'delayed' });
    expect(view.webview.postedMessages).toEqual([]);
    expect(settled).toBe(false);

    delivery?.resolve();
    await posting;
    expect(view.webview.postedMessages).toEqual([{ type: 'delayed' }]);
  });

  it('bootstraps a persisted active mode directly into loading and a fresh current-branch query', async () => {
    const workspaceState = new MemoryMemento();
    const globalState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const library = { snapshot: vi.fn().mockResolvedValue({ books: [], availability: {}, progress: {} }) };
    const service = { load: vi.fn().mockResolvedValue({
      repositoryRoot: 'D:/repo', repositoryName: 'repo', branchName: 'main', detached: false,
      commits: [{ hash: 'abc', subject: 'Ship', author: 'Purvar', authoredAt: 50 }], fingerprint: 'fp-1'
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
      service: { load: vi.fn().mockResolvedValue({ repositoryRoot: 'D:/repo', repositoryName: 'repo', branchName: 'main', detached: false, commits: [], fingerprint: 'fp-1' }) } as never,
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

  it('returns to the shelf when Git Log is entered from the shelf even if the controller retains a reading position', async () => {
    const workspaceState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    const target = controller();
    target.capturePosition = vi.fn().mockReturnValue({
      bookId: 'book-1',
      locator: { kind: 'txt', sectionId: 'section-1', progression: 0.4, offset: 40 },
      bookProgression: 0.4
    });
    const library = { snapshot: vi.fn().mockResolvedValue({ books: [], availability: {}, progress: {} }) };
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    registerReaderView(context as never, target, library, {
      modeStore,
      preferencesStore: new GitLogPreferencesStore(new MemoryMemento()),
      service: { load: vi.fn().mockResolvedValue(gitResult()) } as never,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => ['D:/repo'], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(view);
    await vi.waitFor(() => expect(view.webview.postedMessages).toContainEqual(expect.objectContaining({ type: 'modeLibrary' })));

    await view.webview.receiveMessage({ version: READER_PROTOCOL_VERSION, type: 'openBook', requestId: 'reader-1', bookId: 'book-1' });
    await view.webview.receiveMessage({
      version: READER_PROTOCOL_VERSION, type: 'closeBook', requestId: 'reader-1', bookId: 'book-1', sectionId: 'section-1',
      locator: { kind: 'txt', sectionId: 'section-1', progression: 0.4, offset: 40 }, bookProgression: 0.4
    });
    await commands.executeRegisteredCommand(TOGGLE_GIT_LOG_COMMAND_ID);

    expect(modeStore.get()).toEqual({ active: true });
    await commands.executeRegisteredCommand(TOGGLE_GIT_LOG_COMMAND_ID);
    expect(modeStore.get()).toEqual({ active: false });
    expect(view.webview.postedMessages).not.toContainEqual(expect.objectContaining({ type: 'modeReaderRestore' }));
    expect(target.openBook).toHaveBeenCalledTimes(1);
    expect(target.openBook).toHaveBeenCalledWith('book-1', 'reader-1');
  });

  it('hydrates the complete shelf when exiting a Git Log session restored at startup', async () => {
    const workspaceState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({
      active: true,
      resumeTarget: {
        bookId: 'book-1',
        locator: { kind: 'txt', sectionId: 'section-1', progression: 0.4, offset: 40 },
        bookProgression: 0.4
      }
    });
    const books = [{ id: 'book-1', title: 'One' }, { id: 'book-2', title: 'Two' }];
    const libraryState = {
      books,
      availability: { 'book-1': true, 'book-2': false },
      progress: { 'book-1': 0.4, 'book-2': 0.2 },
      preferences: { fontSize: 18 }
    };
    const library = { snapshot: vi.fn().mockResolvedValue(libraryState) };
    const target = controller();
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    registerReaderView(context as never, target, library, {
      modeStore,
      preferencesStore: new GitLogPreferencesStore(new MemoryMemento()),
      service: { load: vi.fn().mockResolvedValue(gitResult()) } as never,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => ['D:/repo'], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(view);
    await vi.waitFor(() => expect(view.webview.postedMessages).toContainEqual(expect.objectContaining({ type: 'modeGitLog' })));

    await commands.executeRegisteredCommand(TOGGLE_GIT_LOG_COMMAND_ID);

    expect(view.webview.postedMessages).toContainEqual(expect.objectContaining({
      type: 'modeReaderRestore',
      book: books[0],
      books,
      availability: libraryState.availability,
      progress: libraryState.progress
    }));
    expect(target.openBook).toHaveBeenCalledWith('book-1', expect.stringMatching(/^git-log-restore-/));
  });

  it('retains the workspace lock across view disposal and starts a fresh session when recreated', async () => {
    const workspaceState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const service = { load: vi.fn().mockResolvedValue({
      repositoryRoot: 'D:/repo', repositoryName: 'repo', branchName: 'main', detached: false, commits: [], fingerprint: 'fp-1'
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

  it('shows one cached display result immediately and suppresses an unchanged background refresh', async () => {
    const workspaceState = new MemoryMemento();
    const globalState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const jobs: Array<ReturnType<typeof deferred<GitLogResult>>> = [];
    const service = { load: vi.fn((_request: GitLogLoadRequest) => {
      const job = deferred<GitLogResult>(); jobs.push(job); return job.promise;
    }) };
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    registerReaderView(context as never, controller(), { snapshot: vi.fn() }, {
      modeStore, preferencesStore: new GitLogPreferencesStore(globalState), service,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => ['D:/repo'], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(view);
    await vi.waitFor(() => expect(service.load).toHaveBeenCalledTimes(1));
    const firstMode = view.webview.postedMessages.find(message => (message as { type?: unknown }).type === 'modeGitLog') as Record<string, unknown>;
    expect(firstMode).toMatchObject({ modeGeneration: 1 });
    expect(firstMode).not.toHaveProperty('cached');

    jobs[0].resolve(gitResult());
    await vi.waitFor(() => expect(view.webview.postedMessages.filter(message => (message as { type?: unknown }).type === 'gitLogReady')).toHaveLength(1));
    const ready = view.webview.postedMessages.find(message => (message as { type?: unknown }).type === 'gitLogReady') as Record<string, unknown>;
    expect(ready).toEqual({
      type: 'gitLogReady', sessionId: expect.any(String), repositoryName: 'repo', branchName: 'main', detached: false,
      commits: [{ hash: 'abc', subject: 'Ship', author: 'Purvar', authoredAt: 50 }]
    });

    await commands.executeRegisteredCommand(TOGGLE_GIT_LOG_COMMAND_ID);
    await commands.executeRegisteredCommand(TOGGLE_GIT_LOG_COMMAND_ID);
    await vi.waitFor(() => expect(service.load).toHaveBeenCalledTimes(2));
    const modeMessages = view.webview.postedMessages.filter(message => (message as { type?: unknown }).type === 'modeGitLog') as Record<string, unknown>[];
    expect(modeMessages.at(-1)).toMatchObject({
      modeGeneration: expect.any(Number),
      cached: { repositoryName: 'repo', branchName: 'main', detached: false, commits: expect.any(Array) }
    });
    expect(modeMessages.at(-1)?.cached).not.toHaveProperty('repositoryRoot');
    expect(modeMessages.at(-1)?.cached).not.toHaveProperty('fingerprint');

    jobs[1].resolve(gitResult());
    await Promise.resolve();
    await Promise.resolve();
    expect(view.webview.postedMessages.filter(message => (message as { type?: unknown }).type === 'gitLogReady')).toHaveLength(1);
  });

  it('defers a refresh outcome until the mode frame is delivered and never starts a duplicate load', async () => {
    const workspaceState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const job = deferred<GitLogResult>();
    const service = { load: vi.fn(() => job.promise) };
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    registerReaderView(context as never, controller(), { snapshot: vi.fn() }, {
      modeStore, preferencesStore: new GitLogPreferencesStore(new MemoryMemento()), service,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => ['D:/repo'], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    const view = createWebviewView();
    const delivery = view.webview.deferNextPostMessage();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(view);

    await vi.waitFor(() => expect(service.load).toHaveBeenCalledOnce());
    job.resolve(gitResult());
    await Promise.resolve();
    await Promise.resolve();
    expect(view.webview.postedMessages).toEqual([]);
    expect(delivery.message).toMatchObject({ type: 'modeGitLog', modeGeneration: 1 });

    delivery.resolve();
    await vi.waitFor(() => expect(view.webview.postedMessages.map(message => (message as { type?: unknown }).type)).toEqual([
      'modeGitLog', 'gitLogReady'
    ]));
    expect(service.load).toHaveBeenCalledOnce();
  });

  it('reuses a same-key in-flight refresh across hide and reveal without aborting it', async () => {
    const workspaceState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const job = deferred<GitLogResult>();
    let signal: AbortSignal | undefined;
    const service = { load: vi.fn((request: GitLogLoadRequest) => { signal = request.signal; return job.promise; }) };
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    registerReaderView(context as never, controller(), { snapshot: vi.fn() }, {
      modeStore, preferencesStore: new GitLogPreferencesStore(new MemoryMemento()), service,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => ['D:/repo'], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(view);
    await vi.waitFor(() => expect(service.load).toHaveBeenCalledOnce());

    await view.setVisible(false);
    await view.setVisible(true);
    expect(service.load).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(false);

    job.resolve(gitResult());
    await vi.waitFor(() => expect(view.webview.postedMessages.filter(message => (message as { type?: unknown }).type === 'gitLogReady')).toHaveLength(1));
  });

  it('serializes a changed query behind the aborting job and keeps only the new snapshot', async () => {
    const workspaceState = new MemoryMemento();
    const globalState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const jobs: Array<{ request: GitLogLoadRequest; deferred: ReturnType<typeof deferred<GitLogResult>> }> = [];
    const service = { load: vi.fn((request: GitLogLoadRequest) => {
      const job = deferred<GitLogResult>(); jobs.push({ request, deferred: job }); return job.promise;
    }) };
    const preferencesStore = new GitLogPreferencesStore(globalState);
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    registerReaderView(context as never, controller(), { snapshot: vi.fn() }, {
      modeStore, preferencesStore, service,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => ['D:/repo'], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(view);
    await vi.waitFor(() => expect(service.load).toHaveBeenCalledOnce());

    await view.webview.receiveMessage({
      type: 'saveGitLogPreferences',
      preferences: { ...preferencesStore.get(), maxCommits: 400 }
    });
    expect(jobs[0].request.signal?.aborted).toBe(true);
    expect(service.load).toHaveBeenCalledOnce();

    jobs[0].deferred.resolve(gitResult('obsolete'));
    await vi.waitFor(() => expect(service.load).toHaveBeenCalledTimes(2));
    expect(jobs[1].request.maxCommits).toBe(400);
    jobs[1].deferred.resolve(gitResult('fp-400'));
    await vi.waitFor(() => expect(view.webview.postedMessages.some(message =>
      (message as { type?: unknown }).type === 'gitLogReady')).toBe(true));
  });

  it('keeps cached commits on refresh failure but uses the error page without a cache', async () => {
    const workspaceState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const jobs: Array<ReturnType<typeof deferred<GitLogResult>>> = [];
    const service = { load: vi.fn(() => {
      const job = deferred<GitLogResult>(); jobs.push(job); return job.promise;
    }) };
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    registerReaderView(context as never, controller(), { snapshot: vi.fn() }, {
      modeStore, preferencesStore: new GitLogPreferencesStore(new MemoryMemento()), service,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => ['D:/repo'], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(view);
    await vi.waitFor(() => expect(jobs).toHaveLength(1));

    jobs[0].resolve(gitResult());
    await vi.waitFor(() => expect(view.webview.postedMessages.some(message => (message as { type?: unknown }).type === 'gitLogReady')).toBe(true));
    await commands.executeRegisteredCommand(TOGGLE_GIT_LOG_COMMAND_ID);
    await commands.executeRegisteredCommand(TOGGLE_GIT_LOG_COMMAND_ID);
    await vi.waitFor(() => expect(jobs).toHaveLength(2));
    jobs[1].reject(new GitLogError('queryFailed', 'refresh failed'));
    await vi.waitFor(() => expect(view.webview.postedMessages).toContainEqual(expect.objectContaining({
      type: 'gitLogRefreshFailed', code: 'queryFailed'
    })));
    expect(view.webview.postedMessages.filter(message => (message as { type?: unknown }).type === 'gitLogError')).toEqual([]);

    const freshWorkspaceState = new MemoryMemento();
    const freshModeStore = new GitLogModeStore(freshWorkspaceState);
    await freshModeStore.save({ active: true });
    const freshService = { load: vi.fn().mockRejectedValue(new GitLogError('noWorkspace', 'missing')) };
    const freshContext = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    registerReaderView(freshContext as never, controller(), { snapshot: vi.fn() }, {
      modeStore: freshModeStore, preferencesStore: new GitLogPreferencesStore(new MemoryMemento()), service: freshService,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => [], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    const freshView = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(freshView);
    await vi.waitFor(() => expect(freshView.webview.postedMessages).toContainEqual(expect.objectContaining({
      type: 'gitLogError', code: 'noWorkspace'
    })));
  });

  it('uses strictly increasing generations for invalidation and every top-level mode transition', async () => {
    const workspaceState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const service = { load: vi.fn().mockResolvedValue(gitResult()) };
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    registerReaderView(context as never, controller(), { snapshot: vi.fn().mockResolvedValue({ books: [] }) }, {
      modeStore, preferencesStore: new GitLogPreferencesStore(new MemoryMemento()), service,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => ['D:/repo'], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(view);
    await vi.waitFor(() => expect(service.load).toHaveBeenCalledOnce());
    await commands.executeRegisteredCommand(TOGGLE_GIT_LOG_COMMAND_ID);
    await commands.executeRegisteredCommand(TOGGLE_GIT_LOG_COMMAND_ID);

    const transitions = view.webview.postedMessages.filter(message =>
      ['modeGitLog', 'modeInvalidated', 'modeLibrary'].includes(String((message as { type?: unknown }).type))
    ) as Array<{ type: string; modeGeneration: number }>;
    expect(transitions.map(message => message.type)).toEqual([
      'modeGitLog', 'modeInvalidated', 'modeLibrary', 'modeGitLog'
    ]);
    expect(transitions.map(message => message.modeGeneration)).toEqual([1, 2, 3, 4]);
  });

  it('registers extension-level disposal that aborts active work, clears state, and silences late callbacks', async () => {
    const workspaceState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const job = deferred<GitLogResult>();
    let signal: AbortSignal | undefined;
    const service = { load: vi.fn((request: GitLogLoadRequest) => { signal = request.signal; return job.promise; }) };
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    const provider = registerReaderView(context as never, controller(), { snapshot: vi.fn() }, {
      modeStore, preferencesStore: new GitLogPreferencesStore(new MemoryMemento()), service,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => ['D:/repo'], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    expect(context.subscriptions).toContain(provider);
    const view = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(view);
    await vi.waitFor(() => expect(service.load).toHaveBeenCalledOnce());
    const beforeDispose = view.webview.postedMessages.length;

    context.subscriptions.find(disposable => disposable === provider)?.dispose();
    expect(signal?.aborted).toBe(true);
    job.resolve(gitResult());
    await Promise.resolve();
    await Promise.resolve();
    expect(view.webview.postedMessages).toHaveLength(beforeDispose);

    provider.resolveWebviewView(createWebviewView() as never);
    expect(service.load).toHaveBeenCalledOnce();
  });

  it('replaces the single cache entry when a new query succeeds', async () => {
    const workspaceState = new MemoryMemento();
    const globalState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const preferencesStore = new GitLogPreferencesStore(globalState);
    const jobs: Array<ReturnType<typeof deferred<GitLogResult>>> = [];
    const service = { load: vi.fn(() => {
      const job = deferred<GitLogResult>(); jobs.push(job); return job.promise;
    }) };
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    registerReaderView(context as never, controller(), { snapshot: vi.fn() }, {
      modeStore, preferencesStore, service,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => ['D:/repo'], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    const view = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(view);
    await vi.waitFor(() => expect(jobs).toHaveLength(1));
    jobs[0].resolve(gitResult('fp-200'));
    await vi.waitFor(() => expect(view.webview.postedMessages.some(message => (message as { type?: unknown }).type === 'gitLogReady')).toBe(true));

    await view.webview.receiveMessage({ type: 'saveGitLogPreferences', preferences: { ...preferencesStore.get(), maxCommits: 400 } });
    await vi.waitFor(() => expect(jobs).toHaveLength(2));
    const modesAfterMiss = view.webview.postedMessages.filter(message => (message as { type?: unknown }).type === 'modeGitLog') as Record<string, unknown>[];
    expect(modesAfterMiss.at(-1)).not.toHaveProperty('cached');
    jobs[1].resolve(gitResult('fp-400'));
    await vi.waitFor(() => expect(view.webview.postedMessages.filter(message => (message as { type?: unknown }).type === 'gitLogReady')).toHaveLength(2));

    await view.webview.receiveMessage({ type: 'saveGitLogPreferences', preferences: { ...preferencesStore.get(), maxCommits: 200 } });
    await vi.waitFor(() => expect(jobs).toHaveLength(3));
    const modesAfterReplacement = view.webview.postedMessages.filter(message => (message as { type?: unknown }).type === 'modeGitLog') as Record<string, unknown>[];
    expect(modesAfterReplacement.at(-1)).not.toHaveProperty('cached');
  });

  it('keeps an active same-key refresh across Webview disposal and reuses it after rebuild', async () => {
    const workspaceState = new MemoryMemento();
    const modeStore = new GitLogModeStore(workspaceState);
    await modeStore.save({ active: true });
    const job = deferred<GitLogResult>();
    let signal: AbortSignal | undefined;
    const service = { load: vi.fn((request: GitLogLoadRequest) => { signal = request.signal; return job.promise; }) };
    const context = { extensionUri: Uri.file('/extension'), subscriptions: [] as Disposable[] };
    registerReaderView(context as never, controller(), { snapshot: vi.fn() }, {
      modeStore, preferencesStore: new GitLogPreferencesStore(new MemoryMemento()), service,
      readerPreferences: () => ({ fontSize: 18 }), workspaceRoots: () => ['D:/repo'], activeFilePath: () => undefined,
      saveResumeTarget: vi.fn()
    });
    const first = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(first);
    await vi.waitFor(() => expect(service.load).toHaveBeenCalledOnce());
    await first.dispose();

    const second = createWebviewView();
    await window.registeredWebviewViewProvider('moyuplus.readerView')?.resolveWebviewView(second);
    await vi.waitFor(() => expect(second.webview.postedMessages.some(message => (message as { type?: unknown }).type === 'modeGitLog')).toBe(true));
    expect(service.load).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(false);

    job.resolve(gitResult());
    await vi.waitFor(() => expect(second.webview.postedMessages.some(message => (message as { type?: unknown }).type === 'gitLogReady')).toBe(true));
  });
});
