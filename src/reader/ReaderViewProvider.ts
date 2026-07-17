import * as vscode from 'vscode';
import type { ReadingLocator } from '../domain/locators';
import { isReaderToExtensionV2Message, READER_VIEW_ID, type ReaderToExtensionV2Message } from './readerMessages';
import { getReaderWebviewHtml } from './webviewHtml';
import {
  CLOSE_READER_COMMAND_ID, FOCUS_READER_COMMAND_ID, NEXT_READER_PAGE_COMMAND_ID,
  PREVIOUS_READER_PAGE_COMMAND_ID, UNDO_READER_LOCATION_COMMAND_ID
} from '../shortcuts/shortcutSettings';
import {
  NEXT_READER_CHAPTER_COMMAND_ID, OPEN_READER_LIBRARY_COMMAND_ID, OPEN_READER_SETTINGS_COMMAND_ID,
  OPEN_READER_TOC_COMMAND_ID, PREVIOUS_READER_CHAPTER_COMMAND_ID, STOP_IMMERSIVE_READING_COMMAND_ID
} from '../shortcuts/shortcutSettings';
import type { ReadingPosition } from '../domain/locators';
import { isGitLogToExtensionMessage, toGitLogDisplayResult } from '../git/gitLogMessages';
import { GitLogError, type GitLogResult, type GitLogService } from '../git/gitLogService';
import {
  GitLogModeCoordinator, TOGGLE_GIT_LOG_COMMAND_ID, type GitLogCoordinatorView
} from '../git/gitLogModeCoordinator';
import {
  GitLogRefreshController, type GitLogRefreshOutcome
} from '../git/gitLogRefreshController';
import { createGitLogQuerySnapshot } from '../git/gitLogQuery';
import type { GitLogPreferencesStore } from '../storage/gitLogPreferencesStore';
import type { GitLogModeStore, GitLogResumeTarget } from '../storage/gitLogModeStore';

export type ReaderExternalCommand = 'nextPage' | 'previousPage' | 'undoLocation' | 'nextChapter' | 'previousChapter' | 'openLibrary' | 'openToc' | 'openSettings';

export { READER_VIEW_ID };

export interface ReaderViewController {
  openBook(bookId: string, requestId?: string): void | boolean | Promise<void | boolean>;
  openImmersiveBook?(bookId: string): void | boolean | Promise<void | boolean>;
  readonly presentationMode?: 'webview' | 'immersive';
  snapshot?(): { bookId: string; mode: 'webview' | 'immersive'; state: 'opening' | 'active' | 'switching' | 'stopping' } | undefined;
  requestSection(sectionId: string): void | Promise<void>;
  requestNextSection(sectionId: string): void | Promise<void>;
  requestPreviousSection(sectionId: string): void | Promise<void>;
  openImage?(request: Omit<Extract<ReaderToExtensionV2Message, { type: 'openImage' }>, 'version' | 'type'>): void | Promise<void>;
  reportLayout(locator: ReadingLocator, bookProgression: number): void;
  capturePosition?(): ReadingPosition | undefined;
  flush(): void | Promise<void>;
  closeSession?(): void | Promise<void>;
  stopImmersive?(): void | boolean | { stopped: boolean; progressPersisted: boolean }
    | Promise<void | boolean | { stopped: boolean; progressPersisted: boolean }>;
  suspendImmersive?(): void;
  resumeImmersive?(): void;
  requestNextPage?(): boolean | Promise<boolean>;
  requestPreviousPage?(): boolean | Promise<boolean>;
  requestNextChapter?(): boolean | Promise<boolean>;
  requestPreviousChapter?(): boolean | Promise<boolean>;
  dispose(): void | Promise<void>;
}

export interface ReaderGitLogBridge {
  modeStore: GitLogModeStore;
  preferencesStore: GitLogPreferencesStore;
  service: Pick<GitLogService, 'load'>;
  readerPreferences(): unknown;
  workspaceRoots(): string[];
  activeFilePath(): string | undefined;
  saveResumeTarget(target: GitLogResumeTarget): void | PromiseLike<void>;
}

export interface ReaderLibraryBridge {
  snapshot(): PromiseLike<unknown>;
  importBook?(): void | PromiseLike<unknown>;
  removeBook?(bookId: string): void | PromiseLike<unknown>;
  relocateBook?(bookId: string): void | PromiseLike<unknown>;
  startTypingPractice?(bookId: string): void | PromiseLike<unknown>;
  savePreferences?(preferences: unknown): void | PromiseLike<unknown>;
  openSettings?(section: 'reader' | 'immersive' | 'gitLog'): void | PromiseLike<void>;
}

export class ReaderViewProvider implements vscode.WebviewViewProvider, GitLogCoordinatorView, vscode.Disposable {
  private view?: vscode.WebviewView;
  private canNextPage = false;
  private canPreviousPage = false;
  private canUndoLocation = false;
  private readerRequest?: { requestId: string; bookId: string };
  private coordinator?: GitLogModeCoordinator;
  private readonly gitRefresh?: GitLogRefreshController;
  private gitCache?: { queryKey: string; result: GitLogResult };
  private gitUiSession?: GitLogUiSession;
  private modeGeneration = 0;
  private bootstrapped = false;
  private readerPageActive = false;
  private libraryPageActive = true;
  private libraryDirty = false;
  private libraryRequestVersion = 0;
  private libraryCompletedVersion = 0;
  private libraryRevision = 0;
  private libraryDrain?: Promise<void>;
  private libraryDeliveredView?: vscode.WebviewView;
  private immersiveStop?: Promise<boolean>;
  private stoppingBookId?: string;
  private disposed = false;
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly controller: ReaderViewController,
    private readonly library?: ReaderLibraryBridge,
    private readonly git?: ReaderGitLogBridge
  ) {
    if (git) {
      this.gitRefresh = new GitLogRefreshController(
        request => git.service.load(request),
        outcome => this.handleGitRefreshOutcome(outcome)
      );
    }
  }

  attachCoordinator(coordinator: GitLogModeCoordinator): void { this.coordinator = coordinator; }

  resolveWebviewView(view: vscode.WebviewView): void {
    if (this.disposed) return;
    this.view = view;
    this.bootstrapped = false;
    this.libraryPageActive = true;
    this.libraryDirty = true;
    this.libraryRequestVersion += 1;
    this.libraryDeliveredView = undefined;
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
    view.webview.onDidReceiveMessage((value: unknown) => this.handleMessage(value));
    view.onDidChangeVisibility(() => this.handleVisibilityChanged(view));
    view.onDidDispose(() => {
      this.coordinator?.dispose();
      if (this.view === view) {
        this.view = undefined;
        this.libraryDeliveredView = undefined;
        this.libraryDirty = true;
        this.libraryRequestVersion += 1;
      }
      return this.controller.presentationMode === 'immersive'
        ? undefined
        : (this.controller.closeSession?.() ?? this.controller.dispose());
    });
    view.webview.html = getReaderWebviewHtml(
      view.webview,
      view.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'readerApp.js')),
      view.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'readerApp.css'))
    );
    if (this.coordinator) {
      this.bootstrapped = true;
      void this.coordinator.bootstrap();
    }
    else void this.refreshLibrary();
  }

  isVisible(): boolean { return this.view?.visible === true; }

  private async handleVisibilityChanged(view: vscode.WebviewView): Promise<void> {
    if (view !== this.view || this.disposed) return;
    if (!view.visible) {
      this.libraryDirty = true;
      this.libraryRequestVersion += 1;
      await this.controller.flush();
      return;
    }
    if (this.coordinator) await this.coordinator.visibilityChanged();
    else await this.refreshLibrary();
  }

  async focus(): Promise<void> {
    await vscode.commands.executeCommand(`${READER_VIEW_ID}.focus`);
  }

  async openGitSession(sessionId: string): Promise<void> {
    const git = this.git;
    const refresh = this.gitRefresh;
    const view = this.view;
    if (!git || !refresh || !view || !view.visible || this.disposed) return;
    this.libraryPageActive = false;
    this.libraryRequestVersion += 1;

    const preferences = git.preferencesStore.get();
    const snapshot = createGitLogQuerySnapshot({
      getWorkspaceRoots: () => git.workspaceRoots(),
      getActiveFilePath: () => git.activeFilePath(),
      getMaxCommits: () => preferences.maxCommits
    });
    const cached = this.gitCache?.queryKey === snapshot.queryKey ? this.gitCache.result : undefined;
    const session: GitLogUiSession = {
      id: sessionId,
      queryKey: snapshot.queryKey,
      generation: this.nextModeGeneration(),
      presentedFingerprint: cached?.fingerprint,
      usedCache: cached !== undefined,
      modeDelivered: false
    };
    this.gitUiSession = session;
    session.observedJobToken = refresh.request(snapshot).token;

    await view.webview.postMessage({
      type: 'modeGitLog',
      sessionId,
      modeGeneration: session.generation,
      preferences,
      readerPreferences: git.readerPreferences(),
      ...(cached ? { cached: toGitLogDisplayResult(cached) } : {})
    });

    if (!this.isCurrentGitSession(session, view)) return;
    session.modeDelivered = true;
    const deferredOutcome = session.deferredOutcome;
    session.deferredOutcome = undefined;
    if (deferredOutcome) this.deliverGitRefreshOutcome(session, deferredOutcome);
  }

  detachGitSession(sessionId: string): void {
    const session = this.gitUiSession;
    if (!session || session.id !== sessionId) return;
    this.gitUiSession = undefined;
    const modeGeneration = this.nextModeGeneration();
    void this.postMessage({ type: 'modeInvalidated', sessionId, modeGeneration });
  }

  async showLibrary(message?: string): Promise<void> {
    this.gitUiSession = undefined;
    this.readerPageActive = false;
    this.libraryPageActive = true;
    this.resetReaderNavigation();
    await this.postMessage({ type: 'modeLibrary', modeGeneration: this.nextModeGeneration(), ...(message ? { message } : {}) });
    await this.refreshLibrary();
  }

  captureVisibleReaderPosition(): ReadingPosition | undefined {
    return this.readerPageActive || this.controller.presentationMode === 'immersive'
      ? this.controller.capturePosition?.()
      : undefined;
  }

  async showError(message: string): Promise<void> {
    await vscode.window.showErrorMessage(message);
  }

  async requestNextPage(): Promise<boolean> {
    if (this.controller.presentationMode === 'immersive') return await this.controller.requestNextPage?.() ?? false;
    if (!this.readerPageActive || !this.canNextPage) return false;
    return this.requestReaderCommand('nextPage');
  }
  async requestPreviousPage(): Promise<boolean> {
    if (this.controller.presentationMode === 'immersive') return await this.controller.requestPreviousPage?.() ?? false;
    if (!this.readerPageActive || !this.canPreviousPage) return false;
    return this.requestReaderCommand('previousPage');
  }
  async requestUndoLocation(): Promise<boolean> {
    if (!this.readerPageActive || !this.canUndoLocation) return false;
    return this.requestReaderCommand('undoLocation');
  }

  async requestReaderCommand(command: ReaderExternalCommand): Promise<boolean> {
    if (this.controller.presentationMode === 'immersive') {
      if (command === 'nextPage') return await this.controller.requestNextPage?.() ?? false;
      if (command === 'previousPage') return await this.controller.requestPreviousPage?.() ?? false;
      if (command === 'nextChapter') return await this.controller.requestNextChapter?.() ?? false;
      if (command === 'previousChapter') return await this.controller.requestPreviousChapter?.() ?? false;
      if (command === 'openLibrary') { await this.controller.closeSession?.(); await this.showLibrary(); return true; }
      if (command === 'openSettings') return this.openSettings('immersive');
      return false;
    }
    return this.readerPageActive && this.view ? this.view.webview.postMessage({ type: 'command', command }) : false;
  }

  async postMessage(message: unknown): Promise<boolean> {
    return !this.disposed && this.view ? this.view.webview.postMessage(message) : false;
  }

  async applyReaderPreferences(preferences: unknown): Promise<void> {
    await this.postMessage({ type: 'readerPreferencesUpdated', preferences });
  }

  async applyGitLogPreferences(preferences: unknown, previous?: { maxCommits?: number }): Promise<void> {
    await this.postMessage({ type: 'gitLogPreferencesUpdated', preferences });
    const next = isRecord(preferences) ? preferences.maxCommits : undefined;
    if (typeof next === 'number' && next !== previous?.maxCommits
      && this.git?.modeStore.get().active && this.isVisible()) {
      await this.coordinator?.visibilityChanged();
    }
  }

  async openSettings(section: 'reader' | 'immersive' | 'gitLog'): Promise<boolean> {
    if (!this.library?.openSettings) return false;
    await this.library.openSettings(section);
    return true;
  }

  async stopImmersive(expectedBookId?: string): Promise<boolean> {
    if (this.immersiveStop) {
      return expectedBookId === undefined || expectedBookId === this.stoppingBookId
        ? this.immersiveStop
        : false;
    }
    const session = this.controller.snapshot?.();
    if (!session || session.mode !== 'immersive'
      || (expectedBookId !== undefined && expectedBookId !== session.bookId)) return false;
    if (!this.controller.stopImmersive) return false;

    this.stoppingBookId = session.bookId;
    const operation = (async () => {
      try {
        const result = await this.controller.stopImmersive!();
        const stopped = isRecord(result) ? result.stopped === true : result === true;
        if (stopped && isRecord(result) && result.progressPersisted === false) {
          await vscode.window.showErrorMessage('阅读进度保存失败，已停止沉浸阅读。书架将显示上一次成功保存的位置。');
        }
        return stopped;
      } finally {
        await this.refreshLibrary();
      }
    })();
    this.immersiveStop = operation;
    try {
      return await operation;
    } finally {
      if (this.immersiveStop === operation) {
        this.immersiveStop = undefined;
        this.stoppingBookId = undefined;
      }
    }
  }

  private async handleMessage(value: unknown): Promise<void> {
    if (this.disposed) return;
    if (isRecord(value) && value.type === 'readerWebviewBlurred') {
      this.controller.resumeImmersive?.();
      return;
    }
    if (this.controller.presentationMode === 'immersive') this.controller.suspendImmersive?.();
    if (isRecord(value) && (value.type === 'libraryReady' || value.type === 'appReady')) {
      if (this.coordinator) {
        if (!this.bootstrapped) {
          this.bootstrapped = true;
          await this.coordinator.bootstrap();
        }
      } else if (this.libraryDrain) await this.libraryDrain;
      else if (this.libraryDirty || this.libraryDeliveredView !== this.view) await this.refreshLibrary();
      return;
    }
    if (isRecord(value) && value.type === 'openUnifiedSettings'
      && (value.section === 'reader' || value.section === 'gitLog')) {
      await this.library?.openSettings?.(value.section);
      return;
    }
    if (isGitLogToExtensionMessage(value) && this.git) {
      const previous = this.git.preferencesStore.get();
      const saved = await this.git.preferencesStore.save(value.preferences);
      if (previous.maxCommits !== saved.maxCommits && this.git.modeStore.get().active && this.isVisible()) {
        await this.coordinator?.visibilityChanged();
      }
      return;
    }
    if (isRecord(value) && value.type === 'importBook') { await this.library?.importBook?.(); await this.refreshLibrary(); return; }
    if (isBookAction(value, 'removeBook')) { await this.library?.removeBook?.(value.bookId); await this.refreshLibrary(); return; }
    if (isBookAction(value, 'relocate')) { await this.library?.relocateBook?.(value.bookId); await this.refreshLibrary(); return; }
    if (isBookAction(value, 'startTypingPractice')) { await this.library?.startTypingPractice?.(value.bookId); return; }
    if (isRecord(value) && value.type === 'savePreferences') { await this.library?.savePreferences?.(value.preferences); await this.refreshLibrary(); return; }
    if (!isReaderToExtensionV2Message(value)) return;
    await this.dispatchReaderMessage(value);
  }

  private async dispatchReaderMessage(message: ReaderToExtensionV2Message): Promise<void> {
    switch (message.type) {
      case 'openBook': {
        const opened = await this.controller.openBook(message.bookId, message.requestId);
        if (opened !== false) {
          this.readerPageActive = true;
          this.libraryPageActive = false;
          this.readerRequest = { requestId: message.requestId, bookId: message.bookId };
        }
        return;
      }
      case 'startImmersive': {
        const opened = await this.controller.openImmersiveBook?.(message.bookId);
        if (opened !== false && opened !== undefined) {
          this.readerPageActive = false;
          this.libraryPageActive = true;
          this.resetReaderNavigation();
          await this.refreshLibrary();
        }
        return;
      }
      case 'stopImmersive': await this.stopImmersive(message.bookId); return;
      case 'requestSection': await this.controller.requestSection(message.sectionId); return;
      case 'requestSectionTarget': await this.controller.requestSection(message.sectionId); return;
      case 'requestNextSection': await this.controller.requestNextSection(message.sectionId); return;
      case 'requestPreviousSection': await this.controller.requestPreviousSection(message.sectionId); return;
      case 'openImage': await this.controller.openImage?.({
        requestId: message.requestId,
        bookId: message.bookId,
        sectionId: message.sectionId,
        sectionGeneration: message.sectionGeneration,
        resourceId: message.resourceId
      }); return;
      case 'navigationState':
        if (this.readerPageActive && this.readerRequest?.requestId === message.requestId && this.readerRequest.bookId === message.bookId) {
          this.canPreviousPage = message.canPreviousPage;
          this.canNextPage = message.canNextPage;
          this.canUndoLocation = message.canUndoLocation;
        }
        return;
      case 'layoutStable': this.controller.reportLayout(message.locator, message.bookProgression); return;
      case 'closeBook':
        this.readerPageActive = false;
        this.libraryPageActive = true;
        this.resetReaderNavigation();
        this.controller.reportLayout(message.locator, message.bookProgression);
        await this.controller.flush();
        await this.controller.closeSession?.();
        await this.refreshLibrary();
        return;
    }
  }

  private resetReaderNavigation(): void {
    this.canPreviousPage = false;
    this.canNextPage = false;
    this.canUndoLocation = false;
    this.readerRequest = undefined;
  }

  private async refreshLibrary(): Promise<void> {
    this.libraryDirty = true;
    const requestVersion = ++this.libraryRequestVersion;
    if (!this.canRefreshLibrary()) return;
    while (this.canRefreshLibrary() && this.libraryCompletedVersion < requestVersion) {
      await this.ensureLibraryDrain();
    }
  }

  private canRefreshLibrary(): boolean {
    return Boolean(this.library && this.view?.visible && !this.disposed
      && this.libraryPageActive && !this.readerPageActive && !this.gitUiSession
      && !this.git?.modeStore.get().active);
  }

  private ensureLibraryDrain(): Promise<void> {
    if (this.libraryDrain) return this.libraryDrain;
    const operation = this.drainLibraryRefreshes();
    const tracked = operation.finally(() => {
      if (this.libraryDrain !== tracked) return;
      this.libraryDrain = undefined;
      if (this.libraryDirty && this.canRefreshLibrary()) void this.ensureLibraryDrain();
    });
    this.libraryDrain = tracked;
    return tracked;
  }

  private async drainLibraryRefreshes(): Promise<void> {
    while (this.libraryDirty && this.canRefreshLibrary()) {
      this.libraryDirty = false;
      const requestVersion = this.libraryRequestVersion;
      const view = this.view!;
      try {
        const snapshot = await this.library!.snapshot();
        if (!this.isCurrentLibraryBuild(view, requestVersion)) continue;
        const session = this.controller.snapshot?.();
        const delivered = await view.webview.postMessage({
          type: 'libraryState',
          ...(isRecord(snapshot) ? snapshot : {}),
          immersiveBookId: session?.mode === 'immersive' ? session.bookId : undefined,
          libraryRevision: ++this.libraryRevision
        });
        if (delivered && view === this.view) this.libraryDeliveredView = view;
        this.libraryCompletedVersion = requestVersion;
      } catch {
        if (this.isCurrentLibraryBuild(view, requestVersion)) {
          await view.webview.postMessage({ type: 'libraryLoadError', message: '书架载入失败，请重新打开 MoyuPlus Reader。' });
          this.libraryCompletedVersion = requestVersion;
        }
      }
    }
  }

  private isCurrentLibraryBuild(view: vscode.WebviewView, requestVersion: number): boolean {
    return view === this.view && requestVersion === this.libraryRequestVersion && this.canRefreshLibrary();
  }

  async restoreReader(target: GitLogResumeTarget): Promise<boolean> {
    if (!this.library || !this.view) return false;
    this.libraryPageActive = false;
    this.libraryRequestVersion += 1;
    this.libraryDeliveredView = undefined;
    const snapshot = await this.library.snapshot();
    const books = isRecord(snapshot) && Array.isArray(snapshot.books) ? snapshot.books : [];
    const book = books.find(item => isRecord(item) && item.id === target.bookId);
    if (!book) return false;
    const availability = isRecord(snapshot) && isRecord(snapshot.availability) ? snapshot.availability : {};
    const progress = isRecord(snapshot) && isRecord(snapshot.progress) ? snapshot.progress : {};
    const requestId = `git-log-restore-${Date.now()}`;
    if (target.presentationMode === 'immersive' && this.controller.openImmersiveBook) {
      this.libraryPageActive = true;
      await this.view.webview.postMessage({ type: 'modeLibrary', modeGeneration: this.nextModeGeneration() });
      const opened = await this.controller.openImmersiveBook(target.bookId);
      this.readerPageActive = false;
      if (opened !== false) await this.refreshLibrary();
      return opened !== false;
    }
    await this.view.webview.postMessage({
      type: 'modeReaderRestore', modeGeneration: this.nextModeGeneration(), book, requestId,
      books, availability, progress, libraryRevision: ++this.libraryRevision,
      ...(isRecord(snapshot) && isRecord(snapshot.preferences) ? { preferences: snapshot.preferences } : {})
    });
    const opened = await this.controller.openBook(target.bookId, requestId);
    this.readerPageActive = opened !== false;
    return opened !== false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.coordinator?.dispose();
    this.gitUiSession = undefined;
    this.gitCache = undefined;
    this.readerPageActive = false;
    this.libraryPageActive = false;
    this.libraryRequestVersion += 1;
    this.gitRefresh?.dispose();
    this.view = undefined;
    void this.controller.dispose();
  }

  private handleGitRefreshOutcome(outcome: GitLogRefreshOutcome): void {
    if (this.disposed) return;
    if (outcome.status === 'success') this.gitCache = { queryKey: outcome.queryKey, result: outcome.result };
    const session = this.gitUiSession;
    if (!session || session.queryKey !== outcome.queryKey || session.observedJobToken !== outcome.token) return;
    if (!this.git?.modeStore.get().active || !this.isVisible()) return;
    if (!session.modeDelivered) {
      session.deferredOutcome = outcome;
      return;
    }
    this.deliverGitRefreshOutcome(session, outcome);
  }

  private deliverGitRefreshOutcome(session: GitLogUiSession, outcome: GitLogRefreshOutcome): void {
    if (this.gitUiSession !== session || !this.git?.modeStore.get().active || !this.isVisible()) return;
    if (outcome.status === 'success') {
      if (outcome.result.fingerprint === session.presentedFingerprint) return;
      session.presentedFingerprint = outcome.result.fingerprint;
      void this.postMessage({ type: 'gitLogReady', sessionId: session.id, ...toGitLogDisplayResult(outcome.result) });
      return;
    }
    const { code, message } = toGitLogFailure(outcome.error);
    void this.postMessage({
      type: session.usedCache ? 'gitLogRefreshFailed' : 'gitLogError',
      sessionId: session.id,
      code,
      message
    });
  }

  private isCurrentGitSession(session: GitLogUiSession, view: vscode.WebviewView): boolean {
    return !this.disposed
      && this.gitUiSession === session
      && this.view === view
      && view.visible
      && this.git?.modeStore.get().active === true;
  }

  private nextModeGeneration(): number {
    this.modeGeneration += 1;
    return this.modeGeneration;
  }
}

interface GitLogUiSession {
  readonly id: string;
  readonly queryKey: string;
  readonly generation: number;
  presentedFingerprint?: string;
  readonly usedCache: boolean;
  observedJobToken?: number;
  modeDelivered: boolean;
  deferredOutcome?: GitLogRefreshOutcome;
}

function toGitLogFailure(error: unknown): { code: string; message: string } {
  return error instanceof GitLogError
    ? { code: error.code, message: error.message }
    : { code: 'queryFailed', message: 'Unable to read Git history.' };
}

export function registerReaderView(
  context: vscode.ExtensionContext,
  controller: ReaderViewController,
  library?: ReaderLibraryBridge,
  git?: ReaderGitLogBridge
): ReaderViewProvider {
  const provider = new ReaderViewProvider(context.extensionUri ?? vscode.Uri.file('.'), controller, library, git);
  let capturedPosition: ReadingPosition | undefined;
  const coordinator = git ? new GitLogModeCoordinator(
    git.modeStore,
    {
      capturePosition: () => {
        capturedPosition = provider.captureVisibleReaderPosition();
        return capturedPosition;
      },
      presentationMode: () => controller.presentationMode,
      flush: async () => {
        const position = capturedPosition;
        capturedPosition = undefined;
        await Promise.all([
          controller.flush(),
          position ? Promise.resolve(git.saveResumeTarget({
            bookId: position.bookId,
            locator: { ...position.locator },
            bookProgression: position.bookProgression
          })) : Promise.resolve()
        ]);
        await controller.closeSession?.();
      },
      restore: target => provider.restoreReader(target)
    },
    provider
  ) : undefined;
  if (coordinator) provider.attachCoordinator(coordinator);
  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider(READER_VIEW_ID, provider),
    vscode.commands.registerCommand(NEXT_READER_PAGE_COMMAND_ID, () => provider.requestNextPage()),
    vscode.commands.registerCommand(PREVIOUS_READER_PAGE_COMMAND_ID, () => provider.requestPreviousPage()),
    vscode.commands.registerCommand(UNDO_READER_LOCATION_COMMAND_ID, () => provider.requestUndoLocation()),
    vscode.commands.registerCommand(FOCUS_READER_COMMAND_ID, () => vscode.commands.executeCommand(`${READER_VIEW_ID}.focus`)),
    vscode.commands.registerCommand(CLOSE_READER_COMMAND_ID, () => vscode.commands.executeCommand('workbench.action.closeSidebar')),
    vscode.commands.registerCommand(OPEN_READER_LIBRARY_COMMAND_ID, () => provider.requestReaderCommand('openLibrary')),
    vscode.commands.registerCommand(PREVIOUS_READER_CHAPTER_COMMAND_ID, () => provider.requestReaderCommand('previousChapter')),
    vscode.commands.registerCommand(NEXT_READER_CHAPTER_COMMAND_ID, () => provider.requestReaderCommand('nextChapter')),
    vscode.commands.registerCommand(OPEN_READER_TOC_COMMAND_ID, () => provider.requestReaderCommand('openToc')),
    vscode.commands.registerCommand(OPEN_READER_SETTINGS_COMMAND_ID, () => provider.openSettings(controller.presentationMode === 'immersive' ? 'immersive' : 'reader')),
    vscode.commands.registerCommand(STOP_IMMERSIVE_READING_COMMAND_ID, () => provider.stopImmersive()),
    ...(coordinator ? [vscode.commands.registerCommand(TOGGLE_GIT_LOG_COMMAND_ID, () => coordinator.toggle())] : [])
  );
  return provider;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBookAction(value: unknown, type: string): value is { type: string; bookId: string } {
  return isRecord(value) && value.type === type && typeof value.bookId === 'string' && value.bookId.length > 0;
}
