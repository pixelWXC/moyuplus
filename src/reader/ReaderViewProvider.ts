import * as vscode from 'vscode';
import type { ReadingLocator } from '../domain/locators';
import { isReaderToExtensionV2Message, READER_VIEW_ID, type ReaderToExtensionV2Message } from './readerMessages';
import { getReaderWebviewHtml } from './webviewHtml';
import {
  CLOSE_READER_COMMAND_ID, DECREASE_READER_FONT_COMMAND_ID, FOCUS_READER_COMMAND_ID,
  INCREASE_READER_FONT_COMMAND_ID, NEXT_READER_PAGE_COMMAND_ID, PREVIOUS_READER_PAGE_COMMAND_ID,
  SELECT_READER_FILE_COMMAND_ID
} from '../shortcuts/shortcutSettings';

export { READER_VIEW_ID };

export interface ReaderViewController {
  openBook(bookId: string): void | Promise<void>;
  requestSection(sectionId: string): void | Promise<void>;
  requestNextSection(sectionId: string): void | Promise<void>;
  requestPreviousSection(sectionId: string): void | Promise<void>;
  reportLayout(locator: ReadingLocator, bookProgression: number): void;
  flush(): void | Promise<void>;
  dispose(): void | Promise<void>;
}

export class ReaderViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly controller: ReaderViewController
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
    view.webview.html = getReaderWebviewHtml(
      view.webview,
      view.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'readerApp.js')),
      view.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'readerApp.css'))
    );

    view.webview.onDidReceiveMessage((value: unknown) => this.handleMessage(value));
    view.onDidChangeVisibility(() => {
      if (!view.visible) return this.controller.flush();
    });
    view.onDidDispose(() => this.controller.dispose());
  }

  // Kept until Phase 5 rewires shortcut routing to Reader v2 navigation state.
  async requestNextPage(): Promise<boolean> {
    if (!this.view) return false;
    await this.view.webview.postMessage({ type: 'command', command: 'nextPage' });
    return true;
  }
  async requestPreviousPage(): Promise<void> {}

  private async handleMessage(value: unknown): Promise<void> {
    if (!isReaderToExtensionV2Message(value)) return;
    await dispatchReaderMessage(this.controller, value);
  }
}

async function dispatchReaderMessage(controller: ReaderViewController, message: ReaderToExtensionV2Message): Promise<void> {
  switch (message.type) {
    case 'openBook': await controller.openBook(message.bookId); return;
    case 'requestSection': await controller.requestSection(message.sectionId); return;
    case 'requestNextSection': await controller.requestNextSection(message.sectionId); return;
    case 'requestPreviousSection': await controller.requestPreviousSection(message.sectionId); return;
    case 'layoutStable': controller.reportLayout(message.locator, message.bookProgression); return;
  }
}

export function registerReaderView(
  context: vscode.ExtensionContext,
  controllerOrLegacyDependency: ReaderViewController | unknown,
  _legacySessionStore?: unknown
): ReaderViewProvider {
  const controller = isReaderViewController(controllerOrLegacyDependency)
    ? controllerOrLegacyDependency
    : createTransitionController();
  const provider = new ReaderViewProvider(context.extensionUri ?? vscode.Uri.file('.'), controller);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(READER_VIEW_ID, provider),
    vscode.commands.registerCommand(NEXT_READER_PAGE_COMMAND_ID, () => provider.requestNextPage()),
    vscode.commands.registerCommand(PREVIOUS_READER_PAGE_COMMAND_ID, () => provider.requestPreviousPage()),
    vscode.commands.registerCommand(FOCUS_READER_COMMAND_ID, () => vscode.commands.executeCommand(`${READER_VIEW_ID}.focus`)),
    vscode.commands.registerCommand(CLOSE_READER_COMMAND_ID, () => vscode.commands.executeCommand('workbench.action.closeSidebar')),
    vscode.commands.registerCommand(SELECT_READER_FILE_COMMAND_ID, () => undefined),
    vscode.commands.registerCommand(INCREASE_READER_FONT_COMMAND_ID, () => undefined),
    vscode.commands.registerCommand(DECREASE_READER_FONT_COMMAND_ID, () => undefined)
  );
  return provider;
}

function isReaderViewController(value: unknown): value is ReaderViewController {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Record<keyof ReaderViewController, unknown>>;
  const methods: Array<keyof ReaderViewController> = [
    'openBook', 'requestSection', 'requestNextSection', 'requestPreviousSection', 'reportLayout', 'flush', 'dispose'
  ];
  return methods
    .every(key => typeof candidate[key] === 'function');
}

function createTransitionController(): ReaderViewController {
  return {
    openBook() {}, requestSection() {}, requestNextSection() {}, requestPreviousSection() {},
    reportLayout() {}, flush() {}, dispose() {}
  };
}
