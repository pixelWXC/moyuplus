import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  ROUTE_ENTER_COMMAND_ID,
  ROUTE_TAB_COMMAND_ID,
  SHOW_TYPING_PRACTICE_MENU_COMMAND_ID,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_COMMAND_ID,
  activate
} from '../../extension';
import { IMPORT_BOOK_COMMAND_ID, RELOCATE_BOOK_COMMAND_ID, REMOVE_BOOK_COMMAND_ID } from '../../commands/libraryCommands';
import { createDefaultTypingPracticeSession } from '../../domain/models';
import { READER_VIEW_ID } from '../../reader/readerMessages';
import { TYPING_PRACTICE_SESSION_KEY } from '../../storage/storageKeys';
import {
  CLOSE_READER_COMMAND_ID,
  FOCUS_READER_COMMAND_ID,
  NEXT_READER_PAGE_COMMAND_ID,
  PREVIOUS_READER_PAGE_COMMAND_ID
} from '../../shortcuts/shortcutSettings';
import {
  NEXT_READER_CHAPTER_COMMAND_ID, OPEN_READER_LIBRARY_COMMAND_ID, OPEN_READER_SETTINGS_COMMAND_ID,
  OPEN_READER_TOC_COMMAND_ID, PREVIOUS_READER_CHAPTER_COMMAND_ID
} from '../../shortcuts/shortcutSettings';
import {
  commands,
  createTextEditor,
  createTextDocument,
  createWebviewView,
  languages,
  Position,
  resetVSCodeShim,
  Uri,
  type Disposable,
  window,
  workspace
} from '../shims/vscode';
import { TOGGLE_GIT_LOG_COMMAND_ID } from '../../git/gitLogModeCoordinator';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  constructor(initialValues: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initialValues)) {
      this.values.set(key, value);
    }
  }

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moyuplus-typing-'));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  resetVSCodeShim();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('typing practice registration and VS Code integration', () => {
  it('registers commands, an inline completion provider, and a hidden status bar item on activation', async () => {
    const context = {
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      subscriptions: [] as Disposable[]
    };

    await activate(context);

    expect(commands.registeredCommandIds()).toEqual([
      'moyuplus.smokeTest',
      IMPORT_BOOK_COMMAND_ID,
      REMOVE_BOOK_COMMAND_ID,
      RELOCATE_BOOK_COMMAND_ID,
      NEXT_READER_PAGE_COMMAND_ID,
      PREVIOUS_READER_PAGE_COMMAND_ID,
      FOCUS_READER_COMMAND_ID,
      CLOSE_READER_COMMAND_ID,
      OPEN_READER_LIBRARY_COMMAND_ID,
      PREVIOUS_READER_CHAPTER_COMMAND_ID,
      NEXT_READER_CHAPTER_COMMAND_ID,
      OPEN_READER_TOC_COMMAND_ID,
      OPEN_READER_SETTINGS_COMMAND_ID,
      TOGGLE_GIT_LOG_COMMAND_ID,
      START_TYPING_PRACTICE_COMMAND_ID,
      STOP_TYPING_PRACTICE_COMMAND_ID,
      NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
      RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
      JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
      TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID,
      SHOW_TYPING_PRACTICE_MENU_COMMAND_ID,
      TOGGLE_TYPING_PRACTICE_COMMAND_ID,
      ROUTE_ENTER_COMMAND_ID,
      ROUTE_TAB_COMMAND_ID
    ]);
    expect(languages.registeredInlineCompletionSelectors()).toEqual([{ pattern: '**' }]);
    expect(window.statusBarItems).toHaveLength(1);
    expect(window.statusBarItems[0].visible).toBe(false);
    expect(commands.contextValue('moyuplus.typingPracticeActive')).toBe(false);
  });

  it('shows the real-file safety notice only on first start and toggles practice state', async () => {
    const workspaceDir = await createTempDir();
    const filePath = path.join(workspaceDir, 'safe-practice.txt');
    await writeFile(filePath, 'practice line', 'utf8');
    const context = {
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      subscriptions: [] as Disposable[]
    };
    workspace.workspaceFolders = [{ uri: Uri.file(workspaceDir) }];
    window.openDialogResult = [Uri.file(filePath)];
    window.quickPickResult = { label: 'UTF-8', encoding: 'utf8' };
    await activate(context);
    const imported = await commands.executeRegisteredCommand(IMPORT_BOOK_COMMAND_ID);
    window.quickPickResult = { label: 'safe-practice.txt', fileId: imported.id };

    await commands.executeRegisteredCommand(TOGGLE_TYPING_PRACTICE_COMMAND_ID);

    expect(window.warningMessages).toEqual([
      expect.stringContaining('练习输入会真实写入当前编辑器文件')
    ]);
    expect(window.statusBarItems[0].visible).toBe(true);

    await commands.executeRegisteredCommand(TOGGLE_TYPING_PRACTICE_COMMAND_ID);
    expect(window.statusBarItems[0].visible).toBe(false);

    window.quickPickResult = { label: 'safe-practice.txt', fileId: imported.id };
    await commands.executeRegisteredCommand(TOGGLE_TYPING_PRACTICE_COMMAND_ID);

    expect(window.warningMessages).toHaveLength(1);
    expect(window.statusBarItems[0].visible).toBe(true);
  });

  it('starts practice from an imported TXT, serves ghost text, updates the menu, and stops cleanly', async () => {
    const workspaceDir = await createTempDir();
    const filePath = path.join(workspaceDir, 'picked.txt');
    await writeFile(filePath, 'hello\nsecond', 'utf8');
    const context = {
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      subscriptions: [] as Disposable[]
    };
    workspace.workspaceFolders = [{ uri: Uri.file(workspaceDir) }];
    window.openDialogResult = [Uri.file(filePath)];
    window.quickPickResult = { label: 'UTF-8', encoding: 'utf8' };
    await activate(context);
    const imported = await commands.executeRegisteredCommand(IMPORT_BOOK_COMMAND_ID);

    window.quickPickResult = { label: 'picked.txt', fileId: imported.id };
    await commands.executeRegisteredCommand(START_TYPING_PRACTICE_COMMAND_ID);

    expect(window.statusBarItems[0]).toMatchObject({
      text: 'Typing: picked 1/2',
      command: SHOW_TYPING_PRACTICE_MENU_COMMAND_ID,
      visible: true
    });
    expect(commands.contextValue('moyuplus.typingPracticeActive')).toBe(true);
    await expect(
      languages.provideInlineCompletionItems(createTextDocument(['he']), new Position(0, 2))
    ).resolves.toEqual([{ insertText: 'llo' }]);

    window.quickPickResult = { label: 'Next Line', commandId: NEXT_TYPING_PRACTICE_LINE_COMMAND_ID };
    await commands.executeRegisteredCommand(SHOW_TYPING_PRACTICE_MENU_COMMAND_ID);

    expect(window.statusBarItems[0].text).toBe('Typing: picked 2/2');
    await expect(
      languages.provideInlineCompletionItems(createTextDocument(['']), new Position(0, 0))
    ).resolves.toEqual([{ insertText: 'second' }]);

    window.inputBoxResult = '1';
    await commands.executeRegisteredCommand(JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID);
    expect(window.statusBarItems[0].text).toBe('Typing: picked 1/2');

    await commands.executeRegisteredCommand(NEXT_TYPING_PRACTICE_LINE_COMMAND_ID);
    await commands.executeRegisteredCommand(RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID);
    expect(window.statusBarItems[0].text).toBe('Typing: picked 1/2');

    await commands.executeRegisteredCommand(STOP_TYPING_PRACTICE_COMMAND_ID);

    expect(window.statusBarItems[0].visible).toBe(false);
    expect(commands.contextValue('moyuplus.typingPracticeActive')).toBe(false);
    await expect(
      languages.provideInlineCompletionItems(createTextDocument(['']), new Position(0, 0))
    ).resolves.toBeUndefined();
  });

  it('routes Tab to typing practice completion without advancing the practice line', async () => {
    const workspaceDir = await createTempDir();
    const filePath = path.join(workspaceDir, 'picked.txt');
    await writeFile(filePath, 'hello world', 'utf8');
    const context = {
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      subscriptions: [] as Disposable[]
    };
    workspace.workspaceFolders = [{ uri: Uri.file(workspaceDir) }];
    workspace.configurationValues['moyuplus.typing.tabMode'] = 'completeRest';
    window.openDialogResult = [Uri.file(filePath)];
    window.quickPickResult = { label: 'UTF-8', encoding: 'utf8' };
    await activate(context);
    const imported = await commands.executeRegisteredCommand(IMPORT_BOOK_COMMAND_ID);
    window.quickPickResult = { label: 'picked.txt', fileId: imported.id };
    await commands.executeRegisteredCommand(START_TYPING_PRACTICE_COMMAND_ID);
    window.activeTextEditor = createTextEditor(['hello'], new Position(0, 5));

    await commands.executeRegisteredCommand(ROUTE_TAB_COMMAND_ID);

    expect(window.activeTextEditor.document.lineAt(0).text).toBe('hello world');
    expect(window.statusBarItems[0].text).toBe('Typing: picked 1/1');

    workspace.configurationValues['moyuplus.typing.tabMode'] = 'replaceLine';
    window.activeTextEditor = createTextEditor(['draft'], new Position(0, 2));

    await commands.executeRegisteredCommand(ROUTE_TAB_COMMAND_ID);

    expect(window.activeTextEditor.document.lineAt(0).text).toBe('hello world');
  });

  it('falls back to native Tab when typing practice is not active', async () => {
    const context = {
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      subscriptions: [] as Disposable[]
    };
    await activate(context);
    window.activeTextEditor = createTextEditor([''], new Position(0, 0));

    await commands.executeRegisteredCommand(ROUTE_TAB_COMMAND_ID);

    expect(commands.executedBuiltinCommands()).toEqual([{ commandId: 'tab', args: [] }]);
  });

  it('routes Enter through a real newline, optional practice advance, and optional reader page advance', async () => {
    const workspaceDir = await createTempDir();
    const filePath = path.join(workspaceDir, 'picked.txt');
    await writeFile(filePath, 'first\nsecond', 'utf8');
    const context = {
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      subscriptions: [] as Disposable[]
    };
    workspace.workspaceFolders = [{ uri: Uri.file(workspaceDir) }];
    workspace.configurationValues['moyuplus.enter.insertNewLine'] = true;
    workspace.configurationValues['moyuplus.enter.nextPracticeLine'] = true;
    workspace.configurationValues['moyuplus.enter.nextReaderPage'] = true;
    window.openDialogResult = [Uri.file(filePath)];
    window.quickPickResult = { label: 'UTF-8', encoding: 'utf8' };
    await activate(context);
    const imported = await commands.executeRegisteredCommand(IMPORT_BOOK_COMMAND_ID);
    const readerView = createWebviewView();
    await window.registeredWebviewViewProvider(READER_VIEW_ID)?.resolveWebviewView(readerView);
    await readerView.webview.receiveMessage({ type: 'selectFile', fileId: imported.id });
    await readerView.webview.receiveMessage({ type: 'navigationState', canNextPage: true });
    window.quickPickResult = { label: 'picked.txt', fileId: imported.id };
    await commands.executeRegisteredCommand(START_TYPING_PRACTICE_COMMAND_ID);
    window.activeTextEditor = createTextEditor([''], new Position(0, 0));

    await commands.executeRegisteredCommand(ROUTE_ENTER_COMMAND_ID);

    expect(commands.executedBuiltinCommands()).toEqual([{ commandId: 'type', args: [{ text: '\n' }] }]);
    expect(window.statusBarItems[0].text).toBe('Typing: picked 2/2');
    expect(readerView.webview.postedMessages.at(-1)).toEqual({ type: 'command', command: 'nextPage' });
  });

  it('toggles line edge trimming from the typing practice menu', async () => {
    const workspaceDir = await createTempDir();
    const filePath = path.join(workspaceDir, 'picked.txt');
    await writeFile(filePath, '  hello  ', 'utf8');
    const context = {
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      subscriptions: [] as Disposable[]
    };
    workspace.workspaceFolders = [{ uri: Uri.file(workspaceDir) }];
    window.openDialogResult = [Uri.file(filePath)];
    window.quickPickResult = { label: 'UTF-8', encoding: 'utf8' };
    await activate(context);
    const imported = await commands.executeRegisteredCommand(IMPORT_BOOK_COMMAND_ID);

    window.quickPickResult = { label: 'picked.txt', fileId: imported.id };
    await commands.executeRegisteredCommand(START_TYPING_PRACTICE_COMMAND_ID);

    await expect(
      languages.provideInlineCompletionItems(createTextDocument(['']), new Position(0, 0))
    ).resolves.toEqual([{ insertText: '  hello  ' }]);

    window.quickPickResult = {
      label: 'Toggle Trim Line Edges',
      commandId: TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID
    };
    await commands.executeRegisteredCommand(SHOW_TYPING_PRACTICE_MENU_COMMAND_ID);

    await expect(
      languages.provideInlineCompletionItems(createTextDocument(['']), new Position(0, 0))
    ).resolves.toEqual([{ insertText: 'hello' }]);

    await commands.executeRegisteredCommand(TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID);

    await expect(
      languages.provideInlineCompletionItems(createTextDocument(['']), new Position(0, 0))
    ).resolves.toEqual([{ insertText: '  hello  ' }]);
  });

  it('hides typing UI instead of throwing when a persisted practice file is no longer imported', async () => {
    const context = {
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento({
        [TYPING_PRACTICE_SESSION_KEY]: {
          ...createDefaultTypingPracticeSession(),
          active: true,
          fileId: 'missing-file',
          lineIndex: 0,
          totalLines: 1
        }
      }),
      subscriptions: [] as Disposable[]
    };

    await activate(context);

    await expect(
      languages.provideInlineCompletionItems(createTextDocument(['']), new Position(0, 0))
    ).resolves.toBeUndefined();
    expect(window.statusBarItems[0].visible).toBe(false);
  });
});
