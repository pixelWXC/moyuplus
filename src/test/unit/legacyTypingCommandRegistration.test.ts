import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  SHOW_TYPING_PRACTICE_MENU_COMMAND_ID,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID,
  registerLegacyTypingCommandAliases
} from '../../typing/registration/legacyTypingCommandRegistration';
import {
  commands,
  resetVSCodeShim,
  type Disposable,
  window
} from '../shims/vscode';

beforeEach(() => {
  resetVSCodeShim();
});

describe('legacy typing command aliases', () => {
  it('routes retained public ids only to the new view/application ports', async () => {
    let active = false;
    const openPage = vi.fn(async () => undefined);
    const controlPractice = vi.fn(async (
      action: 'restart' | 'finish'
    ) => action === 'finish' ? 'result' as const : 'live' as const);
    registerLegacyTypingCommandAliases(
      { subscriptions: [] as Disposable[] },
      {
        openPage,
        controlPractice,
        hasActivePractice: async () => active
      }
    );

    await commands.executeRegisteredCommand(START_TYPING_PRACTICE_COMMAND_ID);
    expect(openPage).toHaveBeenLastCalledWith('materials');

    active = true;
    await commands.executeRegisteredCommand(
      RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID
    );
    expect(controlPractice).toHaveBeenLastCalledWith('restart');
    expect(openPage).toHaveBeenLastCalledWith('live');

    await commands.executeRegisteredCommand(STOP_TYPING_PRACTICE_COMMAND_ID);
    expect(controlPractice).toHaveBeenLastCalledWith('finish');
    expect(openPage).toHaveBeenLastCalledWith('result');

    await commands.executeRegisteredCommand(TOGGLE_TYPING_PRACTICE_COMMAND_ID);
    expect(controlPractice).toHaveBeenLastCalledWith('finish');

    active = false;
    await commands.executeRegisteredCommand(TOGGLE_TYPING_PRACTICE_COMMAND_ID);
    expect(openPage).toHaveBeenLastCalledWith('materials');
  });

  it('keeps obsolete ids as deprecation-only adapters without old behavior', async () => {
    const openPage = vi.fn(async () => undefined);
    registerLegacyTypingCommandAliases(
      { subscriptions: [] as Disposable[] },
      {
        openPage,
        controlPractice: async () => 'materials',
        hasActivePractice: async () => false
      }
    );

    for (const commandId of [
      NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
      JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
      TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID,
      SHOW_TYPING_PRACTICE_MENU_COMMAND_ID
    ]) {
      await commands.executeRegisteredCommand(commandId);
    }

    expect(window.informationMessages).toHaveLength(4);
    expect(window.informationMessages.every(message => (
      message.includes('新版打字练习')
    ))).toBe(true);
    expect(openPage).toHaveBeenCalledTimes(4);
  });

  it('does not import or name the old controller and inline stack', async () => {
    const source = await readFile(
      path.resolve(
        __dirname,
        '../../typing/registration/legacyTypingCommandRegistration.ts'
      ),
      'utf8'
    );

    expect(source).not.toContain('TypingPracticeController');
    expect(source).not.toContain('InlineCompletion');
    expect(source).not.toContain('createStatusBarItem');
    expect(source).not.toContain('typingPracticeActive');
  });
});
