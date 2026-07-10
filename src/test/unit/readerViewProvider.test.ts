import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReaderViewProvider, registerReaderView } from '../../reader/ReaderViewProvider';
import { type PageRange } from '../../domain/models';
import { TxtLibraryStore } from '../../storage/txtLibraryStore';
import { WorkspaceSessionStore } from '../../storage/workspaceSessionStore';
import { TxtFileService } from '../../txt/txtFileService';
import { commands, createWebviewView, resetVSCodeShim, type Disposable, workspace } from '../shims/vscode';
import {
  CLOSE_READER_COMMAND_ID,
  DECREASE_READER_FONT_COMMAND_ID,
  FOCUS_READER_COMMAND_ID,
  INCREASE_READER_FONT_COMMAND_ID,
  NEXT_READER_PAGE_COMMAND_ID,
  PREVIOUS_READER_PAGE_COMMAND_ID,
  SELECT_READER_FILE_COMMAND_ID
} from '../../shortcuts/shortcutSettings';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-reader-'));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  resetVSCodeShim();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('ReaderViewProvider', () => {
  it('bootstraps the reader webview with imported files and restored session state', async () => {
    const { provider, txtFileService, sessionStore } = createProviderHarness();
    const dir = await createTempDir();
    const filePath = path.join(dir, 'book.txt');
    await writeFile(filePath, 'first page\nsecond page', 'utf8');
    const imported = await txtFileService.importTxtFile({
      uri: pathToFileURL(filePath).toString(),
      encoding: 'utf8',
      workspaceFolderUris: []
    });
    await sessionStore.saveReaderSession({
      active: true,
      fileId: imported.id,
      offset: 6,
      approximatePercent: 0.25,
      fontSize: 18,
      lineHeight: 1.6,
      pageHistory: [{ startOffset: 0, endOffset: 6 }]
    });
    const view = createWebviewView();

    await provider.resolveWebviewView(view);
    await view.webview.receiveMessage({ type: 'ready' });
    await view.webview.receiveMessage({ type: 'ready' });

    expect(view.webview.options).toEqual({ enableScripts: true });
    expect(view.webview.html).toContain('MoyuPlus Reader');
    expect(view.webview.postedMessages.at(-1)).toMatchObject({
      type: 'state',
      payload: {
        files: [{ id: imported.id, name: 'book.txt' }],
        activeFile: { id: imported.id, name: 'book.txt' },
        session: {
          active: true,
          fileId: imported.id,
          offset: 6,
          fontSize: 18
        },
        text: 'first page\nsecond page'
      }
    });
  });

  it('selects an imported TXT file and persists it as the active reader session', async () => {
    const { provider, txtFileService, sessionStore } = createProviderHarness();
    const dir = await createTempDir();
    const filePath = path.join(dir, 'selected.txt');
    await writeFile(filePath, 'selected content', 'utf8');
    const imported = await txtFileService.importTxtFile({
      uri: pathToFileURL(filePath).toString(),
      encoding: 'utf8',
      workspaceFolderUris: []
    });
    const view = createWebviewView();
    await provider.resolveWebviewView(view);

    await view.webview.receiveMessage({ type: 'selectFile', fileId: imported.id });

    expect(sessionStore.getReaderSession()).toMatchObject({
      active: true,
      fileId: imported.id,
      offset: 0,
      pageHistory: []
    });
    expect(view.webview.postedMessages.at(-1)).toMatchObject({
      type: 'state',
      payload: {
        activeFile: { id: imported.id, name: 'selected.txt' },
        text: 'selected content'
      }
    });
  });

  it('saves page ranges, moves forward, and restores the previous page from history', async () => {
    const { provider, txtFileService, sessionStore } = createProviderHarness();
    const dir = await createTempDir();
    const filePath = path.join(dir, 'pages.txt');
    await writeFile(filePath, '0123456789', 'utf8');
    const imported = await txtFileService.importTxtFile({
      uri: pathToFileURL(filePath).toString(),
      encoding: 'utf8',
      workspaceFolderUris: []
    });
    await sessionStore.saveReaderSession({
      active: true,
      fileId: imported.id,
      offset: 0,
      approximatePercent: 0,
      fontSize: 16,
      lineHeight: 1.6,
      pageHistory: []
    });
    const view = createWebviewView();
    await provider.resolveWebviewView(view);
    const firstPage: PageRange = { startOffset: 0, endOffset: 4 };

    await view.webview.receiveMessage({
      type: 'nextPage',
      currentRange: firstPage,
      viewportSnapshot: { width: 320, height: 480, fontSize: 16, lineHeight: 1.6 }
    });

    expect(sessionStore.getReaderSession()).toMatchObject({
      active: true,
      fileId: imported.id,
      offset: 4,
      approximatePercent: 0.4,
      pageHistory: [firstPage],
      viewportSnapshot: { width: 320, height: 480, fontSize: 16, lineHeight: 1.6 }
    });

    await view.webview.receiveMessage({ type: 'previousPage' });

    expect(sessionStore.getReaderSession()).toMatchObject({
      active: true,
      fileId: imported.id,
      offset: 0,
      pageHistory: []
    });
  });

  it('persists reader font size changes without changing the selected file', async () => {
    const { provider, txtFileService, sessionStore } = createProviderHarness();
    const dir = await createTempDir();
    const filePath = path.join(dir, 'font.txt');
    await writeFile(filePath, 'font content', 'utf8');
    const imported = await txtFileService.importTxtFile({
      uri: pathToFileURL(filePath).toString(),
      encoding: 'utf8',
      workspaceFolderUris: []
    });
    await sessionStore.saveReaderSession({
      active: true,
      fileId: imported.id,
      offset: 5,
      approximatePercent: 0.5,
      fontSize: 16,
      lineHeight: 1.6,
      pageHistory: [{ startOffset: 0, endOffset: 5 }]
    });
    const view = createWebviewView();
    await provider.resolveWebviewView(view);

    await view.webview.receiveMessage({ type: 'setFontSize', fontSize: 20 });

    expect(sessionStore.getReaderSession()).toMatchObject({
      active: true,
      fileId: imported.id,
      offset: 5,
      fontSize: 20,
      pageHistory: []
    });
  });

  it('opens MoyuPlus shortcut settings from the reader webview', async () => {
    const { provider } = createProviderHarness();
    const view = createWebviewView();
    await provider.resolveWebviewView(view);

    await view.webview.receiveMessage({ type: 'openShortcutSettings' });

    expect(commands.executedBuiltinCommands()).toEqual([
      { commandId: 'workbench.action.openSettings', args: ['moyuplus shortcuts'] }
    ]);
  });

  it('publishes shortcut status and updates guarded shortcut enablement', async () => {
    const { provider } = createProviderHarness();
    workspace.configurationValues['moyuplus.shortcuts.enableEnterRouter'] = false;
    workspace.configurationValues['moyuplus.shortcuts.enableTabRouter'] = true;
    const view = createWebviewView();
    await provider.resolveWebviewView(view);

    expect(view.webview.postedMessages.at(-1)).toMatchObject({
      type: 'state',
      payload: {
        shortcuts: expect.arrayContaining([
          expect.objectContaining({ commandId: 'moyuplus.routeEnter', enabled: false }),
          expect.objectContaining({ commandId: 'moyuplus.routeTab', enabled: true })
        ])
      }
    });

    await view.webview.receiveMessage({ type: 'setShortcutEnabled', shortcut: 'enter', enabled: true });

    expect(workspace.configurationValues['moyuplus.shortcuts.enableEnterRouter']).toBe(true);
    expect(view.webview.postedMessages.at(-1)).toMatchObject({
      type: 'state',
      payload: {
        shortcuts: expect.arrayContaining([
          expect.objectContaining({ commandId: 'moyuplus.routeEnter', enabled: true })
        ])
      }
    });
  });

  it('opens the native Keyboard Shortcuts editor for one MoyuPlus command', async () => {
    const { provider } = createProviderHarness();
    const view = createWebviewView();
    await provider.resolveWebviewView(view);

    await view.webview.receiveMessage({
      type: 'openShortcutEditor',
      commandId: NEXT_READER_PAGE_COMMAND_ID
    });

    expect(commands.executedBuiltinCommands()).toEqual([
      {
        commandId: 'workbench.action.openGlobalKeybindings',
        args: [`@command:${NEXT_READER_PAGE_COMMAND_ID}`]
      }
    ]);
  });

  it('registers executable commands for every reader action shown in shortcut settings', async () => {
    const txtLibraryStore = new TxtLibraryStore(new MemoryMemento());
    const txtFileService = new TxtFileService(txtLibraryStore);
    const sessionStore = new WorkspaceSessionStore(new MemoryMemento());
    const context = { subscriptions: [] as Disposable[] };

    registerReaderView(context as never, txtFileService, sessionStore);

    expect(commands.registeredCommandIds()).toEqual(
      expect.arrayContaining([
        NEXT_READER_PAGE_COMMAND_ID,
        PREVIOUS_READER_PAGE_COMMAND_ID,
        FOCUS_READER_COMMAND_ID,
        CLOSE_READER_COMMAND_ID,
        SELECT_READER_FILE_COMMAND_ID,
        INCREASE_READER_FONT_COMMAND_ID,
        DECREASE_READER_FONT_COMMAND_ID
      ])
    );

    await commands.executeRegisteredCommand(FOCUS_READER_COMMAND_ID);
    await commands.executeRegisteredCommand(CLOSE_READER_COMMAND_ID);
    expect(commands.executedBuiltinCommands()).toEqual([
      { commandId: 'moyuplus.readerView.focus', args: [] },
      { commandId: 'workbench.action.closeSidebar', args: [] }
    ]);
  });

  it('labels a missing active file and can remove its stale import record', async () => {
    const { provider, txtFileService, sessionStore } = createProviderHarness();
    const dir = await createTempDir();
    const filePath = path.join(dir, 'gone.txt');
    await writeFile(filePath, 'temporary', 'utf8');
    const imported = await txtFileService.importTxtFile({
      uri: pathToFileURL(filePath).toString(),
      encoding: 'utf8',
      workspaceFolderUris: []
    });
    await sessionStore.saveReaderSession({
      active: true,
      fileId: imported.id,
      offset: 0,
      approximatePercent: 0,
      fontSize: 16,
      lineHeight: 1.6,
      pageHistory: []
    });
    await rm(filePath);
    const view = createWebviewView();

    await provider.resolveWebviewView(view);
    await view.webview.receiveMessage({ type: 'ready' });

    expect(view.webview.postedMessages.at(-1)).toMatchObject({
      type: 'state',
      payload: { error: { kind: 'missing', message: expect.stringContaining('gone.txt') } }
    });

    await view.webview.receiveMessage({ type: 'removeActiveFile' });

    expect(txtFileService.listImportedFiles()).toEqual([]);
    expect(sessionStore.getReaderSession()).toMatchObject({ active: false });
    expect(sessionStore.getReaderSession()).not.toHaveProperty('fileId');
    expect(view.webview.postedMessages.at(-1)).toMatchObject({
      type: 'state',
      payload: { files: [], activeFile: undefined }
    });
  });

  it('labels decode failures and switches the active file encoding', async () => {
    const { provider, txtFileService, sessionStore } = createProviderHarness();
    const dir = await createTempDir();
    const filePath = path.join(dir, 'gbk.txt');
    const iconv = await import('iconv-lite');
    await writeFile(filePath, iconv.default.encode('中文内容', 'gbk'));
    const imported = await txtFileService.importTxtFile({
      uri: pathToFileURL(filePath).toString(),
      encoding: 'utf8',
      workspaceFolderUris: []
    });
    await sessionStore.saveReaderSession({
      active: true,
      fileId: imported.id,
      offset: 0,
      approximatePercent: 0,
      fontSize: 16,
      lineHeight: 1.6,
      pageHistory: []
    });
    const view = createWebviewView();

    await provider.resolveWebviewView(view);
    await view.webview.receiveMessage({ type: 'ready' });

    expect(view.webview.postedMessages.at(-1)).toMatchObject({
      type: 'state',
      payload: { error: { kind: 'decode', message: expect.stringContaining('UTF-8') } }
    });

    await view.webview.receiveMessage({ type: 'switchActiveFileEncoding' });

    expect(txtFileService.listImportedFiles()[0].encoding).toBe('gbk');
    const recoveredState = view.webview.postedMessages.at(-1);
    expect(recoveredState).toMatchObject({
      type: 'state',
      payload: { text: '中文内容' }
    });
    expect(recoveredState).not.toHaveProperty('payload.error');
  });

  it('runs the import command from the reader empty state and refreshes afterward', async () => {
    const { provider } = createProviderHarness();
    const view = createWebviewView();
    await provider.resolveWebviewView(view);

    await view.webview.receiveMessage({ type: 'importTxt' });

    expect(commands.executedBuiltinCommands()).toEqual([
      { commandId: 'moyuplus.importTxt', args: [] }
    ]);
    expect(view.webview.postedMessages.at(-1)).toMatchObject({
      type: 'state',
      payload: { files: [] }
    });
  });
});

function createProviderHarness(): {
  provider: ReaderViewProvider;
  txtFileService: TxtFileService;
  sessionStore: WorkspaceSessionStore;
} {
  const txtLibraryStore = new TxtLibraryStore(new MemoryMemento());
  const txtFileService = new TxtFileService(txtLibraryStore);
  const sessionStore = new WorkspaceSessionStore(new MemoryMemento());

  return {
    provider: new ReaderViewProvider(txtFileService, sessionStore),
    txtFileService,
    sessionStore
  };
}
