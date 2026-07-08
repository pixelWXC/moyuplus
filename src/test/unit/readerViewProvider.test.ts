import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ReaderViewProvider } from '../../reader/ReaderViewProvider';
import { type PageRange } from '../../domain/models';
import { TxtLibraryStore } from '../../storage/txtLibraryStore';
import { WorkspaceSessionStore } from '../../storage/workspaceSessionStore';
import { TxtFileService } from '../../txt/txtFileService';
import { createWebviewView } from '../shims/vscode';

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
