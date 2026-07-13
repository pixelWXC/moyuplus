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

export type ReaderExternalCommand = 'nextPage' | 'previousPage' | 'nextChapter' | 'previousChapter' | 'openLibrary' | 'openToc' | 'openSettings';

export { READER_VIEW_ID };

export interface ReaderViewController {
  openBook(bookId: string, requestId?: string): void | Promise<void>;
  requestSection(sectionId: string): void | Promise<void>;
  requestNextSection(sectionId: string): void | Promise<void>;
  requestPreviousSection(sectionId: string): void | Promise<void>;
  reportLayout(locator: ReadingLocator, bookProgression: number): void;
  flush(): void | Promise<void>;
  dispose(): void | Promise<void>;
}

export interface ReaderLibraryBridge {
  snapshot(): PromiseLike<unknown>;
  importBook?(): void | PromiseLike<unknown>;
  removeBook?(bookId: string): void | PromiseLike<unknown>;
  relocateBook?(bookId: string): void | PromiseLike<unknown>;
  startTypingPractice?(bookId: string): void | PromiseLike<unknown>;
  savePreferences?(preferences: unknown): void | PromiseLike<unknown>;
}

export class ReaderViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private canNextPage = false;
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly controller: ReaderViewController,
    private readonly library?: ReaderLibraryBridge
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
    view.webview.onDidReceiveMessage((value: unknown) => this.handleMessage(value));
    view.onDidChangeVisibility(() => {
      if (!view.visible) return this.controller.flush();
      return this.refreshLibrary();
    });
    view.onDidDispose(() => this.controller.dispose());
    view.webview.html = getReaderWebviewHtml(
      view.webview,
      view.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'readerApp.js')),
      view.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'readerApp.css'))
    );
    void this.refreshLibrary();
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
    if (isRecord(value) && value.type === 'libraryReady') { await this.refreshLibrary(); return; }
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
  library?: ReaderLibraryBridge
): ReaderViewProvider {
  const provider = new ReaderViewProvider(context.extensionUri ?? vscode.Uri.file('.'), controller, library);
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
    vscode.commands.registerCommand(OPEN_READER_SETTINGS_COMMAND_ID, () => provider.requestReaderCommand('openSettings'))
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
