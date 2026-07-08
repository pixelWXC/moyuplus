import { beforeEach, describe, expect, it } from 'vitest';
import {
  activate,
  CHECK_IMPORTED_TXT_COMMAND_ID,
  IMPORT_TXT_COMMAND_ID,
  REMOVE_IMPORTED_TXT_COMMAND_ID,
  SMOKE_COMMAND_ID,
  SMOKE_MESSAGE
} from '../../extension';
import { READER_VIEW_ID } from '../../reader/readerMessages';
import { commands, resetVSCodeShim, type Disposable, window } from '../shims/vscode';

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
      CHECK_IMPORTED_TXT_COMMAND_ID
    ]);
    expect(window.registeredWebviewViewProviderIds()).toEqual([READER_VIEW_ID]);
    expect(context.subscriptions).toHaveLength(5);

    const result = await commands.executeRegisteredCommand(SMOKE_COMMAND_ID);

    expect(result).toBe(SMOKE_MESSAGE);
    expect(window.informationMessages).toEqual([SMOKE_MESSAGE]);
  });
});
