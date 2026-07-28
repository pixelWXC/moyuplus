import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  activate
} from '../../extension';
import {
  LEGACY_TYPING_MIGRATION_KEY,
  LEGACY_TYPING_RESUME_HINT_KEY
} from '../../typing/migration';
import {
  BOOK_LIBRARY_KEY,
  TYPING_PRACTICE_SESSION_KEY,
  TXT_LIBRARY_KEY
} from '../../storage/storageKeys';
import {
  commands,
  createWebviewView,
  languages,
  resetVSCodeShim,
  type Disposable,
  Uri,
  window
} from '../shims/vscode';
import {
  TYPING_VIEW_ID,
  TYPING_VIEW_PROTOCOL_VERSION
} from '../../typing/adapters/view';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  constructor(initial: Record<string, unknown> = {}) {
    Object.entries(initial).forEach(([key, value]) => {
      this.values.set(key, value);
    });
  }

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) this.values.delete(key);
    else this.values.set(key, value);
  }
}

const tempDirs: string[] = [];

beforeEach(() => {
  resetVSCodeShim();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(
    dir => rm(dir, { recursive: true, force: true })
  ));
});

describe('typing architecture cutover', () => {
  it('migrates the old session and activates only the new typing stack', async () => {
    const storage = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-cutover-'));
    tempDirs.push(storage);
    const sourcePath = path.join(storage, 'legacy.txt');
    await writeFile(sourcePath, '第一行\n第二行', 'utf8');
    const uri = Uri.file(sourcePath).toString();
    const globalState = new MemoryMemento({
      [TXT_LIBRARY_KEY]: [{
        id: 'legacy-1',
        name: '旧练习.txt',
        uri,
        encoding: 'utf8',
        source: 'external',
        createdAt: 1,
        updatedAt: 2
      }],
      [BOOK_LIBRARY_KEY]: [{
        schemaVersion: 2,
        id: 'book-2',
        uri,
        source: 'external',
        title: '旧练习',
        authors: [],
        capabilities: { readable: true, typing: true, toc: true },
        format: 'txt',
        formatData: { encoding: 'utf8' },
        createdAt: 1,
        updatedAt: 2
      }]
    });
    const workspaceState = new MemoryMemento({
      [TYPING_PRACTICE_SESSION_KEY]: {
        active: true,
        fileId: 'legacy-1',
        lineIndex: 4,
        totalLines: 9,
        skipEmptyLines: true,
        trimLeadingSpaces: true,
        trimTrailingSpaces: true,
        ignoreAllSpaces: false
      }
    });
    const context = {
      globalState,
      workspaceState,
      globalStorageUri: Uri.file(storage),
      storageUri: Uri.file(path.join(storage, 'workspace')),
      extensionUri: Uri.file(process.cwd()),
      subscriptions: [] as Disposable[]
    };

    await activate(context);

    expect(workspaceState.get(TYPING_PRACTICE_SESSION_KEY)).toBeUndefined();
    expect(workspaceState.get(LEGACY_TYPING_MIGRATION_KEY)).toEqual(
      expect.objectContaining({ outcome: 'hintCreated' })
    );
    expect(workspaceState.get(LEGACY_TYPING_RESUME_HINT_KEY)).toEqual(
      expect.objectContaining({
        source: expect.objectContaining({ bookId: 'book-2' }),
        physicalLineIndex: 4
      })
    );
    expect(languages.registeredInlineCompletionSelectors()).toEqual([]);
    expect(window.statusBarItems).toEqual([]);
    expect(commands.contextValue('moyuplus.typingPracticeActive'))
      .toBeUndefined();
    expect(commands.registeredCommandIds()).toEqual(
      expect.arrayContaining([
        START_TYPING_PRACTICE_COMMAND_ID,
        STOP_TYPING_PRACTICE_COMMAND_ID
      ])
    );

    const view = createWebviewView();
    window.registeredWebviewViewProvider(TYPING_VIEW_ID)
      ?.resolveWebviewView(view);
    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'typingReady'
    });
    expect(view.webview.postedMessages.at(-1)).toEqual(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          legacyResumeHint: expect.objectContaining({
            sourceTitle: '旧练习.txt',
            physicalLineNumber: 5
          })
        })
      })
    );

    await view.webview.receiveMessage({
      protocolVersion: TYPING_VIEW_PROTOCOL_VERSION,
      instanceId: 'typing-view-1',
      type: 'resumeLegacyPractice',
      requestId: 'resume-legacy-1',
      clientRevision: 1
    });

    expect(workspaceState.get(LEGACY_TYPING_RESUME_HINT_KEY)).toBeUndefined();
    expect(view.webview.postedMessages.at(-1)).toEqual(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          activePage: 'setup',
          content: expect.objectContaining({
            kind: 'setup',
            plan: expect.objectContaining({
              textPolicy: expect.objectContaining({
                whitespace: { mode: 'trimLineEdges' }
              })
            })
          })
        })
      })
    );
  });

  it('keeps extension and shortcut composition free of the old controller', async () => {
    const [extensionSource, shortcutSource] = await Promise.all([
      readFile(path.resolve(__dirname, '../../extension.ts'), 'utf8'),
      readFile(path.resolve(__dirname, '../../commands/shortcutRouter.ts'), 'utf8')
    ]);

    expect(extensionSource).not.toContain('TypingPracticeController');
    expect(extensionSource).not.toContain('registerTypingPractice');
    expect(extensionSource).not.toContain('TypingSourceCatalog');
    expect(shortcutSource).not.toContain('TypingPracticeController');
    expect(shortcutSource).not.toContain('getTabCompletion');
  });
});
