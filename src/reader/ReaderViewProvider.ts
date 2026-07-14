import * as vscode from 'vscode';
import type { ReadingLocator } from '../domain/locators';
import { isReaderToExtensionV2Message, READER_VIEW_ID, type ReaderToExtensionV2Message } from './readerMessages';
import { getReaderWebviewHtml } from './webviewHtml';
import {
  CLOSE_READER_COMMAND_ID, FOCUS_READER_COMMAND_ID, NEXT_READER_PAGE_COMMAND_ID,
  PREVIOUS_READER_PAGE_COMMAND_ID
} from '../shortcuts/shortcutSettings';
import {
  NEXT_READER_CHAPTER_COMMAND_ID, OPEN_READER_LIBRARY_COMMAND_ID, OPEN_READER_SETTINGS_COMMAND_ID,
  OPEN_READER_TOC_COMMAND_ID, PREVIOUS_READER_CHAPTER_COMMAND_ID
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

export type ReaderExternalCommand = 'nextPage' | 'previousPage' | 'nextChapter' | 'previousChapter' | 'openLibrary' | 'openToc' | 'openSettings';

export { READER_VIEW_ID };

export interface ReaderViewController {
  openBook(bookId: string, requestId?: string): void | boolean | Promise<void | boolean>;
  requestSection(sectionId: string): void | Promise<void>;
  requestNextSection(sectionId: string): void | Promise<void>;
  requestPreviousSection(sectionId: string): void | Promise<void>;
  reportLayout(locator: ReadingLocator, bookProgression: number): void;
  capturePosition?(): ReadingPosition | undefined;
  flush(): void | Promise<void>;
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
}

export class ReaderViewProvider implements vscode.WebviewViewProvider, GitLogCoordinatorView, vscode.Disposable {
  private view?: vscode.WebviewView;
  private canNextPage = false;
  private coordinator?: GitLogModeCoordinator;
  private readonly gitRefresh?: GitLogRefreshController;
  private gitCache?: { queryKey: string; result: GitLogResult };
  private gitUiSession?: GitLogUiSession;
  private modeGeneration = 0;
  private bootstrapped = false;
  private readerPageActive = false;
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
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
    view.webview.onDidReceiveMessage((value: unknown) => this.handleMessage(value));
    view.onDidChangeVisibility(() => {
      if (!view.visible) void this.controller.flush();
      return this.coordinator ? this.coordinator.visibilityChanged() : (view.visible ? this.refreshLibrary() : undefined);
    });
    view.onDidDispose(() => {
      this.coordinator?.dispose();
      if (this.view === view) this.view = undefined;
      return this.controller.dispose();
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

  async focus(): Promise<void> {
    await vscode.commands.executeCommand(`${READER_VIEW_ID}.focus`);
  }

  async openGitSession(sessionId: string): Promise<void> {
    const git = this.git;
    const refresh = this.gitRefresh;
    const view = this.view;
    if (!git || !refresh || !view || !view.visible || this.disposed) return;

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
    await this.postMessage({ type: 'modeLibrary', modeGeneration: this.nextModeGeneration(), ...(message ? { message } : {}) });
    await this.refreshLibrary();
  }

  captureVisibleReaderPosition(): ReadingPosition | undefined {
    return this.readerPageActive ? this.controller.capturePosition?.() : undefined;
  }

  async showError(message: string): Promise<void> {
    await vscode.window.showErrorMessage(message);
  }

  async requestNextPage(): Promise<boolean> {
    if (!this.canNextPage) return false;
    return this.requestReaderCommand('nextPage');
  }
  async requestPreviousPage(): Promise<void> { await this.requestReaderCommand('previousPage'); }

  async requestReaderCommand(command: ReaderExternalCommand): Promise<boolean> {
    return this.view ? this.view.webview.postMessage({ type: 'command', command }) : false;
  }

  async postMessage(message: unknown): Promise<boolean> {
    return !this.disposed && this.view ? this.view.webview.postMessage(message) : false;
  }

  private async handleMessage(value: unknown): Promise<void> {
    if (this.disposed) return;
    if (isNavigationState(value)) {
      this.canNextPage = value.canNextPage;
      return;
    }
    if (isRecord(value) && (value.type === 'libraryReady' || value.type === 'appReady')) {
      if (this.coordinator) {
        if (!this.bootstrapped) {
          this.bootstrapped = true;
          await this.coordinator.bootstrap();
        }
      } else await this.refreshLibrary();
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
        if (opened !== false) this.readerPageActive = true;
        return;
      }
      case 'requestSection': await this.controller.requestSection(message.sectionId); return;
      case 'requestNextSection': await this.controller.requestNextSection(message.sectionId); return;
      case 'requestPreviousSection': await this.controller.requestPreviousSection(message.sectionId); return;
      case 'layoutStable': this.controller.reportLayout(message.locator, message.bookProgression); return;
      case 'closeBook':
        this.readerPageActive = false;
        this.controller.reportLayout(message.locator, message.bookProgression);
        await this.controller.flush();
        return;
    }
  }

  private async refreshLibrary(): Promise<void> {
    if (!this.library || !this.view) return;
    try {
      const snapshot = await this.library.snapshot();
      await this.view.webview.postMessage({ type: 'libraryState', ...(isRecord(snapshot) ? snapshot : {}) });
    } catch {
      await this.view.webview.postMessage({ type: 'libraryLoadError', message: '书架载入失败，请重新打开 MoyuPlus Reader。' });
    }
  }

  async restoreReader(target: GitLogResumeTarget): Promise<boolean> {
    if (!this.library || !this.view) return false;
    const snapshot = await this.library.snapshot();
    const books = isRecord(snapshot) && Array.isArray(snapshot.books) ? snapshot.books : [];
    const book = books.find(item => isRecord(item) && item.id === target.bookId);
    if (!book) return false;
    const availability = isRecord(snapshot) && isRecord(snapshot.availability) ? snapshot.availability : {};
    const progress = isRecord(snapshot) && isRecord(snapshot.progress) ? snapshot.progress : {};
    const requestId = `git-log-restore-${Date.now()}`;
    await this.view.webview.postMessage({
      type: 'modeReaderRestore', modeGeneration: this.nextModeGeneration(), book, requestId,
      books, availability, progress,
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
    vscode.commands.registerCommand(FOCUS_READER_COMMAND_ID, () => vscode.commands.executeCommand(`${READER_VIEW_ID}.focus`)),
    vscode.commands.registerCommand(CLOSE_READER_COMMAND_ID, () => vscode.commands.executeCommand('workbench.action.closeSidebar')),
    vscode.commands.registerCommand(OPEN_READER_LIBRARY_COMMAND_ID, () => provider.requestReaderCommand('openLibrary')),
    vscode.commands.registerCommand(PREVIOUS_READER_CHAPTER_COMMAND_ID, () => provider.requestReaderCommand('previousChapter')),
    vscode.commands.registerCommand(NEXT_READER_CHAPTER_COMMAND_ID, () => provider.requestReaderCommand('nextChapter')),
    vscode.commands.registerCommand(OPEN_READER_TOC_COMMAND_ID, () => provider.requestReaderCommand('openToc')),
    vscode.commands.registerCommand(OPEN_READER_SETTINGS_COMMAND_ID, () => provider.requestReaderCommand('openSettings')),
    ...(coordinator ? [vscode.commands.registerCommand(TOGGLE_GIT_LOG_COMMAND_ID, () => coordinator.toggle())] : [])
  );
  return provider;
}

function isNavigationState(value: unknown): value is { type: 'navigationState'; canNextPage: boolean } {
  return typeof value === 'object' && value !== null
    && (value as { type?: unknown }).type === 'navigationState'
    && typeof (value as { canNextPage?: unknown }).canNextPage === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBookAction(value: unknown, type: string): value is { type: string; bookId: string } {
  return isRecord(value) && value.type === type && typeof value.bookId === 'string' && value.bookId.length > 0;
}
