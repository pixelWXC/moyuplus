import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID
} from '../../typing/registration';

const LEGACY_GLOBAL_TAB_COMMAND_ID = 'moyuplus.routeTab';

describe('typing package cutover', () => {
  it('keeps only meaningful new-system aliases in the public UI', async () => {
    const manifest = JSON.parse(await readFile(
      path.resolve(__dirname, '../../../package.json'),
      'utf8'
    ));
    const commandIds = manifest.contributes.commands.map(
      (command: { command: string }) => command.command
    );

    expect(commandIds).toEqual(expect.arrayContaining([
      START_TYPING_PRACTICE_COMMAND_ID,
      STOP_TYPING_PRACTICE_COMMAND_ID,
      RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
      TOGGLE_TYPING_PRACTICE_COMMAND_ID
    ]));
    expect(commandIds).not.toEqual(expect.arrayContaining([
      NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
      JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
      TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID,
      LEGACY_GLOBAL_TAB_COMMAND_ID
    ]));
  });

  it('removes old global Tab/physical-line controls from keys and settings', async () => {
    const manifest = JSON.parse(await readFile(
      path.resolve(__dirname, '../../../package.json'),
      'utf8'
    ));
    const keybindings = manifest.contributes.keybindings as {
      command: string;
      when?: string;
    }[];

    expect(keybindings.some(binding => (
      binding.command === LEGACY_GLOBAL_TAB_COMMAND_ID
    ))).toBe(false);
    expect(keybindings.some(binding => (
      binding.when?.includes('moyuplus.typingPracticeActive')
    ))).toBe(false);
    expect(manifest.contributes).not.toHaveProperty('configuration');
  });

  it('documents browser composition facts and real Windows IME acceptance', async () => {
    const files = [
      'README.md',
      'docs/typing-practice-settings.md',
      'docs/typing-practice-verification.md'
    ];
    const combined = (await Promise.all(files.map(file => readFile(
      path.resolve(__dirname, '../../..', file),
      'utf8'
    )))).join('\n');

    expect(combined).toContain('composition');
    expect(combined).toContain('Windows 微软拼音人工矩阵');
    expect(combined).toContain('候选切换');
    expect(combined).toContain('Esc 取消');
    expect(combined).not.toContain('resourceScheme == moyuplus-practice');
    expect(combined).not.toContain('npm run test:typing-ime-manual');
    expect(combined).not.toContain('[moyuplus-practice]');
  });
});
