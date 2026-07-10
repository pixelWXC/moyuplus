import * as vscode from 'vscode';
import {
  createDefaultReaderSession,
  type PageRange,
  type ReaderSession,
  type ReaderViewportSnapshot
} from '../domain/models';
import { WorkspaceSessionStore } from '../storage/workspaceSessionStore';
import {
  TxtDecodeError,
  TxtFileMissingError,
  TxtFileNotImportedError,
  TxtFileService
} from '../txt/txtFileService';
import {
  READER_VIEW_ID,
  type ReaderErrorState,
  type ExtensionToReaderMessage,
  type ReaderViewToExtensionMessage
} from './readerMessages';
import { getReaderWebviewHtml } from './webviewHtml';
import {
  CLOSE_READER_COMMAND_ID,
  DECREASE_READER_FONT_COMMAND_ID,
  FOCUS_READER_COMMAND_ID,
  INCREASE_READER_FONT_COMMAND_ID,
  NEXT_READER_PAGE_COMMAND_ID,
  PREVIOUS_READER_PAGE_COMMAND_ID,
  SELECT_READER_FILE_COMMAND_ID,
  createShortcutSettingsState,
  type ShortcutEnablement
} from '../shortcuts/shortcutSettings';

const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 32;
const MAX_PAGE_HISTORY = 100;

export { READER_VIEW_ID };

export class ReaderViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly txtFileService: TxtFileService,
    private readonly sessionStore: WorkspaceSessionStore
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getReaderWebviewHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      return this.handleMessage(message);
    });
    void this.postState();
  }

  async refresh(): Promise<void> {
    await this.postState();
  }

  async requestNextPage(): Promise<boolean> {
    if (!this.view) {
      return false;
    }

    await this.postMessage({ type: 'command', command: 'nextPage' });
    return true;
  }

  async requestPreviousPage(): Promise<void> {
    await this.goToPreviousPage();
  }

  async adjustFontSize(delta: number): Promise<void> {
    const session = this.sessionStore.getReaderSession();
    await this.setFontSize(session.fontSize + delta);
  }

  async pickReaderFile(): Promise<void> {
    const files = this.txtFileService.listImportedFiles();
    if (files.length === 0) {
      await vscode.window.showInformationMessage('No imported TXT files. Import a TXT first.');
      return;
    }

    const selected = await vscode.window.showQuickPick(
      files.map((file) => ({
        label: file.name,
        description: file.source,
        detail: file.uri,
        fileId: file.id
      })),
      { placeHolder: 'Select TXT for MoyuPlus Reader' }
    );
    if (selected) {
      await this.selectFile(selected.fileId);
    }
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isReaderViewToExtensionMessage(message)) {
      await this.postError('Reader received an unsupported message.');
      return;
    }

    try {
      switch (message.type) {
        case 'ready':
          await this.postState();
          return;
        case 'selectFile':
          await this.selectFile(message.fileId);
          return;
        case 'pageRendered':
          await this.savePageRendered(message.range, message.viewportSnapshot);
          return;
        case 'nextPage':
          await this.goToNextPage(message.currentRange, message.viewportSnapshot);
          return;
        case 'previousPage':
          await this.goToPreviousPage();
          return;
        case 'setFontSize':
          await this.setFontSize(message.fontSize);
          return;
        case 'openShortcutSettings':
          await vscode.commands.executeCommand('workbench.action.openSettings', 'moyuplus shortcuts');
          return;
        case 'openShortcutEditor':
          await vscode.commands.executeCommand(
            'workbench.action.openGlobalKeybindings',
            `@command:${message.commandId}`
          );
          return;
        case 'setShortcutEnabled':
          await this.setShortcutEnabled(message.shortcut, message.enabled);
          return;
        case 'importTxt':
          await vscode.commands.executeCommand('moyuplus.importTxt');
          await this.postState();
          return;
        case 'removeActiveFile':
          await this.removeActiveFile();
          return;
        case 'switchActiveFileEncoding':
          await this.switchActiveFileEncoding();
          return;
      }
    } catch (error) {
      await this.postError(toUserFacingErrorMessage(error));
      await this.postState(toReaderErrorState(error));
    }
  }

  private async selectFile(fileId: string): Promise<void> {
    const file = this.txtFileService.listImportedFiles().find((candidate) => candidate.id === fileId);
    if (!file) {
      throw new TxtFileNotImportedError(fileId);
    }

    await this.txtFileService.readFullText(fileId);
    const currentSession = this.sessionStore.getReaderSession();
    const nextSession: ReaderSession = {
      ...createDefaultReaderSession(),
      active: true,
      fileId,
      fontSize: currentSession.fontSize,
      lineHeight: currentSession.lineHeight
    };
    await this.sessionStore.saveReaderSession(nextSession);
    await this.postState();
  }

  private async savePageRendered(range: PageRange, viewportSnapshot?: ReaderViewportSnapshot): Promise<void> {
    const session = this.sessionStore.getReaderSession();
    if (!session.fileId) {
      await this.postState();
      return;
    }

    const text = await this.txtFileService.readFullText(session.fileId);
    const normalizedRange = normalizePageRange(range, text.length);
    await this.sessionStore.saveReaderSession({
      ...session,
      active: true,
      offset: normalizedRange.startOffset,
      approximatePercent: calculateApproximatePercent(normalizedRange.startOffset, text.length),
      ...(viewportSnapshot ? { viewportSnapshot } : {})
    });
    await this.postState();
  }

  private async goToNextPage(currentRange: PageRange, viewportSnapshot?: ReaderViewportSnapshot): Promise<void> {
    const session = this.sessionStore.getReaderSession();
    if (!session.fileId) {
      await this.postState();
      return;
    }

    const text = await this.txtFileService.readFullText(session.fileId);
    const normalizedRange = normalizePageRange(currentRange, text.length);
    const nextOffset = normalizedRange.endOffset;
    await this.sessionStore.saveReaderSession({
      ...session,
      active: true,
      offset: nextOffset,
      approximatePercent: calculateApproximatePercent(nextOffset, text.length),
      pageHistory: [...session.pageHistory, normalizedRange].slice(-MAX_PAGE_HISTORY),
      ...(viewportSnapshot ? { viewportSnapshot } : {})
    });
    await this.postState();
  }

  private async goToPreviousPage(): Promise<void> {
    const session = this.sessionStore.getReaderSession();
    if (!session.fileId || session.pageHistory.length === 0) {
      await this.postState();
      return;
    }

    const text = await this.txtFileService.readFullText(session.fileId);
    const previousRange = session.pageHistory[session.pageHistory.length - 1];
    const pageHistory = session.pageHistory.slice(0, -1);
    const offset = Math.min(previousRange.startOffset, text.length);
    await this.sessionStore.saveReaderSession({
      ...session,
      active: true,
      offset,
      approximatePercent: calculateApproximatePercent(offset, text.length),
      pageHistory
    });
    await this.postState();
  }

  private async setFontSize(fontSize: number): Promise<void> {
    const session = this.sessionStore.getReaderSession();
    await this.sessionStore.saveReaderSession({
      ...session,
      fontSize: clamp(fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE),
      pageHistory: []
    });
    await this.postState();
  }

  private async setShortcutEnabled(shortcut: ShortcutEnablement, enabled: boolean): Promise<void> {
    const key = shortcut === 'enter' ? 'enableEnterRouter' : 'enableTabRouter';
    await vscode.workspace
      .getConfiguration('moyuplus.shortcuts')
      .update(key, enabled, vscode.ConfigurationTarget.Global);
    await this.postState();
  }

  private async removeActiveFile(): Promise<void> {
    const session = this.sessionStore.getReaderSession();
    if (session.fileId) {
      await this.txtFileService.removeImportedFile(session.fileId);
    }
    await this.sessionStore.saveReaderSession({
      ...createDefaultReaderSession(),
      fontSize: session.fontSize,
      lineHeight: session.lineHeight
    });
    await this.postState();
  }

  private async switchActiveFileEncoding(): Promise<void> {
    const session = this.sessionStore.getReaderSession();
    if (!session.fileId) {
      await this.postState();
      return;
    }

    const file = this.txtFileService.listImportedFiles().find((candidate) => candidate.id === session.fileId);
    if (!file) {
      throw new TxtFileNotImportedError(session.fileId);
    }
    await this.txtFileService.updateImportedFileEncoding(file.id, file.encoding === 'utf8' ? 'gbk' : 'utf8');
    await this.postState();
  }

  private async postState(error?: ReaderErrorState): Promise<void> {
    const view = this.view;
    if (!view) {
      return;
    }

    const files = this.txtFileService.listImportedFiles();
    const session = this.sessionStore.getReaderSession();
    const activeFile = session.fileId ? files.find((file) => file.id === session.fileId) : undefined;
    let text: string | undefined;
    let stateError = error;

    if (activeFile) {
      try {
        text = await this.txtFileService.readFullText(activeFile.id);
      } catch (readError) {
        stateError = toReaderErrorState(readError);
      }
    }

    await this.postMessage({
      type: 'state',
      payload: {
        files,
        session,
        activeFile,
        text,
        shortcuts: readShortcutSettingsState(),
        ...(stateError ? { error: stateError } : {})
      }
    });
  }

  private async postError(message: string): Promise<void> {
    await this.postMessage({ type: 'error', message });
  }

  private async postMessage(message: ExtensionToReaderMessage): Promise<void> {
    await this.view?.webview.postMessage(message);
  }
}

export function registerReaderView(
  context: vscode.ExtensionContext,
  txtFileService: TxtFileService,
  sessionStore: WorkspaceSessionStore
): ReaderViewProvider {
  const provider = new ReaderViewProvider(txtFileService, sessionStore);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(READER_VIEW_ID, provider),
    vscode.commands.registerCommand(NEXT_READER_PAGE_COMMAND_ID, async () => provider.requestNextPage()),
    vscode.commands.registerCommand(PREVIOUS_READER_PAGE_COMMAND_ID, async () => provider.requestPreviousPage()),
    vscode.commands.registerCommand(FOCUS_READER_COMMAND_ID, async () =>
      vscode.commands.executeCommand(`${READER_VIEW_ID}.focus`)
    ),
    vscode.commands.registerCommand(CLOSE_READER_COMMAND_ID, async () =>
      vscode.commands.executeCommand('workbench.action.closeSidebar')
    ),
    vscode.commands.registerCommand(SELECT_READER_FILE_COMMAND_ID, async () => provider.pickReaderFile()),
    vscode.commands.registerCommand(INCREASE_READER_FONT_COMMAND_ID, async () => provider.adjustFontSize(1)),
    vscode.commands.registerCommand(DECREASE_READER_FONT_COMMAND_ID, async () => provider.adjustFontSize(-1))
  );
  return provider;
}

function readShortcutSettingsState() {
  const configuration = vscode.workspace.getConfiguration('moyuplus.shortcuts');
  return createShortcutSettingsState({
    enableEnterRouter: configuration.get<boolean>('enableEnterRouter', false),
    enableTabRouter: configuration.get<boolean>('enableTabRouter', false)
  });
}

function normalizePageRange(range: PageRange, textLength: number): PageRange {
  const startOffset = clamp(Math.trunc(range.startOffset), 0, textLength);
  const endOffset = clamp(Math.trunc(range.endOffset), startOffset, textLength);

  return { startOffset, endOffset };
}

function calculateApproximatePercent(offset: number, textLength: number): number {
  if (textLength <= 0) {
    return 0;
  }

  return clamp(offset / textLength, 0, 1);
}

function isReaderViewToExtensionMessage(value: unknown): value is ReaderViewToExtensionMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'ready':
    case 'previousPage':
      return true;
    case 'selectFile':
      return typeof value.fileId === 'string' && value.fileId.length > 0;
    case 'pageRendered':
      return isPageRange(value.range) && isOptionalViewportSnapshot(value.viewportSnapshot);
    case 'nextPage':
      return isPageRange(value.currentRange) && isOptionalViewportSnapshot(value.viewportSnapshot);
    case 'setFontSize':
      return typeof value.fontSize === 'number' && Number.isFinite(value.fontSize);
    case 'openShortcutSettings':
      return true;
    case 'openShortcutEditor':
      return typeof value.commandId === 'string' && value.commandId.startsWith('moyuplus.');
    case 'setShortcutEnabled':
      return (value.shortcut === 'enter' || value.shortcut === 'tab') && typeof value.enabled === 'boolean';
    case 'importTxt':
    case 'removeActiveFile':
    case 'switchActiveFileEncoding':
      return true;
    default:
      return false;
  }
}

function isPageRange(value: unknown): value is PageRange {
  return isRecord(value) && isNonNegativeFiniteNumber(value.startOffset) && isNonNegativeFiniteNumber(value.endOffset);
}

function isOptionalViewportSnapshot(value: unknown): value is ReaderViewportSnapshot | undefined {
  if (value === undefined) {
    return true;
  }

  return (
    isRecord(value) &&
    isPositiveFiniteNumber(value.width) &&
    isPositiveFiniteNumber(value.height) &&
    isPositiveFiniteNumber(value.fontSize) &&
    isPositiveFiniteNumber(value.lineHeight)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toUserFacingErrorMessage(error: unknown): string {
  if (error instanceof TxtDecodeError || error instanceof TxtFileMissingError || error instanceof TxtFileNotImportedError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Reader operation failed.';
}

function toReaderErrorState(error: unknown): ReaderErrorState {
  if (error instanceof TxtFileMissingError) {
    return { kind: 'missing', message: error.message };
  }
  if (error instanceof TxtDecodeError) {
    return { kind: 'decode', message: error.message };
  }
  if (error instanceof TxtFileNotImportedError) {
    return { kind: 'notImported', message: error.message };
  }

  return { kind: 'generic', message: toUserFacingErrorMessage(error) };
}
