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
  type ExtensionToReaderMessage,
  type ReaderViewToExtensionMessage
} from './readerMessages';
import { getReaderWebviewHtml } from './webviewHtml';

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
      }
    } catch (error) {
      await this.postError(toUserFacingErrorMessage(error));
      await this.postState(toUserFacingErrorMessage(error));
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

  private async postState(error?: string): Promise<void> {
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
        stateError = toUserFacingErrorMessage(readError);
      }
    }

    await this.postMessage({
      type: 'state',
      payload: {
        files,
        session,
        activeFile,
        text,
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
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(READER_VIEW_ID, provider));
  return provider;
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
