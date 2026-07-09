import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { READER_VIEW_ID } from '../../reader/readerMessages';
import {
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID
} from '../../extension';

describe('package contributions', () => {
  it('contributes the reader webview to the VS Code sidebar', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));

    expect(packageJson.activationEvents).toContain(`onView:${READER_VIEW_ID}`);
    expect(packageJson.contributes.views.explorer).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: READER_VIEW_ID,
          type: 'webview',
          name: 'MoyuPlus Reader'
        })
      ])
    );
  });

  it('contributes typing practice commands to the command palette and activation events', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));
    const commandIds = packageJson.contributes.commands.map((command: { command: string }) => command.command);

    expect(packageJson.activationEvents).toEqual(
      expect.arrayContaining([
        `onCommand:${START_TYPING_PRACTICE_COMMAND_ID}`,
        `onCommand:${STOP_TYPING_PRACTICE_COMMAND_ID}`,
        `onCommand:${NEXT_TYPING_PRACTICE_LINE_COMMAND_ID}`,
        `onCommand:${RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID}`,
        `onCommand:${JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID}`,
        `onCommand:${TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID}`
      ])
    );
    expect(commandIds).toEqual(
      expect.arrayContaining([
        START_TYPING_PRACTICE_COMMAND_ID,
        STOP_TYPING_PRACTICE_COMMAND_ID,
        NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
        RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
        JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
        TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID
      ])
    );
  });
});
