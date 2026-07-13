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
import { isGitLogToExtensionMessage } from '../git/gitLogMessages';
import { GitLogError, type GitLogResult, type GitLogService } from '../git/gitLogService';
import {
  GitLogModeCoordinator, TOGGLE_GIT_LOG_COMMAND_ID, type GitLogCoordinatorSessions, type GitLogCoordinatorView
} from '../git/gitLogModeCoordinator';
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

export class ReaderViewProvider implements vscode.WebviewViewProvider, GitLogCoordinatorView, GitLogCoordinatorSessions {
  private view?: vscode.WebviewView;
  private canNextPage = false;
  private coordinator?: GitLogModeCoordinator;
  private gitSession?: { id: string; abort: AbortController };
  private bootstrapped = false;
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly controller: ReaderViewController,
    private readonly library?: ReaderLibraryBridge,
    private readonly git?: ReaderGitLogBridge
  ) {}

  attachCoordinator(coordinator: GitLogModeCoordinator): void { this.coordinator = coordinator; }

  resolveWebviewView(view: vscode.WebviewView): void {
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

  async showGitLoading(sessionId: string): Promise<void> {
    if (!this.git) return;
    await this.postMessage({
      type: 'modeGitLog',
      sessionId,
      preferences: this.git.preferencesStore.get(),
      readerPreferences: this.git.readerPreferences()
    });
  }

  async showLibrary(message?: string): Promise<void> {
    await this.postMessage({ type: 'modeLibrary', ...(message ? { message } : {}) });
    await this.refreshLibrary();
  }

  async showError(message: string): Promise<void> {
    await vscode.window.showErrorMessage(message);
  }

  start(sessionId: string): void {
    if (!this.git || !this.isVisible()) return;
    this.cancel();
    const abort = new AbortController();
    this.gitSession = { id: sessionId, abort };
    void this.git.service.load({
      workspaceRoots: this.git.workspaceRoots(),
      activeFilePath: this.git.activeFilePath(),
      maxCommits: this.git.preferencesStore.get().maxCommits,
      signal: abort.signal
    }).then(result => this.finishGitSession(sessionId, result)).catch(error => this.failGitSession(sessionId, error));
  }

  cancel(): void {
    const session = this.gitSession;
    this.gitSession = undefined;
    if (!session) return;
    session.abort.abort();
    void this.postMessage({ type: 'gitLogInvalidated', sessionId: session.id });
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
    return this.view ? this.view.webview.postMessage(message) : false;
  }

  private async handleMessage(value: unknown): Promise<void> {
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
    await dispatchReaderMessage(this.controller, value);
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
    const requestId = `git-log-restore-${Date.now()}`;
    await this.view.webview.postMessage({
      type: 'modeReaderRestore', book, requestId,
      ...(isRecord(snapshot) && isRecord(snapshot.preferences) ? { preferences: snapshot.preferences } : {})
    });
    const opened = await this.controller.openBook(target.bookId, requestId);
    return opened !== false;
  }

  private async finishGitSession(sessionId: string, result: GitLogResult): Promise<void> {
    if (this.gitSession?.id !== sessionId || !this.isVisible()) return;
    this.gitSession = undefined;
    await this.postMessage({ type: 'gitLogReady', sessionId, ...result });
  }

  private async failGitSession(sessionId: string, error: unknown): Promise<void> {
    if (this.gitSession?.id !== sessionId || !this.isVisible()) return;
    this.gitSession = undefined;
    const code = error instanceof GitLogError ? error.code : 'queryFailed';
    const message = error instanceof GitLogError ? error.message : 'Unable to read Git history.';
    await this.postMessage({ type: 'gitLogError', sessionId, code, message });
  }
}

async function dispatchReaderMessage(controller: ReaderViewController, message: ReaderToExtensionV2Message): Promise<void> {
  switch (message.type) {
    case 'openBook': await controller.openBook(message.bookId, message.requestId); return;
    case 'requestSection': await controller.requestSection(message.sectionId); return;
    case 'requestNextSection': await controller.requestNextSection(message.sectionId); return;
    case 'requestPreviousSection': await controller.requestPreviousSection(message.sectionId); return;
    case 'layoutStable': controller.reportLayout(message.locator, message.bookProgression); return;
    case 'closeBook': controller.reportLayout(message.locator, message.bookProgression); await controller.flush(); return;
  }
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
        capturedPosition = controller.capturePosition?.();
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
    provider,
    provider
  ) : undefined;
  if (coordinator) provider.attachCoordinator(coordinator);
  context.subscriptions.push(
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
