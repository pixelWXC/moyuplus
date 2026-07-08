import { beforeEach, describe, expect, it } from 'vitest';
import { activate, SMOKE_COMMAND_ID, SMOKE_MESSAGE } from '../../extension';
import { commands, resetVSCodeShim, type Disposable, window } from '../shims/vscode';

describe('extension activation', () => {
  beforeEach(() => {
    resetVSCodeShim();
  });

  it('registers a smoke test command that confirms the extension is active', async () => {
    const context = { subscriptions: [] as Disposable[] };

    activate(context);

    expect(commands.registeredCommandIds()).toEqual([SMOKE_COMMAND_ID]);
    expect(context.subscriptions).toHaveLength(1);

    const result = await commands.executeRegisteredCommand(SMOKE_COMMAND_ID);

    expect(result).toBe(SMOKE_MESSAGE);
    expect(window.informationMessages).toEqual([SMOKE_MESSAGE]);
  });
});
