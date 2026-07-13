import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { READER_VIEW_ID } from '../../reader/readerMessages';
import {
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  ROUTE_ENTER_COMMAND_ID,
  ROUTE_TAB_COMMAND_ID,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID
} from '../../extension';
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
  IMPORT_BOOK_COMMAND_ID,
  RELOCATE_BOOK_COMMAND_ID,
  REMOVE_BOOK_COMMAND_ID
} from '../../commands/libraryCommands';
import { TOGGLE_GIT_LOG_COMMAND_ID } from '../../git/gitLogModeCoordinator';

describe('package contributions', () => {
  it('exposes only v2 library commands', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));
    const commandIds = packageJson.contributes.commands.map((command: { command: string }) => command.command);

    expect(commandIds).toEqual(expect.arrayContaining([
      IMPORT_BOOK_COMMAND_ID,
      REMOVE_BOOK_COMMAND_ID,
      RELOCATE_BOOK_COMMAND_ID
    ]));
    expect(packageJson.activationEvents).not.toContain('onCommand:moyuplus.importTxt');
  });
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
        `onCommand:${TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID}`,
        `onCommand:${ROUTE_ENTER_COMMAND_ID}`,
        `onCommand:${ROUTE_TAB_COMMAND_ID}`
      ])
    );
    expect(commandIds).toEqual(
      expect.arrayContaining([
        START_TYPING_PRACTICE_COMMAND_ID,
        STOP_TYPING_PRACTICE_COMMAND_ID,
        NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
        RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
        JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
        TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID,
        ROUTE_ENTER_COMMAND_ID,
        ROUTE_TAB_COMMAND_ID
      ])
    );
  });

  it('contributes guarded keybindings and advanced shortcut settings', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));

    expect(packageJson.contributes.keybindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: ROUTE_ENTER_COMMAND_ID,
          key: 'enter',
          when: expect.stringContaining('config.moyuplus.shortcuts.enableEnterRouter')
        }),
        expect.objectContaining({
          command: ROUTE_TAB_COMMAND_ID,
          key: 'tab',
          when: expect.stringContaining('moyuplus.typingPracticeActive')
        })
      ])
    );
    expect(
      packageJson.contributes.keybindings.find((binding: { command: string }) => binding.command === ROUTE_TAB_COMMAND_ID)
        .when
    ).toContain('!suggestWidgetVisible');
    expect(
      packageJson.contributes.keybindings.find((binding: { command: string }) => binding.command === ROUTE_TAB_COMMAND_ID)
        .when
    ).toContain('!inSnippetMode');

    expect(packageJson.contributes.configuration.properties).toMatchObject({
      'moyuplus.shortcuts.enableEnterRouter': { type: 'boolean', default: false },
      'moyuplus.shortcuts.enableTabRouter': { type: 'boolean', default: false },
      'moyuplus.typing.tabMode': { enum: ['completeRest', 'replaceLine'], default: 'completeRest' },
      'moyuplus.enter.insertNewLine': { type: 'boolean', default: true },
      'moyuplus.enter.nextPracticeLine': { type: 'boolean', default: false },
      'moyuplus.enter.nextReaderPage': { type: 'boolean', default: false }
    });
    expect(packageJson.contributes.configuration.properties).toMatchObject({
      'moyuplus.shortcuts.enableEnterRouter': {
        description: expect.stringContaining('启用 Enter 路由')
      },
      'moyuplus.shortcuts.enableTabRouter': {
        description: expect.stringContaining('启用 Tab 路由')
      },
      'moyuplus.typing.tabMode': {
        description: expect.stringContaining('按 Tab 时如何使用当前练习行'),
        enumDescriptions: [
          expect.stringContaining('只插入'),
          expect.stringContaining('替换编辑器当前整行')
        ]
      },
      'moyuplus.enter.insertNewLine': {
        description: expect.stringContaining('插入真实换行')
      },
      'moyuplus.enter.nextPracticeLine': {
        description: expect.stringContaining('推进到下一条打字练习行')
      },
      'moyuplus.enter.nextReaderPage': {
        description: expect.stringContaining('阅读器翻到下一页')
      }
    });
  });

  it('contributes commands for every action shown on the shortcut settings page', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));
    const commandIds = packageJson.contributes.commands.map((command: { command: string }) => command.command);
    const settingsCommands = [
      NEXT_READER_PAGE_COMMAND_ID,
      PREVIOUS_READER_PAGE_COMMAND_ID,
      PREVIOUS_READER_CHAPTER_COMMAND_ID,
      NEXT_READER_CHAPTER_COMMAND_ID,
      OPEN_READER_LIBRARY_COMMAND_ID,
      OPEN_READER_TOC_COMMAND_ID,
      OPEN_READER_SETTINGS_COMMAND_ID,
      FOCUS_READER_COMMAND_ID,
      CLOSE_READER_COMMAND_ID,
      TOGGLE_GIT_LOG_COMMAND_ID,
      TOGGLE_TYPING_PRACTICE_COMMAND_ID
    ];

    expect(commandIds).toEqual(expect.arrayContaining(settingsCommands));
    expect(packageJson.activationEvents).toEqual(
      expect.arrayContaining(settingsCommands.map((commandId) => `onCommand:${commandId}`))
    );
  });

  it('binds the shortcut-only Git Log toggle globally while hiding it from the command palette', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));
    expect(packageJson.activationEvents).toContain(`onCommand:${TOGGLE_GIT_LOG_COMMAND_ID}`);
    expect(packageJson.contributes.commands).toContainEqual(expect.objectContaining({ command: TOGGLE_GIT_LOG_COMMAND_ID }));
    expect(packageJson.contributes.keybindings).toContainEqual({ command: TOGGLE_GIT_LOG_COMMAND_ID, key: 'alt+q' });
    expect(packageJson.contributes.menus.commandPalette).toContainEqual({ command: TOGGLE_GIT_LOG_COMMAND_ID, when: 'false' });
    expect(packageJson.contributes.commands).toContainEqual(expect.objectContaining({ command: CLOSE_READER_COMMAND_ID }));
  });
});
