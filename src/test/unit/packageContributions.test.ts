import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { READER_VIEW_ID } from '../../reader/readerMessages';
import {
  JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
  NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
  RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
  ROUTE_ENTER_COMMAND_ID,
  START_TYPING_PRACTICE_COMMAND_ID,
  STOP_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_COMMAND_ID,
  TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID
} from '../../extension';
import {
  CLOSE_READER_COMMAND_ID,
  FOCUS_READER_COMMAND_ID,
  NEXT_READER_PAGE_COMMAND_ID,
  PREVIOUS_READER_PAGE_COMMAND_ID,
  UNDO_READER_LOCATION_COMMAND_ID,
  STOP_IMMERSIVE_READING_COMMAND_ID
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
import { IMAGE_PREVIEW_VIEW_TYPE } from '../../reader/imagePreviewService';
import { OPEN_SETTINGS_COMMAND_ID } from '../../settings/MoyuPlusSettingsPanel';
import { TYPING_VIEW_ID } from '../../typing/adapters/view/typingViewProtocol';

describe('package contributions', () => {
  it('does not contribute the retired practice language or editor defaults', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));

    expect(packageJson.contributes.languages ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'moyuplus-practice' })])
    );
    expect(packageJson.contributes.configurationDefaults ?? {})
      .not.toHaveProperty('[moyuplus-practice]');
  });

  it('contributes the unified settings command to the editor context menu only', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));
    expect(packageJson.activationEvents).toContain(`onCommand:${OPEN_SETTINGS_COMMAND_ID}`);
    expect(packageJson.contributes.commands).toContainEqual({
      command: OPEN_SETTINGS_COMMAND_ID,
      title: 'MoyuPlus Settings'
    });
    expect(packageJson.contributes.menus['editor/context'] ?? []).toContainEqual(expect.objectContaining({
      command: OPEN_SETTINGS_COMMAND_ID
    }));
    expect(packageJson.contributes.menus['explorer/context'] ?? []).not.toContainEqual(expect.objectContaining({
      command: OPEN_SETTINGS_COMMAND_ID
    }));
  });

  it('contributes the in-memory readonly image preview editor', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));

    expect(packageJson.activationEvents).toContain(`onCustomEditor:${IMAGE_PREVIEW_VIEW_TYPE}`);
    expect(packageJson.contributes.customEditors).toContainEqual({
      viewType: IMAGE_PREVIEW_VIEW_TYPE,
      displayName: 'MoyuPlus Image Preview',
      selector: [{ filenamePattern: '*.moyuplus-image' }],
      priority: 'default'
    });
  });

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

  it('contributes Typing as an independent Activity Bar Webview', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));

    expect(packageJson.activationEvents).toContain(`onView:${TYPING_VIEW_ID}`);
    expect(packageJson.contributes.viewsContainers.activitybar).toContainEqual({
      id: 'moyuplus-typing',
      title: 'MoyuPlus Typing',
      icon: 'media/typing-view.svg'
    });
    expect(packageJson.contributes.views['moyuplus-typing']).toContainEqual({
      id: TYPING_VIEW_ID,
      type: 'webview',
      name: '打字练习'
    });
  });

  it('exposes a persistent virtual-keyboard switch in VS Code settings', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));
    const properties = packageJson.contributes.configuration.properties;

    expect(properties).toMatchObject({
      'moyuplus.typing.showVirtualKeyboard': {
        type: 'boolean',
        default: true,
        description: expect.stringContaining('虚拟键盘')
      },
      'moyuplus.typing.colorKeyboardHands': {
        type: 'boolean',
        default: true,
        description: expect.stringContaining('左手与右手')
      }
    });
  });

  it('keeps meaningful typing aliases visible and legacy activation compatibility', async () => {
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
        `onCommand:${ROUTE_ENTER_COMMAND_ID}`
      ])
    );
    expect(packageJson.activationEvents).not.toContain('onCommand:moyuplus.routeTab');
    expect(commandIds).toEqual(
      expect.arrayContaining([
        START_TYPING_PRACTICE_COMMAND_ID,
        STOP_TYPING_PRACTICE_COMMAND_ID,
        RESET_TYPING_PRACTICE_PROGRESS_COMMAND_ID,
        TOGGLE_TYPING_PRACTICE_COMMAND_ID,
        ROUTE_ENTER_COMMAND_ID
      ])
    );
    expect(commandIds).not.toEqual(expect.arrayContaining([
      NEXT_TYPING_PRACTICE_LINE_COMMAND_ID,
      JUMP_TO_TYPING_PRACTICE_LINE_COMMAND_ID,
      TOGGLE_TYPING_PRACTICE_LINE_EDGE_TRIM_COMMAND_ID,
      'moyuplus.routeTab'
    ]));
  });

  it('keeps the reader Enter router without old global typing Tab settings', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));

    expect(packageJson.contributes.keybindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: ROUTE_ENTER_COMMAND_ID,
          key: 'enter',
          when: expect.stringContaining('config.moyuplus.shortcuts.enableEnterRouter')
        }),
        {
          command: STOP_IMMERSIVE_READING_COMMAND_ID,
          key: 'alt+shift+q',
          when: 'moyuplus.immersiveReadingActive'
        }
      ])
    );
    expect(packageJson.contributes.keybindings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: 'moyuplus.routeTab' })
      ])
    );

    expect(packageJson.contributes.configuration.properties).toMatchObject({
      'moyuplus.shortcuts.enableEnterRouter': { type: 'boolean', default: false },
      'moyuplus.enter.insertNewLine': { type: 'boolean', default: true },
      'moyuplus.enter.nextReaderPage': { type: 'boolean', default: false }
    });
    expect(packageJson.contributes.configuration.properties).toMatchObject({
      'moyuplus.shortcuts.enableEnterRouter': {
        description: expect.stringContaining('启用 Enter 路由')
      },
      'moyuplus.enter.insertNewLine': {
        description: expect.stringContaining('插入真实换行')
      },
      'moyuplus.enter.nextReaderPage': {
        description: expect.stringContaining('阅读器翻到下一页')
      }
    });
    expect(packageJson.contributes.configuration.properties)
      .not.toHaveProperty('moyuplus.shortcuts.enableTabRouter');
    expect(packageJson.contributes.configuration.properties)
      .not.toHaveProperty('moyuplus.typing.tabMode');
    expect(packageJson.contributes.configuration.properties)
      .not.toHaveProperty('moyuplus.enter.nextPracticeLine');
  });

  it('does not contribute retired practice-editor commands or keybindings', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));
    const commandIds = packageJson.contributes.commands
      .map((command: { command: string }) => command.command);
    const retiredPrefix = 'moyuplus.typing.practice';

    expect(commandIds.some((id: string) => id.startsWith(retiredPrefix))).toBe(false);
    expect(packageJson.activationEvents.some(
      (event: string) => event.startsWith(`onCommand:${retiredPrefix}`)
    )).toBe(false);
    expect(packageJson.contributes.keybindings.some(
      (binding: { command: string; when?: string }) =>
        binding.command.startsWith(retiredPrefix)
        || binding.when?.includes('moyuplus-practice')
    )).toBe(false);
  });

  it('shows the English immersive stop command in the editor context menu only while active', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));

    expect(packageJson.contributes.commands).toContainEqual({
      command: STOP_IMMERSIVE_READING_COMMAND_ID,
      title: 'MoyuPlus: Stop Immersive Reading'
    });
    expect(packageJson.contributes.menus['editor/context'] ?? []).toContainEqual({
      command: STOP_IMMERSIVE_READING_COMMAND_ID,
      when: 'moyuplus.immersiveReadingActive',
      group: 'navigation@99'
    });
    expect(packageJson.contributes.keybindings).toContainEqual({
      command: STOP_IMMERSIVE_READING_COMMAND_ID,
      key: 'alt+shift+q',
      when: 'moyuplus.immersiveReadingActive'
    });
  });

  it('contributes commands for every action shown on the shortcut settings page', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../../package.json'), 'utf8'));
    const commandIds = packageJson.contributes.commands.map((command: { command: string }) => command.command);
    const settingsCommands = [
      NEXT_READER_PAGE_COMMAND_ID,
      PREVIOUS_READER_PAGE_COMMAND_ID,
      UNDO_READER_LOCATION_COMMAND_ID,
      PREVIOUS_READER_CHAPTER_COMMAND_ID,
      NEXT_READER_CHAPTER_COMMAND_ID,
      OPEN_READER_LIBRARY_COMMAND_ID,
      OPEN_READER_TOC_COMMAND_ID,
      OPEN_READER_SETTINGS_COMMAND_ID,
      FOCUS_READER_COMMAND_ID,
      CLOSE_READER_COMMAND_ID,
      STOP_IMMERSIVE_READING_COMMAND_ID,
      TOGGLE_GIT_LOG_COMMAND_ID,
      TOGGLE_TYPING_PRACTICE_COMMAND_ID
    ];

    expect(commandIds).toEqual(expect.arrayContaining(settingsCommands));
    expect(packageJson.activationEvents).toEqual(
      expect.arrayContaining(settingsCommands.map((commandId) => `onCommand:${commandId}`))
    );
    expect(packageJson.contributes.keybindings).not.toContainEqual(
      expect.objectContaining({ command: UNDO_READER_LOCATION_COMMAND_ID })
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
