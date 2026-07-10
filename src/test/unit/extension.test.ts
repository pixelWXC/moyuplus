import { beforeEach, describe, expect, it } from 'vitest';
import {
  activate,
  CHECK_IMPORTED_TXT_COMMAND_ID,
  IMPORT_TXT_COMMAND_ID,
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  REMOVE_IMPORTED_TXT_COMMAND_ID,
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
import { READER_VIEW_ID } from '../../reader/readerMessages';
import {
  CLOSE_READER_COMMAND_ID,
  DECREASE_READER_FONT_COMMAND_ID,
  FOCUS_READER_COMMAND_ID,
  INCREASE_READER_FONT_COMMAND_ID,
  NEXT_READER_PAGE_COMMAND_ID,
  PREVIOUS_READER_PAGE_COMMAND_ID,
  SELECT_READER_FILE_COMMAND_ID
} from '../../shortcuts/shortcutSettings';
import { commands, languages, resetVSCodeShim, type Disposable, window } from '../shims/vscode';

class MemoryMemento {
  get<T>(): T | undefined {
    return undefined;
  }

  async update(): Promise<void> {}
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

    activate(context);

    expect(commands.registeredCommandIds()).toEqual([
      SMOKE_COMMAND_ID,
      IMPORT_TXT_COMMAND_ID,
      REMOVE_IMPORTED_TXT_COMMAND_ID,
      CHECK_IMPORTED_TXT_COMMAND_ID,
      NEXT_READER_PAGE_COMMAND_ID,
      PREVIOUS_READER_PAGE_COMMAND_ID,
      FOCUS_READER_COMMAND_ID,
      CLOSE_READER_COMMAND_ID,
      SELECT_READER_FILE_COMMAND_ID,
      INCREASE_READER_FONT_COMMAND_ID,
      DECREASE_READER_FONT_COMMAND_ID,
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
    expect(context.subscriptions).toHaveLength(24);

    const result = await commands.executeRegisteredCommand(SMOKE_COMMAND_ID);

    expect(result).toBe(SMOKE_MESSAGE);
    expect(window.informationMessages).toEqual([SMOKE_MESSAGE]);
  });
});
