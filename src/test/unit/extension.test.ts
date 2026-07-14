import { beforeEach, describe, expect, it } from 'vitest';
import {
  activate,
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  ROUTE_ENTER_COMMAND_ID,
  ROUTE_TAB_COMMAND_ID,
  SHOW_TYPING_PRACTICE_MENU_COMMAND_ID,
  SMOKE_COMMAND_ID,
  SMOKE_MESSAGE,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID
} from '../../extension';
import { IMPORT_BOOK_COMMAND_ID, RELOCATE_BOOK_COMMAND_ID, REMOVE_BOOK_COMMAND_ID } from '../../commands/libraryCommands';
import { READER_VIEW_ID } from '../../reader/readerMessages';
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
import { commands, languages, resetVSCodeShim, type Disposable, window } from '../shims/vscode';
import { BOOK_LIBRARY_KEY, READER_V2_MIGRATION_KEY, TXT_LIBRARY_KEY } from '../../storage/storageKeys';
import { TOGGLE_GIT_LOG_COMMAND_ID } from '../../git/gitLogModeCoordinator';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  constructor(initial: Record<string, unknown> = {}) {
    Object.entries(initial).forEach(([key, value]) => this.values.set(key, value));
  }

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

describe('extension activation', () => {
  beforeEach(() => {
    resetVSCodeShim();
  });

  it('registers a smoke test command that confirms the extension is active', async () => {
    const context = {
      globalState: new MemoryMemento(),
      workspaceState: new MemoryMemento(),
      subscriptions: [] as Disposable[]
    };

    await activate(context);

    expect(commands.registeredCommandIds()).toEqual([
      SMOKE_COMMAND_ID,
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
    expect(window.registeredWebviewViewProviderIds()).toEqual([READER_VIEW_ID]);
    expect(languages.registeredInlineCompletionSelectors()).toEqual([{ pattern: '**' }]);
    expect(context.subscriptions).toHaveLength(28);

    const result = await commands.executeRegisteredCommand(SMOKE_COMMAND_ID);

    expect(result).toBe(SMOKE_MESSAGE);
    expect(window.informationMessages).toEqual([SMOKE_MESSAGE]);
  });

  it('migrates legacy TXT records before registration and remains idempotent across activation', async () => {
    const globalState = new MemoryMemento({
      [TXT_LIBRARY_KEY]: [{
        id: 'legacy-1', name: 'legacy.txt', uri: 'file:///legacy.txt', encoding: 'utf8',
        source: 'external', createdAt: 1, updatedAt: 1
      }]
    });
    const workspaceState = new MemoryMemento();

    await activate({ globalState, workspaceState, subscriptions: [] as Disposable[] });
    const firstBooks = globalState.get<unknown[]>(BOOK_LIBRARY_KEY);
    const firstMarker = globalState.get(READER_V2_MIGRATION_KEY);
    await activate({ globalState, workspaceState, subscriptions: [] as Disposable[] });

    expect(firstBooks).toHaveLength(1);
    expect(globalState.get(BOOK_LIBRARY_KEY)).toEqual(firstBooks);
    expect(globalState.get(READER_V2_MIGRATION_KEY)).toEqual(firstMarker);
  });
});
